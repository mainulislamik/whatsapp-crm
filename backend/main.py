import os
import sys
import django

# Setup Django standalone environment before importing any models
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'django_core.settings')
django.setup()

import asyncio
import httpx
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from asgiref.sync import sync_to_async

from crm_core.models import Contact, MessageTemplate, Campaign, CampaignLog

WHATSAPP_ENGINE_URL = os.environ.get('WHATSAPP_ENGINE_URL', 'http://whatsapp-engine:5001')

app = FastAPI(title="WhatsApp CRM Backend API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Schemas
class ContactCreate(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    tags: Optional[str] = ""
    notes: Optional[str] = ""

class ContactUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    tags: Optional[str] = None
    notes: Optional[str] = None

class TemplateCreate(BaseModel):
    name: str
    content: str
    category: Optional[str] = "General"

class DirectSendRequest(BaseModel):
    phone: str
    message: str

class BulkSendRequest(BaseModel):
    title: str
    message_template: str
    contact_ids: List[int]
    delay_seconds: Optional[int] = 5

# --- HEALTH & WHATSAPP ENGINE PROXY ---

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

@app.get("/api/whatsapp/status")
async def get_whatsapp_status():
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(f"{WHATSAPP_ENGINE_URL}/status")
            return resp.json()
        except Exception as e:
            return {"status": "DISCONNECTED", "error": f"Engine unreachable: {str(e)}", "hasQr": False}

@app.get("/api/whatsapp/qr")
async def get_whatsapp_qr():
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(f"{WHATSAPP_ENGINE_URL}/qr")
            return resp.json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Cannot reach WhatsApp engine: {str(e)}")

@app.post("/api/whatsapp/logout")
async def logout_whatsapp():
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(f"{WHATSAPP_ENGINE_URL}/logout")
            return resp.json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Cannot logout: {str(e)}")

@app.post("/api/whatsapp/restart")
async def restart_whatsapp():
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(f"{WHATSAPP_ENGINE_URL}/restart")
            return resp.json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Cannot restart: {str(e)}")

# --- CONTACTS CRUD ---

@app.get("/api/contacts")
async def list_contacts(search: Optional[str] = None, tag: Optional[str] = None):
    def _query():
        qs = Contact.objects.all()
        if search:
            qs = qs.filter(name__icontains=search) | qs.filter(phone__icontains=search)
        if tag:
            qs = qs.filter(tags__icontains=tag)
        return [
            {
                "id": c.id,
                "name": c.name,
                "phone": c.phone,
                "email": c.email,
                "tags": c.tags,
                "notes": c.notes,
                "created_at": c.created_at.isoformat()
            }
            for c in qs
        ]
    return await sync_to_async(_query)()

@app.post("/api/contacts")
async def create_contact(payload: ContactCreate):
    def _create():
        phone = payload.phone.strip().replace(" ", "").replace("-", "")
        contact, created = Contact.objects.update_or_create(
            phone=phone,
            defaults={
                "name": payload.name.strip(),
                "email": payload.email,
                "tags": payload.tags or "",
                "notes": payload.notes or ""
            }
        )
        return {
            "id": contact.id,
            "name": contact.name,
            "phone": contact.phone,
            "tags": contact.tags,
            "created": created
        }
    try:
        return await sync_to_async(_create)()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/contacts/{contact_id}")
async def delete_contact(contact_id: int):
    def _delete():
        count, _ = Contact.objects.filter(id=contact_id).delete()
        return count > 0
    deleted = await sync_to_async(_delete)()
    if not deleted:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"success": True}

@app.post("/api/contacts/import-csv")
async def import_contacts_csv(file: UploadFile = File(...)):
    contents = await file.read()
    text = contents.decode("utf-8", errors="ignore")
    import csv
    import io
    reader = csv.DictReader(io.StringIO(text))

    imported = 0
    updated = 0

    def _save_batch(rows):
        nonlocal imported, updated
        for row in rows:
            name = row.get("Name") or row.get("name") or row.get("NAME") or "Unknown"
            phone = row.get("Phone") or row.get("phone") or row.get("Mobile") or row.get("mobile") or ""
            phone = str(phone).strip().replace(" ", "").replace("-", "")
            if not phone:
                continue
            email = row.get("Email") or row.get("email") or ""
            tags = row.get("Tags") or row.get("tags") or row.get("Tag") or ""
            notes = row.get("Notes") or row.get("notes") or ""

            _, created = Contact.objects.update_or_create(
                phone=phone,
                defaults={"name": name, "email": email or None, "tags": tags, "notes": notes}
            )
            if created:
                imported += 1
            else:
                updated += 1

    await sync_to_async(_save_batch)(list(reader))
    return {"success": True, "imported": imported, "updated": updated}

# --- MESSAGE TEMPLATES ---

@app.get("/api/templates")
async def list_templates():
    def _query():
        return [
            {
                "id": t.id,
                "name": t.name,
                "content": t.content,
                "category": t.category,
                "created_at": t.created_at.isoformat()
            }
            for t in MessageTemplate.objects.all()
        ]
    return await sync_to_async(_query)()

@app.post("/api/templates")
async def create_template(payload: TemplateCreate):
    def _create():
        t = MessageTemplate.objects.create(
            name=payload.name.strip(),
            content=payload.content.strip(),
            category=payload.category or "General"
        )
        return {"id": t.id, "name": t.name, "content": t.content, "category": t.category}
    return await sync_to_async(_create)()

@app.delete("/api/templates/{template_id}")
async def delete_template(template_id: int):
    def _delete():
        count, _ = MessageTemplate.objects.filter(id=template_id).delete()
        return count > 0
    deleted = await sync_to_async(_delete)()
    if not deleted:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"success": True}

