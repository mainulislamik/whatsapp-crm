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
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from asgiref.sync import sync_to_async

from crm_core.models import Contact, MessageTemplate, Campaign, CampaignLog, Lead, LeadCategory, ChatMessage
from crm_core.ai_enricher import enrich_phone_intelligence

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

os.makedirs("/app/media", exist_ok=True)
app.mount("/media", StaticFiles(directory="/app/media"), name="media")

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

class LeadCategoryCreate(BaseModel):
    name: str
    description: Optional[str] = ""

class LeadCreate(BaseModel):
    phone: str
    shop_name: str
    owner_name: Optional[str] = ""
    category: Optional[str] = "General"
    shop_type: Optional[str] = "Retail"
    address: Optional[str] = ""
    notes: Optional[str] = ""
    status: Optional[str] = "NEW"
    force_save: Optional[bool] = False

class LeadUpdate(BaseModel):
    phone: Optional[str] = None
    shop_name: Optional[str] = None
    owner_name: Optional[str] = None
    category: Optional[str] = None
    shop_type: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None

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

# --- LEAD MANAGEMENT HELPERS & ENDPOINTS ---

def normalize_phone_digits(phone: str) -> str:
    cleaned = re.sub(r'\D', '', str(phone))
    if cleaned.startswith('88') and len(cleaned) == 13:
        cleaned = cleaned[2:]
    return cleaned

def check_phone_duplicate(phone: str, exclude_lead_id: Optional[int] = None):
    norm = normalize_phone_digits(phone)
    if not norm:
        return {"is_duplicate": False}

    # 1. Check in Contacts
    for c in Contact.objects.all():
        if normalize_phone_digits(c.phone) == norm:
            return {
                "is_duplicate": True,
                "type": "Contact",
                "name": c.name,
                "phone": c.phone,
                "id": c.id
            }

    # 2. Check in Leads
    lead_query = Lead.objects.all()
    if exclude_lead_id:
        lead_query = lead_query.exclude(id=exclude_lead_id)
    for l in lead_query:
        if normalize_phone_digits(l.phone) == norm:
            return {
                "is_duplicate": True,
                "type": "Lead",
                "name": l.shop_name,
                "phone": l.phone,
                "id": l.id,
                "category": l.category
            }

    return {"is_duplicate": False}

async def fetch_whatsapp_contact_info(phone: str):
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(f"{WHATSAPP_ENGINE_URL}/check-contact?phone={phone}")
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        print(f"Failed to check WhatsApp contact for {phone}:", e)
    return {"connected": False, "exists": False}

@app.get("/api/leads/check-phone")
async def check_lead_phone(phone: str = Query(...), exclude_id: Optional[int] = Query(None)):
    result = await sync_to_async(check_phone_duplicate)(phone, exclude_id)
    return result

@app.get("/api/leads/scan-phone")
async def scan_lead_phone(phone: str = Query(...)):
    result = await fetch_whatsapp_contact_info(phone)
    return result

@app.get("/api/leads/ai-enrich")
async def ai_enrich_lead_phone(phone: str = Query(...)):
    try:
        wa_data = await fetch_whatsapp_contact_info(phone)
        enriched = await enrich_phone_intelligence(phone, wa_data)
        return enriched
    except Exception as e:
        print(f"Error in ai_enrich_lead_phone for {phone}:", e)
        return {
            "phone": phone,
            "is_on_whatsapp": False,
            "shop_name": "",
            "owner_name": "",
            "category": "General",
            "shop_type": "Retail",
            "address": "",
            "notes": "",
            "sources_found": [],
            "confidence": "low",
            "error": str(e)
        }

@app.get("/api/lead-categories")
async def list_lead_categories():
    def _get_cats():
        # Seed default categories if none exist
        if not LeadCategory.objects.exists():
            default_cats = [
                'Fashion', 'Supershop & Grocery', 'Mobile Repair & Tech',
                'Electronics', 'Wholesale', 'Pharmacy', 'General'
            ]
            for c_name in default_cats:
                LeadCategory.objects.get_or_create(name=c_name)
        return list(LeadCategory.objects.all().values('id', 'name', 'description', 'created_at'))
    cats = await sync_to_async(_get_cats)()
    return cats

