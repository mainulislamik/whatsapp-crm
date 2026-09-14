import os
import sys
import django

# Setup Django standalone environment before importing any models
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'django_core.settings')
django.setup()

import asyncio
import httpx
import re
import random
import csv
import io
from datetime import datetime, timezone
from django.utils import timezone as django_tz
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from asgiref.sync import sync_to_async

from crm_core.models import Contact, MessageTemplate, Campaign, CampaignLog

WHATSAPP_ENGINE_URL = os.environ.get('WHATSAPP_ENGINE_URL', 'http://whatsapp-engine:5001')

# --- SPINTAX HELPER ---
def parse_spintax(text: str) -> str:
    """
    Parses Spintax format like {{Hello|Hi|Hey}} or {Hello|Hi|Hey} and randomly chooses one variant.
    Repeats until all nested groups are resolved.
    """
    pattern = re.compile(r'\{([^{}]+)\}')
    while True:
        match = pattern.search(text)
        if not match:
            break
        options = match.group(1).split('|')
        choice = random.choice(options)
        text = text[:match.start()] + choice + text[match.end():]
    return text

# --- BACKGROUND SCHEDULER ---
async def scheduled_campaign_checker():
    """Periodically check for scheduled campaigns whose scheduled_at is now or past."""
    while True:
        try:
            await asyncio.sleep(15)
            now = django_tz.now()

            def _get_due_campaigns():
                return list(Campaign.objects.filter(status='SCHEDULED', scheduled_at__lte=now).values_list('id', 'delay_seconds'))

            due_campaigns = await sync_to_async(_get_due_campaigns)()
            for camp_id, delay_sec in due_campaigns:
                asyncio.create_task(run_campaign_worker(camp_id, delay_sec or 5))
        except Exception as e:
            print("Error in scheduler:", e)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start background scheduler
    task = asyncio.create_task(scheduled_campaign_checker())
    yield
    # Shutdown: Cancel scheduler
    task.cancel()

app = FastAPI(title="WhatsApp CRM Backend API", version="2.0.0", lifespan=lifespan)

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

class TemplateCreate(BaseModel):
    name: str
    content: str
    category: Optional[str] = "General"

class DirectSendRequest(BaseModel):
    phone: str
    message: Optional[str] = ""
    media_base64: Optional[str] = None
    media_type: Optional[str] = None # 'image' or 'document'
    file_name: Optional[str] = None
    mime_type: Optional[str] = None

class BulkSendRequest(BaseModel):
    title: str
    message_template: str
    contact_ids: List[int]
    delay_seconds: Optional[int] = 5
    media_base64: Optional[str] = None
    media_type: Optional[str] = None # 'image' or 'document'
    file_name: Optional[str] = None
    mime_type: Optional[str] = None
    scheduled_at: Optional[str] = None # ISO format string

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

# --- CONTACTS CRUD & TAGS ---

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

@app.get("/api/contacts/tags")
async def list_contact_tags():
    """Returns unique tags across all contacts with count."""
    def _get_tags():
        tag_counts = {}
        for c in Contact.objects.values_list('tags', flat=True):
            if c:
                for t in c.split(','):
                    t = t.strip()
                    if t:
                        tag_counts[t] = tag_counts.get(t, 0) + 1
        return [{"tag": k, "count": v} for k, v in sorted(tag_counts.items())]
    return await sync_to_async(_get_tags)()

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
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            req_data = {
                "to": payload.phone,
                "text": payload.message or "",
                "mediaBase64": payload.media_base64,
                "mediaType": payload.media_type,
                "fileName": payload.file_name,
                "mimeType": payload.mime_type
            }
            resp = await client.post(f"{WHATSAPP_ENGINE_URL}/send", json=req_data)
            data = resp.json()
            if resp.status_code != 200 or not data.get("success"):
                raise HTTPException(status_code=400, detail=data.get("error", "Failed to send"))
            return data
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

async def run_campaign_worker(campaign_id: int, base_delay: int):
    def _get_campaign_and_logs():
        camp = Campaign.objects.get(id=campaign_id)
        if camp.status == 'CANCELLED':
            return None, []
        camp.status = 'RUNNING'
        camp.save()
        logs = list(camp.logs.filter(status='PENDING'))
        return camp, logs

    camp, logs = await sync_to_async(_get_campaign_and_logs)()
    if not camp:
        return

    async with httpx.AsyncClient(timeout=35.0) as client:
        for log in logs:
            # Check if campaign got cancelled mid-way
            def _is_cancelled():
                return Campaign.objects.filter(id=campaign_id, status='CANCELLED').exists()
            if await sync_to_async(_is_cancelled)():
                break

            try:
                req_data = {
                    "to": log.phone,
                    "text": log.message,
                    "mediaBase64": camp.media_base64,
                    "mediaType": camp.media_type,
                    "fileName": camp.file_name,
                    "mimeType": camp.mime_type
                }
                resp = await client.post(f"{WHATSAPP_ENGINE_URL}/send", json=req_data)
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

            # Smart Anti-ban Sleep with Random Jitter (e.g. 5s -> random 3.5s to 6.5s)
            jitter = random.uniform(-1.5, 1.5)
            actual_delay = max(2.0, base_delay + jitter)
            await asyncio.sleep(actual_delay)

    def _finish_campaign():
        c = Campaign.objects.get(id=campaign_id)
        if c.status != 'CANCELLED':
            c.status = 'COMPLETED'
        c.completed_at = datetime.now()
        c.save()

    await sync_to_async(_finish_campaign)()