# --- DIRECT & BULK SENDING LOGIC ---

@app.post("/api/messages/send-direct")
async def send_direct_message(payload: DirectSendRequest):
    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            resp = await client.post(
                f"{WHATSAPP_ENGINE_URL}/send",
                json={"to": payload.phone, "text": payload.message}
            )
            data = resp.json()
            if resp.status_code != 200 or not data.get("success"):
                raise HTTPException(status_code=400, detail=data.get("error", "Failed to send"))
            return data
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

async def run_campaign_worker(campaign_id: int, delay_seconds: int):
    def _get_campaign_and_logs():
        camp = Campaign.objects.get(id=campaign_id)
        camp.status = 'RUNNING'
        camp.save()
        logs = list(camp.logs.filter(status='PENDING'))
        return camp, logs

    camp, logs = await sync_to_async(_get_campaign_and_logs)()

    async with httpx.AsyncClient(timeout=25.0) as client:
        for log in logs:
            try:
                resp = await client.post(
                    f"{WHATSAPP_ENGINE_URL}/send",
                    json={"to": log.phone, "text": log.message}
                )
                data = resp.json()
                if resp.status_code == 200 and data.get("success"):
                    def _update_success(l_id):
                        l = CampaignLog.objects.get(id=l_id)
                        l.status = 'SENT'
                        l.sent_at = datetime.now()
                        l.save()
                        Campaign.objects.filter(id=campaign_id).update(sent_count=django.db.models.F('sent_count') + 1)
                    await sync_to_async(_update_success)(log.id)
                else:
                    def _update_fail(l_id, err):
                        l = CampaignLog.objects.get(id=l_id)
                        l.status = 'FAILED'
                        l.error_message = err
                        l.save()
                        Campaign.objects.filter(id=campaign_id).update(failed_count=django.db.models.F('failed_count') + 1)
                    await sync_to_async(_update_fail)(log.id, data.get("error", "Failed"))
            except Exception as e:
                def _update_err(l_id, err):
                    l = CampaignLog.objects.get(id=l_id)
                    l.status = 'FAILED'
                    l.error_message = str(err)
                    l.save()
                    Campaign.objects.filter(id=campaign_id).update(failed_count=django.db.models.F('failed_count') + 1)
                await sync_to_async(_update_err)(log.id, e)

            # Anti-ban sleep interval
            await asyncio.sleep(max(delay_seconds, 2))

    def _finish_campaign():
        c = Campaign.objects.get(id=campaign_id)
        c.status = 'COMPLETED'
        c.completed_at = datetime.now()
        c.save()

    await sync_to_async(_finish_campaign)()

@app.post("/api/campaigns")
async def create_and_start_campaign(payload: BulkSendRequest, background_tasks: BackgroundTasks):
    def _create_campaign_records():
        contacts = list(Contact.objects.filter(id__in=payload.contact_ids))
        if not contacts:
            return None, "No valid contacts selected"

        campaign = Campaign.objects.create(
            title=payload.title,
            template_content=payload.message_template,
            total_recipients=len(contacts),
            delay_seconds=payload.delay_seconds or 5,
            status='PENDING'
        )

        logs_to_create = []
        for c in contacts:
            # Variable replacement: {name}, {phone}
            customized = payload.message_template.replace("{name}", c.name).replace("{phone}", c.phone)
            logs_to_create.append(CampaignLog(
                campaign=campaign,
                contact_name=c.name,
                phone=c.phone,
                message=customized,
                status='PENDING'
            ))
        CampaignLog.objects.bulk_create(logs_to_create)
        return campaign.id, None

    campaign_id, error = await sync_to_async(_create_campaign_records)()
    if error:
        raise HTTPException(status_code=400, detail=error)

    # Launch in background worker
    background_tasks.add_task(run_campaign_worker, campaign_id, payload.delay_seconds or 5)

    return {
        "success": True,
        "campaign_id": campaign_id,
        "message": f"Campaign '{payload.title}' scheduled for execution in background"
    }

@app.get("/api/campaigns")
async def list_campaigns():
    def _query():
        return [
            {
                "id": c.id,
                "title": c.title,
                "template_content": c.template_content,
                "total_recipients": c.total_recipients,
                "sent_count": c.sent_count,
                "failed_count": c.failed_count,
                "status": c.status,
                "delay_seconds": c.delay_seconds,
                "created_at": c.created_at.isoformat(),
                "completed_at": c.completed_at.isoformat() if c.completed_at else None
            }
            for c in Campaign.objects.all()
        ]
    return await sync_to_async(_query)()

@app.get("/api/campaigns/{campaign_id}/logs")
async def get_campaign_logs(campaign_id: int):
    def _query():
        camp = Campaign.objects.filter(id=campaign_id).first()
        if not camp:
            return None
        logs = [
            {
                "id": l.id,
                "contact_name": l.contact_name,
                "phone": l.phone,
                "message": l.message,
                "status": l.status,
                "error_message": l.error_message,
                "sent_at": l.sent_at.isoformat() if l.sent_at else None
            }
            for l in camp.logs.all()
        ]
        return {
            "campaign_id": camp.id,
            "title": camp.title,
            "status": camp.status,
            "sent_count": camp.sent_count,
            "failed_count": camp.failed_count,
            "total_recipients": camp.total_recipients,
            "logs": logs
        }
    result = await sync_to_async(_query)()
    if not result:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return result