@app.post("/api/lead-categories")
async def create_lead_category(payload: LeadCategoryCreate):
    def _create():
        name = payload.name.strip()
        if not name:
            return None
        cat, created = LeadCategory.objects.get_or_create(
            name=name,
            defaults={'description': payload.description or ''}
        )
        return {"id": cat.id, "name": cat.name, "created": created}
    res = await sync_to_async(_create)()
    if not res:
        raise HTTPException(status_code=400, detail="Category name cannot be empty")
    return res

@app.get("/api/leads")
async def list_leads(
    search: Optional[str] = "",
    category: Optional[str] = "",
    status: Optional[str] = "",
    shop_type: Optional[str] = ""
):
    def _query():
        qs = Lead.objects.all()
        if search:
            qs = qs.filter(
                django.db.models.Q(shop_name__icontains=search) |
                django.db.models.Q(owner_name__icontains=search) |
                django.db.models.Q(phone__icontains=search) |
                django.db.models.Q(address__icontains=search)
            )
        if category:
            qs = qs.filter(category=category)
        if status:
            qs = qs.filter(status=status)
        if shop_type:
            qs = qs.filter(shop_type=shop_type)

        leads = []
        for l in qs:
            leads.append({
                "id": l.id,
                "phone": l.phone,
                "shop_name": l.shop_name,
                "owner_name": l.owner_name,
                "category": l.category,
                "shop_type": l.shop_type,
                "is_on_whatsapp": l.is_on_whatsapp,
                "whatsapp_name": l.whatsapp_name,
                "whatsapp_profile_pic": l.whatsapp_profile_pic,
                "whatsapp_about": l.whatsapp_about,
                "status": l.status,
                "address": l.address,
                "notes": l.notes,
                "created_at": l.created_at.isoformat(),
                "updated_at": l.updated_at.isoformat()
            })
        return leads

    result = await sync_to_async(_query)()
    return result

@app.post("/api/leads")
async def create_lead(payload: LeadCreate):
    phone_clean = payload.phone.strip()
    shop_name_clean = payload.shop_name.strip()

    if not phone_clean or not shop_name_clean:
        raise HTTPException(status_code=400, detail="Phone number and Shop Name are required")

    # Duplicate checking
    if not payload.force_save:
        dup = await sync_to_async(check_phone_duplicate)(phone_clean)
        if dup["is_duplicate"]:
            raise HTTPException(
                status_code=409,
                detail={
                    "warning": "DUPLICATE_PHONE",
                    "message": f"Phone number {phone_clean} already exists in {dup['type']} ({dup['name']})!",
                    "duplicate_type": dup["type"],
                    "duplicate_name": dup["name"],
                    "duplicate_id": dup["id"]
                }
            )

    # WhatsApp contact enrichment scan
    wa_info = await fetch_whatsapp_contact_info(phone_clean)
    is_on_wa = bool(wa_info.get("exists", False))
    pic_url = wa_info.get("profilePictureUrl") or ""
    about_text = wa_info.get("about") or ""
    wa_name = wa_info.get("name") or wa_info.get("pushName") or ""
    biz_prof = wa_info.get("businessProfile") or {}
    auto_addr = payload.address or biz_prof.get("address") or ""

    def _save():
        lead = Lead.objects.create(
            phone=phone_clean,
            shop_name=shop_name_clean,
            owner_name=payload.owner_name.strip() if payload.owner_name else (wa_name if wa_name else ""),
            category=payload.category or "General",
            shop_type=payload.shop_type or "Retail",
            is_on_whatsapp=is_on_wa,
            whatsapp_name=wa_name,
            whatsapp_profile_pic=pic_url,
            whatsapp_about=about_text,
            address=auto_addr,
            notes=payload.notes or "",
            status=payload.status or "NEW"
        )
        return {
            "id": lead.id,
            "phone": lead.phone,
            "shop_name": lead.shop_name,
            "owner_name": lead.owner_name,
            "category": lead.category,
            "shop_type": lead.shop_type,
            "is_on_whatsapp": lead.is_on_whatsapp,
            "whatsapp_name": lead.whatsapp_name,
            "whatsapp_profile_pic": lead.whatsapp_profile_pic,
            "whatsapp_about": lead.whatsapp_about,
            "status": lead.status,
            "created_at": lead.created_at.isoformat()
        }

    lead_data = await sync_to_async(_save)()
    return lead_data