@app.post("/api/campaigns")
async def create_and_start_campaign(payload: BulkSendRequest, background_tasks: BackgroundTasks):
    def _create_campaign_records():
        contacts = list(Contact.objects.filter(id__in=payload.contact_ids))
        if not contacts:
            return None, False, "No valid contacts selected"

        is_scheduled = False
        parsed_schedule = None
        if payload.scheduled_at:
            try:
                parsed_schedule = datetime.fromisoformat(payload.scheduled_at.replace("Z", "+00:00"))
                is_scheduled = True
            except Exception:
                pass

        campaign = Campaign.objects.create(
            title=payload.title,
            template_content=payload.message_template,
            total_recipients=len(contacts),
            delay_seconds=payload.delay_seconds or 5,
            status='SCHEDULED' if is_scheduled else 'PENDING',
            media_base64=payload.media_base64,
            media_type=payload.media_type,
            file_name=payload.file_name,
            mime_type=payload.mime_type,
            scheduled_at=parsed_schedule
        )

        logs_to_create = []
        for c in contacts:
            # 1. Variable replacement FIRST: {name}, {phone} (must run before spintax so tags keep their braces)
            personalized = payload.message_template.replace("{name}", c.name).replace("{phone}", c.phone)
            # 2. THEN spintax parsing for unique message variation per contact
            customized = parse_spintax(personalized)

            logs_to_create.append(CampaignLog(
                campaign=campaign,
                contact_name=c.name,
                phone=c.phone,
                message=customized,
                has_media=bool(payload.media_base64),
                status='PENDING'
            ))
        CampaignLog.objects.bulk_create(logs_to_create)
        return campaign.id, is_scheduled, None

    campaign_id, is_scheduled, error = await sync_to_async(_create_campaign_records)()
    if error:
        raise HTTPException(status_code=400, detail=error)

    if not is_scheduled:
        background_tasks.add_task(run_campaign_worker, campaign_id, payload.delay_seconds or 5)
        msg = f"Campaign '{payload.title}' started in background"
    else:
        msg = f"Campaign '{payload.title}' scheduled for {payload.scheduled_at}"

    return {
        "success": True,
        "campaign_id": campaign_id,
        "is_scheduled": is_scheduled,
        "message": msg
    }

@app.post("/api/campaigns/{campaign_id}/cancel")
async def cancel_campaign(campaign_id: int):
    def _cancel():
        camp = Campaign.objects.filter(id=campaign_id).first()
        if not camp:
            return False
        camp.status = 'CANCELLED'
        camp.save()
        camp.logs.filter(status='PENDING').update(status='FAILED', error_message='Cancelled by user')
        return True
    success = await sync_to_async(_cancel)()
    if not success:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return {"success": True, "message": "Campaign cancelled"}

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
                "has_media": bool(c.media_base64),
                "media_type": c.media_type,
                "file_name": c.file_name,
                "scheduled_at": c.scheduled_at.isoformat() if c.scheduled_at else None,
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
                "has_media": l.has_media,
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
            "has_media": bool(camp.media_base64),
            "file_name": camp.file_name,
            "logs": logs
        }
    result = await sync_to_async(_query)()
    if not result:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return result

@app.get("/api/campaigns/{campaign_id}/export-csv")
async def export_campaign_logs_csv(campaign_id: int):
    """Exports campaign logs to downloadable CSV."""
    def _generate_csv():
        camp = Campaign.objects.filter(id=campaign_id).first()
        if not camp:
            return None
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Campaign ID", "Title", "Contact Name", "Phone", "Status", "Has Media", "Sent At", "Error Message", "Message Text"])
        for l in camp.logs.all():
            writer.writerow([
                camp.id,
                camp.title,
                l.contact_name,
                l.phone,
                l.status,
                "Yes" if l.has_media else "No",
                l.sent_at.isoformat() if l.sent_at else "",
                l.error_message or "",
                l.message
            ])
        output.seek(0)
        return output.getvalue()

    csv_data = await sync_to_async(_generate_csv)()
    if not csv_data:
        raise HTTPException(status_code=404, detail="Campaign not found")

    return StreamingResponse(
        io.StringIO(csv_data),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=campaign_{campaign_id}_report.csv"}
    )