@app.put("/api/leads/{lead_id}")
async def update_lead(lead_id: int, payload: LeadUpdate):
    def _update():
        lead = Lead.objects.filter(id=lead_id).first()
        if not lead:
            return None

        if payload.shop_name is not None:
            lead.shop_name = payload.shop_name.strip()
        if payload.owner_name is not None:
            lead.owner_name = payload.owner_name.strip()
        if payload.phone is not None:
            lead.phone = payload.phone.strip()
        if payload.category is not None:
            lead.category = payload.category
        if payload.shop_type is not None:
            lead.shop_type = payload.shop_type
        if payload.status is not None:
            lead.status = payload.status
        if payload.address is not None:
            lead.address = payload.address
        if payload.notes is not None:
            lead.notes = payload.notes

        lead.save()
        return {
            "id": lead.id,
            "phone": lead.phone,
            "shop_name": lead.shop_name,
            "owner_name": lead.owner_name,
            "category": lead.category,
            "shop_type": lead.shop_type,
            "status": lead.status,
            "is_on_whatsapp": lead.is_on_whatsapp,
            "whatsapp_profile_pic": lead.whatsapp_profile_pic,
            "updated_at": lead.updated_at.isoformat()
        }

    res = await sync_to_async(_update)()
    if not res:
        raise HTTPException(status_code=404, detail="Lead not found")
    return res

@app.delete("/api/leads/{lead_id}")
async def delete_lead(lead_id: int):
    def _del():
        count, _ = Lead.objects.filter(id=lead_id).delete()
        return count > 0
    success = await sync_to_async(_del)()
    if not success:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"success": True, "id": lead_id}

@app.get("/api/leads/export-csv")
async def export_leads_csv():
    def _gen_csv():
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["ID", "Shop Name", "Owner Name", "Phone", "Category", "Shop Type", "Status", "On WhatsApp", "Address", "Notes", "Created At"])
        for l in Lead.objects.all():
            writer.writerow([
                l.id,
                l.shop_name,
                l.owner_name,
                l.phone,
                l.category,
                l.shop_type,
                l.status,
                "Yes" if l.is_on_whatsapp else "No",
                l.address,
                l.notes,
                l.created_at.isoformat()
            ])
        output.seek(0)
        return output.getvalue()

    csv_text = await sync_to_async(_gen_csv)()
    return StreamingResponse(
        io.StringIO(csv_text),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads_export.csv"}
    )


# ============================================================
# LIVE CHAT ENDPOINTS
# ============================================================

class ChatListItem(BaseModel):
    phone: str
    name: str
    jid: str
    last_message: str
    last_message_time: str
    unread_count: int
    is_on_whatsapp: bool
    profile_picture: str | None = None

class ChatMessageOut(BaseModel):
    id: int
    whatsapp_msg_id: str
    phone: str
    jid: str
    sender_name: str
    is_from_me: bool
    message_text: str
    media_type: str
    media_url: str
    media_caption: str
    file_name: str
    status: str
    is_read: bool
    timestamp: str

class SendMessageRequest(BaseModel):
    message: str = ""
    media_type: str | None = None  # 'image', 'document', 'audio', 'video'
    media_url: str | None = None
    media_base64: str | None = None
    file_name: str | None = None
    mime_type: str | None = None

class IncomingMessageWebhook(BaseModel):
    whatsapp_msg_id: str
    phone: str
    jid: str
    sender_name: str
    is_from_me: bool
    message_text: str
    media_type: str = ""
    media_url: str = ""
    media_caption: str = ""
    file_name: str = ""
    timestamp: str


class ChatStatusUpdateRequest(BaseModel):
    whatsapp_msg_id: str
    status: str

@app.post("/api/chats/status-update")
async def update_chat_status(req: ChatStatusUpdateRequest):
    def _update():
        ChatMessage.objects.filter(whatsapp_msg_id=req.whatsapp_msg_id).update(status=req.status)
    await sync_to_async(_update)()
    return {"success": True}

class BatchIncomingMessageWebhook(BaseModel):
    messages: List[IncomingMessageWebhook]

# --- GET CHAT LIST (Recent Conversations) ---
@app.get("/api/chats", response_model=List[ChatListItem])
async def get_chat_list():
    def _get_chats():
        # Get all distinct phone numbers in SQLite compatible way
        phones = list(set(ChatMessage.objects.values_list('phone', flat=True)))
        chats = []
        for p in phones:
            latest = ChatMessage.objects.filter(phone=p).order_by('-timestamp').first()
            if not latest:
                continue
            unread = ChatMessage.objects.filter(phone=p, is_from_me=False, is_read=False).count()
            lead = Lead.objects.filter(phone=p).first()
            name = (lead.whatsapp_name if lead and lead.whatsapp_name else (lead.owner_name or lead.shop_name if lead else latest.sender_name)) or p
            if name == "Me" and lead:
                name = lead.whatsapp_name or lead.owner_name or lead.shop_name or p
            chats.append({
                "phone": p,
                "name": name if name and name != "Me" else (latest.sender_name if not latest.is_from_me else p),
                "jid": latest.jid,
                "last_message": latest.message_text[:80] if latest.message_text else (latest.media_type or "Media"),
                "last_message_time": latest.timestamp.isoformat(),
                "unread_count": unread,
                "is_on_whatsapp": lead.is_on_whatsapp if lead else False,
                "profile_picture": lead.whatsapp_profile_pic if lead else None
            })
        chats.sort(key=lambda x: x["last_message_time"], reverse=True)
        return chats

    return await sync_to_async(_get_chats)()


# --- GET MESSAGE HISTORY FOR A CHAT ---
@app.get("/api/chats/{phone}/messages", response_model=List[ChatMessageOut])
async def get_chat_messages(phone: str, limit: int = 100, before_id: int | None = None):
    def _get_msgs():
        qs = ChatMessage.objects.filter(phone=phone).order_by('-timestamp')
        if before_id:
            qs = qs.filter(id__lt=before_id)
        return list(qs[:limit][::-1])  # Return oldest first for display

    msgs = await sync_to_async(_get_msgs)()
    return [
        {
            "id": m.id,
            "whatsapp_msg_id": m.whatsapp_msg_id,
            "phone": m.phone,
            "jid": m.jid,
            "sender_name": m.sender_name,
            "is_from_me": m.is_from_me,
            "message_text": m.message_text,
            "media_type": m.media_type,
            "media_url": m.media_url,
            "media_caption": m.media_caption,
            "file_name": m.file_name,
            "status": m.status,
            "is_read": m.is_read,
            "timestamp": m.timestamp.isoformat()
        }
        for m in msgs
    ]


# --- MARK MESSAGES AS READ ---
@app.post("/api/chats/{phone}/read")
async def mark_chat_read(phone: str):
    def _mark_read():
        ChatMessage.objects.filter(phone=phone, is_from_me=False, is_read=False).update(is_read=True)

    await sync_to_async(_mark_read)()
    return {"success": True, "phone": phone}


# --- SEND MESSAGE (via WhatsApp Engine) ---
@app.post("/api/chats/{phone}/send")
async def send_chat_message(phone: str, req: SendMessageRequest):
    try:
        payload = {
            "phone": phone,
            "text": req.message,
        }
        if req.media_type:
            payload["mediaType"] = req.media_type
        if req.media_url:
            payload["mediaUrl"] = req.media_url
        if req.file_name:
            payload["fileName"] = req.file_name

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(f"{WHATSAPP_ENGINE_URL}/send-message", json=payload)
            resp.raise_for_status()
            result = resp.json()

        # Save outgoing message locally as well
        def _save_outgoing():
            local_phone = phone.replace('\D', '')
            if local_phone.startswith('8801'):
                local_phone = '0' + local_phone[2:]
            ChatMessage.objects.create(
                whatsapp_msg_id=result.get('whatsapp_msg_id', f"out_{datetime.now().timestamp()}"),
                phone=local_phone,
                jid=result.get('jid', f"{local_phone}@s.whatsapp.net"),
                sender_name="Me",
                is_from_me=True,
                message_text=req.message,
                media_type=req.media_type or "",
                media_url=req.media_url or "",
                media_caption=req.message,
                file_name=req.file_name or "",
                status="SENT",
                timestamp=datetime.fromisoformat(result.get('timestamp', datetime.now().isoformat()))
            )

        await sync_to_async(_save_outgoing)()
        return result
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"WhatsApp Engine error: {e}")


# --- AUTH MODELS & ENDPOINTS ---
class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/auth/login")
async def login(req: LoginRequest):
    if req.username == "stockwhisk" and req.password == "imontouhid4992":
        return {
            "success": True,
            "token": "wa_crm_token_stockwhisk_sec_4992",
            "username": "stockwhisk",
            "name": "StockWhisk Admin"
        }
    raise HTTPException(status_code=401, detail="Invalid username or password")

@app.get("/api/auth/verify")
async def verify_token(token: str = Query(...)):
    if token == "wa_crm_token_stockwhisk_sec_4992":
        return {
            "valid": True,
            "username": "stockwhisk",
            "name": "StockWhisk Admin"
        }
    raise HTTPException(status_code=401, detail="Invalid session token")

# --- INCOMING MESSAGE WEBHOOK (from WhatsApp Engine) ---
@app.post("/api/chats/incoming")
async def incoming_message_webhook(payload: IncomingMessageWebhook):
    try:
        def _save_incoming():
            # Clean phone number
            local_phone = re.sub(r'\D', '', payload.phone)
            if local_phone.startswith('8801'):
                local_phone = '0' + local_phone[2:]
            
            # Save the incoming message
            msg, created = ChatMessage.objects.get_or_create(
                whatsapp_msg_id=payload.whatsapp_msg_id,
                defaults={
                    "phone": local_phone,
                    "jid": payload.jid,
                    "sender_name": payload.sender_name,
                    "is_from_me": payload.is_from_me,
                    "message_text": payload.message_text,
                    "media_type": payload.media_type,
                    "media_url": payload.media_url,
                    "media_caption": payload.media_caption,
                    "file_name": payload.file_name,
                    "status": "SENT" if payload.is_from_me else "RECEIVED",
                    "is_read": payload.is_from_me,
                    "timestamp": datetime.fromisoformat(payload.timestamp.replace('Z', '+00:00')) if 'T' in payload.timestamp else django_tz.now()
                }
            )
            return msg, created

        msg, created = await sync_to_async(_save_incoming)()
        return {"success": True, "created": created, "id": msg.id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save incoming message: {e}")


# --- BATCH INCOMING MESSAGE WEBHOOK (for Initial History Sync) ---
@app.post("/api/chats/incoming/batch")
async def incoming_batch_messages_webhook(payload: BatchIncomingMessageWebhook):
    try:
        def _save_batch():
            saved_count = 0
            for item in payload.messages:
                # Clean phone number
                local_phone = re.sub(r'\D', '', item.phone)
                if local_phone.startswith('8801'):
                    local_phone = '0' + local_phone[2:]
                
                try:
                    ts = datetime.fromisoformat(item.timestamp.replace('Z', '+00:00')) if 'T' in item.timestamp else django_tz.now()
                except Exception:
                    ts = django_tz.now()

                _, created = ChatMessage.objects.get_or_create(
                    whatsapp_msg_id=item.whatsapp_msg_id,
                    defaults={
                        "phone": local_phone,
                        "jid": item.jid,
                        "sender_name": item.sender_name,
                        "is_from_me": item.is_from_me,
                        "message_text": item.message_text,
                        "media_type": item.media_type,
                        "media_url": item.media_url,
                        "media_caption": item.media_caption,
                        "file_name": item.file_name,
                        "status": "SENT" if item.is_from_me else "RECEIVED",
                        "is_read": item.is_from_me,
                        "timestamp": ts
                    }
                )
                if created:
                    saved_count += 1
            return saved_count

        saved = await sync_to_async(_save_batch)()
        return {"success": True, "saved": saved, "total": len(payload.messages)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save batch incoming messages: {e}")

