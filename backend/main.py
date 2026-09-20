import hashlib
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
import time
import phonenumbers
from datetime import datetime, timezone
from django.utils import timezone as django_tz
from typing import List, Optional, Dict, Any, Set
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from asgiref.sync import sync_to_async

from crm_core.models import Contact, MessageTemplate, Campaign, CampaignLog, Lead, LeadCategory, ChatMessage
from crm_core.ai_enricher import enrich_phone_intelligence

WHATSAPP_ENGINE_URL = os.environ.get('WHATSAPP_ENGINE_URL', 'http://whatsapp-engine:5001')


# --- REAL-TIME WEBSOCKET CHAT MANAGER ---
class WebSocketChatManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, data: dict):
        dead = []
        for ws in list(self.active_connections):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active_connections.discard(ws)

ws_chat_manager = WebSocketChatManager()

# --- SPINTAX HELPER ---
def parse_spintax(text: str) -> str:
    pattern = re.compile(r'\{([^{}]+)\}')
    while True:
        match = pattern.search(text)
        if not match:
            break
        options = match.group(1).split('|')
        choice = random.choice(options)
        text = text[:match.start()] + choice + text[match.end():]
    return text

# --- HELPER: LEAD CONTACTED TRACKER (HIGH PERFORMANCE INDEXED) ---
def normalize_phone_digits(phone: str) -> str:
    cleaned = re.sub(r'\D', '', str(phone))
    if cleaned.startswith('8801') and len(cleaned) == 13:
        return '0' + cleaned[2:]
    return cleaned

def mark_lead_contacted_by_phone(phone: str, msg_time: Optional[datetime] = None):
    """
    Fast indexed lookup for lead matching the phone number:
    - is_contacted = True
    - if status == 'NEW' -> status = 'CONTACTED'
    - last_contacted_at = now
    - sent_messages_count += 1
    """
    if not phone:
        return
    cleaned = re.sub(r'\D', '', str(phone))
    if not cleaned or len(cleaned) < 5:
        return
    now_time = msg_time or django_tz.now()
    suffix = cleaned[-8:] if len(cleaned) >= 8 else cleaned
    leads = list(Lead.objects.filter(phone__icontains=suffix))
    for lead in leads:
        lead_digits = re.sub(r'\D', '', str(lead.phone))
        if lead_digits.endswith(suffix) or cleaned.endswith(lead_digits[-8:] if len(lead_digits) >= 8 else lead_digits):
            lead.is_contacted = True
            if lead.status == 'NEW':
                lead.status = 'CONTACTED'
            lead.last_contacted_at = now_time
            lead.sent_messages_count = (lead.sent_messages_count or 0) + 1
            lead.save(update_fields=['is_contacted', 'status', 'last_contacted_at', 'sent_messages_count', 'updated_at'])

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


# --- 24/7 AUTONOMOUS AI LEAD HARVESTER WORKER ---
async def autonomous_lead_harvester_loop():
    """
    Background autonomous worker that runs periodically.
    When enabled, searches & verifies 20 genuine BD retail leads every 30 minutes.
    """
    from crm_core.auto_harvester import auto_harvester
    while True:
        try:
            await asyncio.sleep(25)
            cfg = auto_harvester.ensure_config()
            if not cfg.get("enabled"):
                continue
            if cfg.get("is_running"):
                continue

            next_run_str = cfg.get("next_run_at")
            now = datetime.now(timezone.utc)
            should_run = False

            if not next_run_str:
                should_run = True
            else:
                try:
                    next_run_dt = datetime.fromisoformat(next_run_str)
                    if now >= next_run_dt:
                        should_run = True
                except Exception:
                    should_run = True

            if should_run:
                asyncio.create_task(auto_harvester.run_harvest_cycle(manual=False))
        except Exception as e:
            print("Error in autonomous_lead_harvester_loop:", e)


# --- 24/7 AUTONOMOUS AI OUTREACH WORKER ---
async def autonomous_outreach_loop():
    """
    Background autonomous worker that runs periodically.
    When enabled, sends 15 AI-customized messages every 30 minutes.
    """
    from crm_core.auto_outreach import auto_outreach
    while True:
        try:
            await asyncio.sleep(25)
            cfg = auto_outreach.ensure_config()
            if not cfg.get("enabled"):
                continue
            if cfg.get("is_running"):
                continue

            next_run_str = cfg.get("next_run_at")
            now = datetime.now(timezone.utc)
            should_run = False

            if not next_run_str:
                should_run = True
            else:
                try:
                    next_run_dt = datetime.fromisoformat(next_run_str)
                    if now >= next_run_dt:
                        should_run = True
                except Exception:
                    should_run = True

            if should_run:
                asyncio.create_task(auto_outreach.run_outreach_cycle(manual=False))
        except Exception as e:
            print("Error in autonomous_outreach_loop:", e)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Reset stuck background worker states on startup
    try:
        from crm_core.auto_outreach import auto_outreach
        c = auto_outreach.ensure_config()
        if c.get("is_running"):
            c["is_running"] = False
            auto_outreach.save_config(c)
    except Exception:
        pass
    def _setup_db_wal():
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA busy_timeout=5000;")
    try:
        await sync_to_async(_setup_db_wal)()
    except Exception as e:
        print("Notice on WAL setup:", e)

    # Self-healing: recover any interrupted campaigns on startup/restart
    def _recover_orphaned_campaigns():
        try:
            from crm_core.models import Campaign
            for camp in Campaign.objects.filter(status='RUNNING'):
                pending = camp.logs.filter(status='PENDING').count()
                if pending > 0:
                    camp.status = 'PAUSED'
                else:
                    camp.status = 'COMPLETED'
                camp.save()
        except Exception as err:
            logger.warning(f"Error recovering campaigns on startup: {err}")

    try:
        await sync_to_async(_recover_orphaned_campaigns)()
    except Exception as e:
        pass

    task = asyncio.create_task(scheduled_campaign_checker())
    harvester_task = asyncio.create_task(autonomous_lead_harvester_loop())
    outreach_task = asyncio.create_task(autonomous_outreach_loop())
    yield
    task.cancel()
    harvester_task.cancel()
    outreach_task.cancel()

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
    content: Optional[str] = ""
    category: Optional[str] = "General"
    media_base64: Optional[str] = None
    media_type: Optional[str] = None
    file_name: Optional[str] = None
    mime_type: Optional[str] = None

class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    media_base64: Optional[str] = None
    media_type: Optional[str] = None
    file_name: Optional[str] = None
    mime_type: Optional[str] = None

class DirectSendRequest(BaseModel):
    phone: str
    message: Optional[str] = ""
    media_base64: Optional[str] = None
    media_type: Optional[str] = None
    file_name: Optional[str] = None
    mime_type: Optional[str] = None

class BulkSendRequest(BaseModel):
    title: str
    message_template: str
    contact_ids: Optional[List[int]] = []
    lead_ids: Optional[List[int]] = []
    delay_seconds: Optional[int] = 5
    media_base64: Optional[str] = None
    media_type: Optional[str] = None
    file_name: Optional[str] = None
    mime_type: Optional[str] = None
    scheduled_at: Optional[str] = None

class LeadCategoryCreate(BaseModel):
    name: str
    description: Optional[str] = ""

class LeadCreate(BaseModel):
    phone: str
    shop_name: str
    owner_name: Optional[str] = ""
    email: Optional[str] = ""
    website: Optional[str] = ""
    facebook_url: Optional[str] = ""
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
    email: Optional[str] = None
    website: Optional[str] = None
    facebook_url: Optional[str] = None
    category: Optional[str] = None
    shop_type: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    is_contacted: Optional[bool] = None

class LeadStatusUpdate(BaseModel):
    status: str

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

@app.post("/api/whatsapp/wipe-history")
async def wipe_whatsapp_history():
    def _wipe():
        ChatMessage.objects.all().delete()
        chat_profile_cache.clear()
        media_dir = "/app/media"
        if os.path.exists(media_dir):
            for f in os.listdir(media_dir):
                fp = os.path.join(media_dir, f)
                try:
                    if os.path.isfile(fp):
                        os.unlink(fp)
                except Exception:
                    pass
    await sync_to_async(_wipe)()
    return {"success": True, "message": "All chat history wiped"}

@app.post("/api/whatsapp/logout")
async def logout_whatsapp():
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(f"{WHATSAPP_ENGINE_URL}/logout")
            def _clean_all_chats():
                ChatMessage.objects.all().delete()
                chat_profile_cache.clear()
                media_dir = "/app/media"
                if os.path.exists(media_dir):
                    for f in os.listdir(media_dir):
                        fp = os.path.join(media_dir, f)
                        try:
                            if os.path.isfile(fp):
                                os.unlink(fp)
                        except Exception:
                            pass
            await sync_to_async(_clean_all_chats)()
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

@app.post("/api/contacts/sync-whatsapp")
async def sync_contacts_from_whatsapp():
    def _sync():
        synced_count = 0
        # 1. Sync from ChatMessages
        chat_rows = ChatMessage.objects.exclude(phone__startswith='120363').values('phone', 'sender_name').distinct()
        for c in chat_rows:
            p = (c.get('phone') or '').strip()
            if not p or len(p) < 8:
                continue
            name = (c.get('sender_name') or '').strip()
            if not name or name == 'StockWhisk Admin' or name == p:
                name = f"WhatsApp Contact ({p[-4:]})"
            obj, created = Contact.objects.get_or_create(
                phone=p,
                defaults={'name': name, 'tags': 'WhatsApp Chat'}
            )
            if created:
                synced_count += 1

        # 2. Sync from Lead Candidates
        for l in LeadCandidate.objects.all():
            p = (l.phone or '').strip()
            if not p or len(p) < 8:
                continue
            name = (l.name or '').strip() or f"Lead ({p[-4:]})"
            obj, created = Contact.objects.get_or_create(
                phone=p,
                defaults={
                    'name': name,
                    'email': l.email or '',
                    'tags': l.category or 'Scanned Lead'
                }
            )
            if created:
                synced_count += 1

        return {"synced": synced_count, "total": Contact.objects.count()}
    return await sync_to_async(_sync)()

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
                "media_base64": t.media_base64,
                "media_type": t.media_type,
                "file_name": t.file_name,
                "mime_type": t.mime_type,
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
            content=(payload.content or "").strip(),
            category=(payload.category or "General").strip(),
            media_base64=payload.media_base64,
            media_type=payload.media_type,
            file_name=payload.file_name,
            mime_type=payload.mime_type
        )
        return {
            "id": t.id,
            "name": t.name,
            "content": t.content,
            "category": t.category,
            "media_base64": t.media_base64,
            "media_type": t.media_type,
            "file_name": t.file_name,
            "mime_type": t.mime_type,
            "created_at": t.created_at.isoformat()
        }
    return await sync_to_async(_create)()

@app.put("/api/templates/{template_id}")
async def update_template(template_id: int, payload: TemplateUpdate):
    def _update():
        t = MessageTemplate.objects.filter(id=template_id).first()
        if not t:
            return None
        if payload.name is not None:
            t.name = payload.name.strip()
        if payload.content is not None:
            t.content = payload.content.strip()
        if payload.category is not None:
            t.category = payload.category.strip()
        if payload.media_base64 is not None:
            t.media_base64 = payload.media_base64 or None
        if payload.media_type is not None:
            t.media_type = payload.media_type or None
        if payload.file_name is not None:
            t.file_name = payload.file_name or None
        if payload.mime_type is not None:
            t.mime_type = payload.mime_type or None
        t.save()
        return {
            "id": t.id,
            "name": t.name,
            "content": t.content,
            "category": t.category,
            "media_base64": t.media_base64,
            "media_type": t.media_type,
            "file_name": t.file_name,
            "mime_type": t.mime_type,
            "created_at": t.created_at.isoformat()
        }
    res = await sync_to_async(_update)()
    if not res:
        raise HTTPException(status_code=404, detail="Template not found")
    return res

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

            # Automatically track lead outreach without saving disk media or chat records
            await sync_to_async(mark_lead_contacted_by_phone)(payload.phone)

            return data
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

async def run_campaign_worker(campaign_id: int, base_delay: int):
    def _get_campaign_and_logs():
        camp = Campaign.objects.get(id=campaign_id)
        if camp.status in ['CANCELLED', 'PAUSED']:
            return None, []
        camp.status = 'RUNNING'
        camp.save()
        logs = list(camp.logs.filter(status='PENDING'))
        return camp, logs

    camp, logs = await sync_to_async(_get_campaign_and_logs)()
    if not camp or not logs:
        return

    sent_in_batch = 0
    disconnected = False

    async with httpx.AsyncClient(timeout=45.0) as client:
        for log in logs:
            def _check_status():
                c = Campaign.objects.filter(id=campaign_id).first()
                return c.status if c else 'CANCELLED'
            
            curr_status = await sync_to_async(_check_status)()
            if curr_status in ['CANCELLED', 'PAUSED']:
                break

            # Batch cooldown: pause 25s after every 12 messages to prevent WhatsApp burst spam flagging
            sent_in_batch += 1
            if sent_in_batch % 12 == 0:
                logger.info(f"Campaign {campaign_id}: Batch threshold reached. Cooling down for 25s...")
                await asyncio.sleep(25.0)

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
                    def _update_success(l_id, ph):
                        l = CampaignLog.objects.get(id=l_id)
                        l.status = 'SENT'
                        l.sent_at = datetime.now()
                        l.save()
                        Campaign.objects.filter(id=campaign_id).update(sent_count=django.db.models.F('sent_count') + 1)
                        mark_lead_contacted_by_phone(ph)
                    await sync_to_async(_update_success)(log.id, log.phone)
                else:
                    err_msg = data.get("error", "Failed")
                    if "not connected" in err_msg.lower():
                        disconnected = True
                        logger.warning(f"Campaign {campaign_id}: WhatsApp disconnected. Auto-pausing campaign to save remaining leads...")
                        def _set_paused():
                            Campaign.objects.filter(id=campaign_id).update(status='PAUSED')
                        await sync_to_async(_set_paused)()
                        break
                    
                    def _update_fail(l_id, err):
                        l = CampaignLog.objects.get(id=l_id)
                        l.status = 'FAILED'
                        l.error_message = err
                        l.save()
                        Campaign.objects.filter(id=campaign_id).update(failed_count=django.db.models.F('failed_count') + 1)
                    await sync_to_async(_update_fail)(log.id, err_msg)
            except Exception as e:
                err_str = str(e)
                if "not connected" in err_str.lower():
                    disconnected = True
                    def _set_paused():
                        Campaign.objects.filter(id=campaign_id).update(status='PAUSED')
                    await sync_to_async(_set_paused)()
                    break

                def _update_err(l_id, err):
                    l = CampaignLog.objects.get(id=l_id)
                    l.status = 'FAILED'
                    l.error_message = str(err)
                    l.save()
                    Campaign.objects.filter(id=campaign_id).update(failed_count=django.db.models.F('failed_count') + 1)
                await sync_to_async(_update_err)(log.id, err_str)

            # Safe humanized delay with natural jitter (minimum 8s)
            delay = max(8.0, float(base_delay)) + random.uniform(-1.5, 2.5)
            await asyncio.sleep(delay)

    def _finish_campaign():
        c = Campaign.objects.filter(id=campaign_id).first()
        if c and c.status not in ['CANCELLED', 'PAUSED']:
            pending_count = c.logs.filter(status='PENDING').count()
            if pending_count == 0:
                c.status = 'COMPLETED'
                c.completed_at = datetime.now()
            else:
                c.status = 'PAUSED'
            c.save()

    await sync_to_async(_finish_campaign)()

@app.post("/api/campaigns/{campaign_id}/retry-failed")
async def retry_failed_campaign(campaign_id: int, background_tasks: BackgroundTasks):
    try:
        def _prepare_retry():
            camp = Campaign.objects.get(id=campaign_id)
            failed_logs = list(camp.logs.filter(status='FAILED'))
            if not failed_logs:
                return None, 0
            for l in failed_logs:
                l.status = 'PENDING'
                l.error_message = ''
                l.save()
            camp.failed_count = max(0, camp.failed_count - len(failed_logs))
            camp.status = 'RUNNING'
            camp.save()
            return camp, len(failed_logs)

        camp, count = await sync_to_async(_prepare_retry)()
        if not camp:
            return {"success": False, "message": "No failed recipients to retry."}

        background_tasks.add_task(run_campaign_worker, camp.id, camp.delay_seconds or 10)
        return {"success": True, "message": f"Retrying {count} failed messages...", "count": count}
    except Campaign.DoesNotExist:
        raise HTTPException(status_code=404, detail="Campaign not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/campaigns/{campaign_id}/resume")
async def resume_campaign(campaign_id: int, background_tasks: BackgroundTasks):
    try:
        def _prepare_resume():
            camp = Campaign.objects.get(id=campaign_id)
            pending_count = camp.logs.filter(status='PENDING').count()
            if pending_count == 0:
                return None, 0
            camp.status = 'RUNNING'
            camp.save()
            return camp, pending_count

        camp, count = await sync_to_async(_prepare_resume)()
        if not camp:
            return {"success": False, "message": "No pending recipients in this campaign."}

        background_tasks.add_task(run_campaign_worker, camp.id, camp.delay_seconds or 10)
        return {"success": True, "message": f"Resumed campaign with {count} pending messages.", "count": count}
    except Campaign.DoesNotExist:
        raise HTTPException(status_code=404, detail="Campaign not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/campaigns")
async def create_and_start_campaign(payload: BulkSendRequest, background_tasks: BackgroundTasks):
    def _create_campaign_records():
        target_ids = payload.lead_ids or payload.contact_ids or []
        recipients = []
        
        # 1. Resolve from Lead model
        leads = list(Lead.objects.filter(id__in=target_ids))
        if leads:
            for l in leads:
                name = l.shop_name or l.owner_name or f"Lead {l.phone[-4:]}"
                recipients.append({"name": name, "phone": l.phone})
        else:
            # 2. Fallback to Contact model
            contacts = list(Contact.objects.filter(id__in=target_ids))
            for c in contacts:
                recipients.append({"name": c.name, "phone": c.phone})

        if not recipients:
            return None, False, "No valid recipients selected"

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
            total_recipients=len(recipients),
            delay_seconds=payload.delay_seconds or 5,
            status='SCHEDULED' if is_scheduled else 'PENDING',
            media_base64=payload.media_base64,
            media_type=payload.media_type,
            file_name=payload.file_name,
            mime_type=payload.mime_type,
            scheduled_at=parsed_schedule
        )

        logs_to_create = []
        for r in recipients:
            personalized = payload.message_template.replace("{name}", r["name"]).replace("{phone}", r["phone"])
            customized = parse_spintax(personalized)

            logs_to_create.append(CampaignLog(
                campaign=campaign,
                contact_name=r["name"],
                phone=r["phone"],
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

@app.delete("/api/lead-categories/{category_id}")
async def delete_lead_category(category_id: int):
    def _delete():
        cat = LeadCategory.objects.filter(id=category_id).first()
        if not cat:
            return False
        cat.delete()
        return True
    deleted = await sync_to_async(_delete)()
    if not deleted:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"success": True, "message": "Category deleted successfully"}

from crm_core.lead_generator import LeadScraperEngine

class AutoLeadGenerateRequest(BaseModel):
    query: str
    country: Optional[str] = "BD"
    limit: int = 50
    only_whatsapp: bool = False
    category: Optional[str] = None
    exclude_existing: bool = True

class AutoLeadAssignRequest(BaseModel):
    leads: List[Dict[str, Any]]


class HarvesterToggleRequest(BaseModel):
    enabled: bool

class HarvesterSettingsRequest(BaseModel):
    interval_minutes: Optional[int] = 30
    batch_size: Optional[int] = 20

@app.get("/api/leads/autopilot/status")
async def get_harvester_status():
    from crm_core.auto_harvester import auto_harvester
    return auto_harvester.get_status()

@app.post("/api/leads/autopilot/toggle")
async def toggle_harvester(payload: HarvesterToggleRequest):
    from crm_core.auto_harvester import auto_harvester
    status = auto_harvester.set_enabled(payload.enabled)
    return {"success": True, "status": status}

@app.post("/api/leads/autopilot/run-now")
async def trigger_harvester_now(background_tasks: BackgroundTasks):
    from crm_core.auto_harvester import auto_harvester
    cfg = auto_harvester.ensure_config()
    if cfg.get("is_running"):
        return {"success": False, "message": "Harvest cycle is already in progress"}
    background_tasks.add_task(auto_harvester.run_harvest_cycle, manual=True)
    return {"success": True, "message": "Harvest cycle triggered in background"}


# --- AI OUTREACH ENDPOINTS ---
class OutreachToggleRequest(BaseModel):
    enabled: bool

class OutreachSettingsRequest(BaseModel):
    interval_minutes: Optional[int] = 30
    batch_size: Optional[int] = 15
    min_delay_seconds: Optional[int] = 15
    max_delay_seconds: Optional[int] = 22

@app.get("/api/leads/outreach/status")
async def get_outreach_status():
    from crm_core.auto_outreach import auto_outreach
    from asgiref.sync import sync_to_async
    return await sync_to_async(auto_outreach.get_status)()

@app.post("/api/leads/outreach/toggle")
async def toggle_outreach(payload: OutreachToggleRequest, background_tasks: BackgroundTasks):
    from crm_core.auto_outreach import auto_outreach
    from asgiref.sync import sync_to_async
    status = await sync_to_async(auto_outreach.set_enabled)(payload.enabled)
    if payload.enabled:
        cfg = auto_outreach.ensure_config()
        if not cfg.get("is_running"):
            background_tasks.add_task(auto_outreach.run_outreach_cycle, manual=False)
    return {"success": True, "status": status}

@app.post("/api/leads/outreach/run-now")
async def trigger_outreach_now(background_tasks: BackgroundTasks):
    from crm_core.auto_outreach import auto_outreach
    cfg = auto_outreach.ensure_config()
    if cfg.get("is_running"):
        return {"success": False, "message": "Outreach batch is already currently running"}
    background_tasks.add_task(auto_outreach.run_outreach_cycle, manual=True)
    return {"success": True, "message": "AI outreach cycle triggered in background"}

@app.post("/api/leads/outreach/settings")
async def update_outreach_settings(payload: OutreachSettingsRequest):
    from crm_core.auto_outreach import auto_outreach
    cfg = auto_outreach.ensure_config()
    if payload.interval_minutes is not None:
        cfg["interval_minutes"] = max(5, payload.interval_minutes)
    if payload.batch_size is not None:
        cfg["batch_size"] = max(1, min(50, payload.batch_size))
    if payload.min_delay_seconds is not None:
        cfg["min_delay_seconds"] = max(5, payload.min_delay_seconds)
    if payload.max_delay_seconds is not None:
        cfg["max_delay_seconds"] = max(cfg.get("min_delay_seconds", 15), payload.max_delay_seconds)
    auto_outreach.save_config(cfg)
    return {"success": True, "status": cfg}

@app.post("/api/leads/autopilot/settings")
async def update_harvester_settings(payload: HarvesterSettingsRequest):
    from crm_core.auto_harvester import auto_harvester
    cfg = auto_harvester.ensure_config()
    if payload.interval_minutes is not None:
        cfg["interval_minutes"] = max(5, payload.interval_minutes)
    if payload.batch_size is not None:
        cfg["batch_size"] = max(1, min(50, payload.batch_size))
    auto_harvester.save_config(cfg)
    return {"success": True, "status": cfg}

@app.post("/api/leads/auto-generate")
async def generate_leads_endpoint(payload: AutoLeadGenerateRequest):
    """
    Search and generate verified business leads with Google Maps, Facebook URLs,
    Live WhatsApp status check, and Database Deduplication.
    """
    try:
        engine = LeadScraperEngine(wa_engine_url="http://wa-engine:5001")
        results = await engine.search_and_generate_leads(
            query=payload.query,
            country=payload.country or "BD",
            limit=payload.limit,
            only_whatsapp=payload.only_whatsapp,
            category=payload.category,
            exclude_existing=payload.exclude_existing
        )
        return {"count": len(results), "leads": results}
    except Exception as e:
        print(f"Error generating leads: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class GeneratePitchRequest(BaseModel):
    shop_name: str
    category: str
    owner_name: Optional[str] = ""
    address: Optional[str] = ""

class SendPitchRequest(BaseModel):
    phone: str
    pitch: str
    shop_name: Optional[str] = ""
    category: Optional[str] = ""

@app.post("/api/leads/generate-pitch")
async def generate_pitch_endpoint(payload: GeneratePitchRequest):
    from crm_core.lead_generator import TARGET_CATEGORY_PROFILES
    matched = TARGET_CATEGORY_PROFILES.get(payload.category)
    if not matched:
        for k, v in TARGET_CATEGORY_PROFILES.items():
            if any(alias in payload.shop_name.lower() or alias in payload.category.lower() for alias in v["aliases"]):
                matched = v
                break

    pitch_tpl = matched["pitch_template"] if matched else (
        "আসসালামু আলাইকুম স্যার/ম্যাম!\n\n"
        f"আপনার প্রতিষ্ঠান **{payload.shop_name}**-এর বিক্রয়, ইনভেন্টরি ও বাকির ডিজিটাল হিসাবের জন্য StockWhisk ERP এখন মাত্র ৪৯৯ টাকায়!\n"
        "ফ্রি ১-অন-১ লাইভ ডেমো দেখতে ভিজিট করুন: https://app.stockwhisk.com"
    )
    pitch = pitch_tpl.format(
        shop_name=payload.shop_name or "প্রতিষ্ঠান",
        owner_or_sir=payload.owner_name or "স্যার"
    )
    return {"pitch": pitch}

@app.post("/api/leads/send-pitch")
async def send_pitch_endpoint(payload: SendPitchRequest):
    raw_phone = payload.phone.strip()
    digits = re.sub(r'\D', '', raw_phone)
    if digits.startswith('8801') and len(digits) == 13:
        phone = '0' + digits[3:]
    elif digits.startswith('01') and len(digits) == 11:
        phone = digits
    elif digits.startswith('1') and len(digits) == 10:
        phone = '0' + digits
    else:
        phone = raw_phone

    async with httpx.AsyncClient(timeout=30.0) as client:
        wa_engine_url = "http://wa-engine:5001"
        resp = await client.post(f"{wa_engine_url}/send-message", json={"phone": phone, "text": payload.pitch})
        if resp.status_code != 200:
            raise HTTPException(status_code=500, detail=f"WhatsApp sending failed: {resp.text}")

    def _update_lead_status():
        from django.utils import timezone as django_tz
        lead = Lead.objects.filter(phone=phone).first()
        if not lead and raw_phone != phone:
            lead = Lead.objects.filter(phone=raw_phone).first()
        if not lead:
            lead = Lead(
                phone=phone,
                shop_name=payload.shop_name or f"Lead {phone[-4:]}",
                category=payload.category or "General",
                status="CONTACTED",
                is_contacted=True,
                last_contacted_at=django_tz.now(),
                sent_messages_count=1
            )
            lead.save()
        else:
            lead.is_contacted = True
            if lead.status == "NEW":
                lead.status = "CONTACTED"
            lead.last_contacted_at = django_tz.now()
            lead.sent_messages_count = (lead.sent_messages_count or 0) + 1
            lead.save()
        return lead.id

    lead_id = await sync_to_async(_update_lead_status)()
    return {"success": True, "lead_id": lead_id, "phone": phone}


@app.post("/api/leads/batch-import")
async def batch_import_leads_endpoint(payload: AutoLeadAssignRequest):
    """
    Assign/Import multiple staged leads directly into CRM Lead Management.
    """
    def _do_import():
        imported = []
        skipped = []
        for item in payload.leads:
            raw_phone = str(item.get('phone') or '').strip()
            if not raw_phone:
                continue
            
            # Normalize phone
            digits = re.sub(r'\D', '', raw_phone)
            if digits.startswith('8801') and len(digits) == 13:
                phone = '0' + digits[3:]
            elif digits.startswith('01') and len(digits) == 11:
                phone = digits
            elif digits.startswith('1') and len(digits) == 10:
                phone = '0' + digits
            else:
                phone = raw_phone

            # Deduplication
            if Lead.objects.filter(phone=phone).exists() or (raw_phone and Lead.objects.filter(phone=raw_phone).exists()):
                skipped.append(phone)
                continue

            category_name = str(item.get('category') or 'General').strip() or 'General'
            shop_type = str(item.get('shop_type') or 'Retail').strip() or 'Retail'
            shop_name = str(item.get('shop_name') or '').strip() or 'New Business'
            owner_name = str(item.get('owner_name') or '').strip()
            email = str(item.get('email') or '').strip()
            website = str(item.get('website') or '').strip()
            facebook_url = str(item.get('facebook_url') or '').strip()
            address = str(item.get('address') or '').strip()
            notes = str(item.get('notes') or '').strip()
            whatsapp_about = str(item.get('whatsapp_about') or '').strip()

            pic = str(item.get('whatsapp_profile_pic') or item.get('profile_pic') or '').strip()
            wa_name = str(item.get('whatsapp_name') or item.get('shop_name') or '').strip()
            is_on_wa = bool(item.get('is_on_whatsapp', True))

            lead = Lead.objects.create(
                phone=phone,
                shop_name=shop_name,
                owner_name=owner_name,
                email=email,
                website=website,
                facebook_url=facebook_url,
                category=category_name,
                shop_type=shop_type,
                address=address,
                notes=notes,
                whatsapp_profile_pic=pic,
                whatsapp_name=wa_name,
                whatsapp_about=whatsapp_about,
                is_on_whatsapp=is_on_wa,
                status='NEW'
            )
            imported.append({
                "id": lead.id,
                "shop_name": lead.shop_name,
                "phone": lead.phone,
                "original_id": item.get('id'),
                "original_phone": raw_phone
            })
        return {"imported_count": len(imported), "skipped_count": len(skipped), "imported": imported}

    res = await sync_to_async(_do_import)()
    return res

@app.get("/api/leads")
async def list_leads(
    search: Optional[str] = "",
    category: Optional[str] = "",
    status: Optional[str] = "",
    shop_type: Optional[str] = "",
    contacted: Optional[bool] = None
):
    def _query():
        # Auto-sync contacted status from existing chat messages
        all_leads = Lead.objects.all()
        for l in all_leads:
            if not l.is_contacted:
                norm = normalize_phone_digits(l.phone)
                # Check if there are outgoing messages for this phone
                outgoing = ChatMessage.objects.filter(is_from_me=True)
                for msg in outgoing:
                    if normalize_phone_digits(msg.phone) == norm:
                        l.is_contacted = True
                        if l.status == 'NEW':
                            l.status = 'CONTACTED'
                        l.last_contacted_at = msg.timestamp
                        l.sent_messages_count = (l.sent_messages_count or 0) + 1
                        l.save(update_fields=['is_contacted', 'status', 'last_contacted_at', 'sent_messages_count'])
                        break

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
        if contacted is not None:
            qs = qs.filter(is_contacted=contacted)

        leads = []
        for l in qs.order_by('-created_at'):
            leads.append({
                "id": l.id,
                "phone": l.phone,
                "shop_name": l.shop_name,
                "owner_name": l.owner_name,
                "email": l.email or "",
                "website": l.website or "",
                "facebook_url": l.facebook_url or "",
                "category": l.category,
                "shop_type": l.shop_type,
                "is_on_whatsapp": l.is_on_whatsapp,
                "whatsapp_name": l.whatsapp_name,
                "whatsapp_profile_pic": l.whatsapp_profile_pic,
                "whatsapp_about": l.whatsapp_about,
                "status": l.status,
                "address": l.address,
                "notes": l.notes,
                "is_contacted": bool(l.is_contacted),
                "last_contacted_at": l.last_contacted_at.isoformat() if l.last_contacted_at else None,
                "sent_messages_count": l.sent_messages_count or 0,
                "created_at": l.created_at.isoformat(),
                "updated_at": l.updated_at.isoformat()
            })
        return leads

    result = await sync_to_async(_query)()
    return result

@app.post("/api/leads")
@app.post("/api/leads/")
async def create_lead(payload: LeadCreate):
    phone_clean = payload.phone.strip()
    shop_name_clean = payload.shop_name.strip()

    if not phone_clean or not shop_name_clean:
        raise HTTPException(status_code=400, detail="Phone number and Shop Name are required")

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
            email=payload.email.strip() if payload.email else "",
            website=payload.website.strip() if payload.website else "",
            facebook_url=payload.facebook_url.strip() if payload.facebook_url else "",
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
            "email": lead.email,
            "website": lead.website,
            "facebook_url": lead.facebook_url,
            "category": lead.category,
            "shop_type": lead.shop_type,
            "is_on_whatsapp": lead.is_on_whatsapp,
            "whatsapp_name": lead.whatsapp_name,
            "whatsapp_profile_pic": lead.whatsapp_profile_pic,
            "whatsapp_about": lead.whatsapp_about,
            "status": lead.status,
            "is_contacted": lead.is_contacted,
            "last_contacted_at": lead.last_contacted_at.isoformat() if lead.last_contacted_at else None,
            "sent_messages_count": lead.sent_messages_count,
            "created_at": lead.created_at.isoformat()
        }

    lead_data = await sync_to_async(_save)()
    return lead_data

@app.patch("/api/leads/{lead_id}/status")
@app.patch("/api/leads/{lead_id}/status/")
async def update_lead_status(lead_id: int, payload: LeadStatusUpdate):
    def _update_status():
        lead = Lead.objects.filter(id=lead_id).first()
        if not lead:
            return None
        lead.status = payload.status
        lead.save(update_fields=['status', 'updated_at'])
        return {
            "id": lead.id,
            "status": lead.status,
            "updated_at": lead.updated_at.isoformat()
        }
    res = await sync_to_async(_update_status)()
    if not res:
        raise HTTPException(status_code=404, detail="Lead not found")
    return res

@app.put("/api/leads/{lead_id}")
@app.put("/api/leads/{lead_id}/")
@app.patch("/api/leads/{lead_id}")
@app.patch("/api/leads/{lead_id}/")
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
        if payload.email is not None:
            lead.email = payload.email.strip()
        if payload.website is not None:
            lead.website = payload.website.strip()
        if payload.facebook_url is not None:
            lead.facebook_url = payload.facebook_url.strip()
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
        if payload.is_contacted is not None:
            lead.is_contacted = payload.is_contacted

        lead.save()
        return {
            "id": lead.id,
            "phone": lead.phone,
            "shop_name": lead.shop_name,
            "owner_name": lead.owner_name,
            "email": lead.email,
            "website": lead.website,
            "facebook_url": lead.facebook_url,
            "category": lead.category,
            "shop_type": lead.shop_type,
            "status": lead.status,
            "is_on_whatsapp": lead.is_on_whatsapp,
            "whatsapp_profile_pic": lead.whatsapp_profile_pic,
            "is_contacted": lead.is_contacted,
            "last_contacted_at": lead.last_contacted_at.isoformat() if lead.last_contacted_at else None,
            "sent_messages_count": lead.sent_messages_count,
            "updated_at": lead.updated_at.isoformat()
        }

    res = await sync_to_async(_update)()
    if not res:
        raise HTTPException(status_code=404, detail="Lead not found")
    return res

@app.delete("/api/leads/{lead_id}")
@app.delete("/api/leads/{lead_id}/")
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
        writer.writerow(["ID", "Shop Name", "Owner Name", "Phone", "Email", "Website", "Facebook", "Category", "Shop Type", "Status", "Contacted", "Last Contacted", "Sent Count", "On WhatsApp", "Address", "Notes", "Created At"])
        for l in Lead.objects.all():
            writer.writerow([
                l.id,
                l.shop_name,
                l.owner_name,
                l.phone,
                l.email or "",
                l.website or "",
                l.facebook_url or "",
                l.category,
                l.shop_type,
                l.status,
                "Yes" if l.is_contacted else "No",
                l.last_contacted_at.isoformat() if l.last_contacted_at else "",
                l.sent_messages_count or 0,
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
    display_phone: str | None = None
    country_code: str | None = None
    is_lid: bool = False
    last_message: str
    last_message_time: str
    unread_count: int
    is_on_whatsapp: bool
    profile_picture: str | None = None
    is_bot_active: bool = True
    lead_id: int | None = None
    lead_shop_name: str | None = None
    lead_category: str | None = None
    lead_status: str | None = None

class ChatMessageOut(BaseModel):
    id: int
    whatsapp_msg_id: str
    phone: str
    jid: str
    display_phone: str | None = None
    country_code: str | None = None
    is_lid: bool = False
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

class LinkPhoneRequest(BaseModel):
    phone: str

class SendMessageRequest(BaseModel):
    message: str = ""
    media_type: str | None = None
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
    try:
        asyncio.create_task(ws_chat_manager.broadcast({
            "type": "STATUS_UPDATE",
            "whatsapp_msg_id": req.whatsapp_msg_id,
            "status": req.status
        }))
    except Exception:
        pass
    return {"success": True}

class BatchIncomingMessageWebhook(BaseModel):
    messages: List[IncomingMessageWebhook]

_chat_meta_cache = {}
_lid_map_cache = {}
_lid_map_last_fetch = 0.0

async def get_lid_map():
    global _lid_map_cache, _lid_map_last_fetch
    now = time.time()
    if now - _lid_map_last_fetch < 10.0 and _lid_map_cache:
        return _lid_map_cache
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{WHATSAPP_ENGINE_URL}/api/lid-mappings")
            if resp.status_code == 200:
                data = resp.json()
                _lid_map_cache = data.get("mappings", {})
                _lid_map_last_fetch = now
    except Exception:
        pass
    return _lid_map_cache

def compute_display_phone_and_meta(phone: str, jid: str = "", lid_map: dict = None):
    import phonenumbers
    if not phone:
        return "", "", False
    if "@g.us" in phone or "@g.us" in jid or phone.startswith("120363"):
        return "Group Chat", "", False

    clean_digits = re.sub(r"\D", "", phone)
    is_lid = (len(clean_digits) >= 14 and not clean_digits.startswith("8801")) or (jid and jid.endswith("@lid"))

    resolved_phone = clean_digits
    if is_lid and lid_map:
        mapped = lid_map.get(clean_digits) or lid_map.get(f"{clean_digits}@lid")
        if mapped:
            resolved_phone = re.sub(r"\D", "", mapped)
            is_lid = False

    if is_lid:
        return f"WhatsApp ID: {clean_digits}", "", True

    try:
        default_region = "BD" if resolved_phone.startswith("01") or resolved_phone.startswith("880") else None
        raw_to_parse = ("+" + resolved_phone) if (resolved_phone.startswith("880") or resolved_phone.startswith("1") or resolved_phone.startswith("44") or resolved_phone.startswith("971")) else resolved_phone
        parsed = phonenumbers.parse(raw_to_parse, default_region)
        if phonenumbers.is_valid_number(parsed):
            fmt = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.INTERNATIONAL)
            cc = f"+{parsed.country_code}"
            return fmt, cc, False
    except Exception:
        pass

    if resolved_phone.startswith("8801") and len(resolved_phone) == 13:
        return f"+880 {resolved_phone[3:7]}-{resolved_phone[7:]}", "+880", False
    elif resolved_phone.startswith("01") and len(resolved_phone) == 11:
        return f"+880 {resolved_phone[1:5]}-{resolved_phone[5:]}", "+880", False
    elif len(resolved_phone) >= 10:
        return f"+{resolved_phone}", "+", False

    return phone, "", False

@app.get("/api/chats", response_model=List[ChatListItem])
async def get_chat_list():
    def _get_chats_db():
        from django.db.models import Max, Count

        latest_ids = list(ChatMessage.objects.values('phone').annotate(max_id=Max('id')).values_list('max_id', flat=True))
        if not latest_ids:
            return []

        latest_msgs = {
            m.phone: m
            for m in ChatMessage.objects.filter(id__in=latest_ids).order_by('-timestamp')
        }

        unread_counts = {
            row['phone']: row['c']
            for row in ChatMessage.objects.filter(is_from_me=False, is_read=False)
                .values('phone')
                .annotate(c=Count('id'))
        }

        # Optimized: Indexed query only for active chat phones (Zero full-table scans)
        from django.db.models import Q
        lead_query = Q()
        for p in latest_msgs.keys():
            digits = re.sub(r'\D', '', p)
            if len(digits) >= 8:
                lead_query |= Q(phone__icontains=digits[-8:])
            elif digits:
                lead_query |= Q(phone__icontains=digits)

        leads_clean = {}
        if lead_query:
            for l in Lead.objects.filter(lead_query):
                clean = re.sub(r'\D', '', l.phone)
                leads_clean[clean] = l
                if clean.startswith('8801'):
                    leads_clean['0' + clean[2:]] = l
                elif clean.startswith('01'):
                    leads_clean['88' + clean] = l
                if len(clean) >= 8:
                    leads_clean[clean[-8:]] = l

        results = []
        for p, latest in latest_msgs.items():
            unread = unread_counts.get(p, 0)
            clean_p = p.replace('@s.whatsapp.net', '').replace('@g.us', '').replace('+', '').replace('-', '').replace(' ', '')
            lead = leads_clean.get(clean_p) or leads_clean.get(p)

            is_group = p.endswith('@g.us') or (latest.jid and latest.jid.endswith('@g.us'))

            chat_name = ''
            if is_group:
                chat_name = getattr(latest, 'group_name', '') or latest.sender_name or 'WhatsApp Group'
            elif lead and (lead.whatsapp_name or lead.owner_name or lead.shop_name):
                chat_name = lead.whatsapp_name or lead.owner_name or lead.shop_name
            elif latest.sender_name and latest.sender_name != 'Me' and not latest.is_from_me:
                chat_name = latest.sender_name
            else:
                chat_name = p

            results.append({
                'phone': p,
                'name': chat_name,
                'jid': latest.jid or (f"{p}@g.us" if is_group else f"{p}@s.whatsapp.net"),
                'last_message': latest.message_text[:80] if latest.message_text else (latest.media_type or 'Media'),
                'last_message_time': latest.timestamp.isoformat(),
                'unread_count': unread,
                'is_on_whatsapp': lead.is_on_whatsapp if lead else True,
                'lead_pic': lead.whatsapp_profile_pic if lead else None,
                'is_group': is_group,
                'lead_id': lead.id if lead else None,
                'lead_shop_name': lead.shop_name if (lead and lead.shop_name and not lead.shop_name.startswith('Lead ')) else None,
                'lead_category': lead.category if (lead and lead.category and lead.category != 'General') else None,
                'lead_status': lead.status if lead else None
            })
        return results

    db_chats = await sync_to_async(_get_chats_db)()
    if not db_chats:
        return []

    # Fast single batch resolve from whatsapp-engine
    resolved_meta = {}
    try:
        async with httpx.AsyncClient(timeout=2.5) as client:
            resp = await client.post(
                f"{WHATSAPP_ENGINE_URL}/api/resolve-chats",
                json={"chats": [{"phone": c['phone'], "jid": c['jid']} for c in db_chats]}
            )
            if resp.status_code == 200:
                data = resp.json()
                if "results" in data and isinstance(data["results"], dict):
                    resolved_meta = data["results"]
                elif "resolved" in data and isinstance(data["resolved"], list):
                    for item in data["resolved"]:
                        if item.get("phone"):
                            resolved_meta[item["phone"]] = item
                        if item.get("jid"):
                            resolved_meta[item["jid"]] = item
    except Exception:
        pass

    lid_map = await get_lid_map()
    from crm_core.ai_bot import load_bot_config, OMNIROUTE_URL, OMNIROUTE_KEY
    bot_cfg = load_bot_config()
    bot_globally_on = bot_cfg.get('enabled', True)
    disabled_set = set(re.sub(r'\D', '', x) for x in bot_cfg.get('disabled_phones', []))

    final_chats = []
    for c in db_chats:
        clean_item_phone = re.sub(r'\D', '', c['phone'])
        is_bot_active = bot_globally_on and (clean_item_phone not in disabled_set)
        phone = c['phone']
        jid = c.get('jid') or f"{phone}@s.whatsapp.net"
        meta = resolved_meta.get(phone) or resolved_meta.get(jid) or resolved_meta.get(phone.replace('8801', '01')) or resolved_meta.get('88' + phone if phone.startswith('01') else phone) or {}

        disp_phone, country_code, is_lid = compute_display_phone_and_meta(phone, jid, lid_map)

        pic = c.get('lead_pic') or meta.get('profile_picture') or meta.get('profilePictureUrl') or _chat_meta_cache.get(jid, {}).get('profilePictureUrl')
        name = meta.get('name') or c.get('name')
        if not name or name == phone or name == 'WhatsApp Group' or '(WhatsApp Group)' in str(name):
            name = _chat_meta_cache.get(jid, {}).get('name') or meta.get('name') or name or disp_phone

        disp_name = name or disp_phone
        while disp_name.startswith('00') and len(disp_name) > 2:
            disp_name = disp_name[1:]

        final_chats.append({
            'phone': phone,
            'name': disp_name,
            'jid': jid,
            'display_phone': disp_phone,
            'country_code': country_code,
            'is_lid': is_lid,
            'last_message': c['last_message'],
            'last_message_time': c['last_message_time'],
            'unread_count': c['unread_count'],
            'is_on_whatsapp': c['is_on_whatsapp'],
            'profile_picture': pic,
            'is_bot_active': is_bot_active,
            'lead_id': c.get('lead_id'),
            'lead_shop_name': c.get('lead_shop_name'),
            'lead_category': c.get('lead_category'),
            'lead_status': c.get('lead_status')
        })

    final_chats.sort(key=lambda x: x['last_message_time'], reverse=True)
    return final_chats

@app.get("/api/chats/{phone}/messages", response_model=List[ChatMessageOut])
async def get_chat_messages(phone: str, limit: int = 100, before_id: int | None = None):
    lid_map = await get_lid_map()
    disp_phone, country_code, is_lid = compute_display_phone_and_meta(phone, phone + "@s.whatsapp.net", lid_map)

    def _get_msgs():
        qs = ChatMessage.objects.filter(phone=phone).order_by('-timestamp')
        if before_id:
            qs = qs.filter(id__lt=before_id)
        return list(qs[:limit][::-1])

    msgs = await sync_to_async(_get_msgs)()
    return [
        {
            "id": m.id,
            "whatsapp_msg_id": m.whatsapp_msg_id,
            "phone": m.phone,
            "jid": m.jid,
            "display_phone": disp_phone,
            "country_code": country_code,
            "is_lid": is_lid,
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

@app.post("/api/chats/{phone}/link-phone")
async def link_chat_phone(phone: str, req: LinkPhoneRequest):
    new_phone = re.sub(r"\D", "", req.phone)
    if new_phone.startswith("8801") and len(new_phone) == 13:
        new_phone = "0" + new_phone[2:]
    elif not new_phone.startswith("01") and len(new_phone) == 10:
        new_phone = "0" + new_phone

    if not new_phone:
        raise HTTPException(status_code=400, detail="Valid phone number required")

    def _update_db():
        count = ChatMessage.objects.filter(phone=phone).update(phone=new_phone)
        return count

    updated_count = await sync_to_async(_update_db)()

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(f"{WHATSAPP_ENGINE_URL}/api/set-lid-mapping", json={
                "lid": phone,
                "phone": new_phone
            })
    except Exception:
        pass

    global _lid_map_last_fetch
    _lid_map_last_fetch = 0.0

    return {
        "success": True,
        "old_phone": phone,
        "new_phone": new_phone,
        "messages_updated": updated_count
    }

class BotConfigRequest(BaseModel):
    enabled: Optional[bool] = None
    auto_lead_gen: Optional[bool] = None
    model: Optional[str] = None
    reply_delay_seconds: Optional[int] = None

class BotToggleRequest(BaseModel):
    enabled: bool

@app.get("/api/bot/config")
async def get_bot_config_api():
    from crm_core.ai_bot import load_bot_config, OMNIROUTE_URL, OMNIROUTE_KEY
    return load_bot_config()

@app.post("/api/bot/config")
async def update_bot_config_api(req: BotConfigRequest):
    from crm_core.ai_bot import load_bot_config, OMNIROUTE_URL, OMNIROUTE_KEY, save_bot_config
    cfg = load_bot_config()
    if req.enabled is not None:
        cfg["enabled"] = req.enabled
    if req.auto_lead_gen is not None:
        cfg["auto_lead_gen"] = req.auto_lead_gen
    if req.model is not None:
        cfg["model"] = req.model
    if req.reply_delay_seconds is not None:
        cfg["reply_delay_seconds"] = max(1, min(30, req.reply_delay_seconds))
    save_bot_config(cfg)
    return {"success": True, "config": cfg}

@app.get("/api/chats/{phone}/bot-status")
async def get_chat_bot_status(phone: str):
    from crm_core.ai_bot import load_bot_config, OMNIROUTE_URL, OMNIROUTE_KEY
    cfg = load_bot_config()
    clean_digits = re.sub(r'\D', '', phone)
    disabled_list = [re.sub(r'\D', '', p) for p in cfg.get("disabled_phones", [])]
    is_active = cfg.get("enabled", True) and (clean_digits not in disabled_list)
    return {"phone": phone, "is_bot_active": is_active, "globally_enabled": cfg.get("enabled", True)}

_system_status_cache = {"data": None, "ts": 0}

@app.get("/api/system/status")
async def get_system_status():
    import time, psycopg2
    from crm_core.ai_bot import load_bot_config, OMNIROUTE_URL, OMNIROUTE_KEY
    
    now = time.time()
    if _system_status_cache["data"] and (now - _system_status_cache["ts"] < 30):
        return _system_status_cache["data"]

    # 1. Reg DB check
    db_ok = False
    total_shops = 0
    db_url = os.getenv("STOCKWHISK_DB_URL", "postgresql://stockwhisk:stockwhisk_password@stockwhisk_updated-db-1:5432/stockwhisk")
    try:
        conn = psycopg2.connect(db_url, connect_timeout=2)
        cur = conn.cursor()
        cur.execute("SELECT count(*) FROM tenants_shop;")
        total_shops = cur.fetchone()[0]
        conn.close()
        db_ok = True
    except Exception:
        pass

    # 2. WhatsApp Engine check
    wa_ok = False
    wa_phone = "8801613511887"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{WHATSAPP_ENGINE_URL}/status")
            if resp.status_code == 200:
                data = resp.json()
                wa_ok = str(data.get("status", "")).upper() == "CONNECTED"
                if data.get("user", {}).get("id"):
                    wa_phone = data["user"]["id"].split(":")[0]
    except Exception:
        pass

    # 3. OmniRoute LLM check (Ultra-fast non-blocking gateway health verification)
    ai_ok = False
    ai_model = load_bot_config().get("model", "agy/gemini-3.8-flash-high")
    try:
        base_url = OMNIROUTE_URL.replace("/chat/completions", "").rstrip("/")
        async with httpx.AsyncClient(timeout=3.5) as client:
            resp = await client.get(
                f"{base_url}/models",
                headers={"Authorization": f"Bearer {OMNIROUTE_KEY}"}
            )
            if resp.status_code == 200:
                ai_ok = True
    except Exception:
        # Fallback to chat completions ping if /models is unavailable
        try:
            chat_endpoint = OMNIROUTE_URL if OMNIROUTE_URL.endswith("/chat/completions") else f"{OMNIROUTE_URL}/chat/completions"
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.post(
                    chat_endpoint,
                    headers={"Authorization": f"Bearer {OMNIROUTE_KEY}"},
                    json={"model": ai_model, "messages": [{"role": "user", "content": "ping"}], "max_tokens": 5}
                )
                if resp.status_code == 200:
                    ai_ok = True
        except Exception:
            pass

    result = {
        "whatsapp": {
            "status": "connected" if wa_ok else "disconnected",
            "phone": wa_phone
        },
        "ai_engine": {
            "status": "online" if ai_ok else "offline",
            "provider": "OmniRoute",
            "model": ai_model,
            "bot_enabled": load_bot_config().get("enabled", True)
        },
        "reg_db": {
            "status": "connected" if db_ok else "disconnected",
            "database": "StockWhisk PostgreSQL (Read-Only)",
            "indexed_shops": total_shops
        }
    }
    _system_status_cache["data"] = result
    _system_status_cache["ts"] = now
    return result

@app.get("/api/chats/{phone}/reg-info")
async def get_chat_reg_info(phone: str):
    from crm_core.ai_bot import inspect_reg_db
    clean_digits = re.sub(r'\D', '', phone)
    info = inspect_reg_db(clean_digits)
    return info


# ==================== STOCKWHISK REG DB MANAGEMENT API ====================
class ShopCustomInfoRequest(BaseModel):
    custom_notes: Optional[str] = ""
    ai_instructions: Optional[str] = ""
    custom_whatsapp_phone: Optional[str] = ""
    tags: Optional[List[str]] = []
    phone: Optional[str] = ""

class ManualShopRequest(BaseModel):
    id: Optional[str] = None
    name: str
    owner_name: Optional[str] = ""
    phone: str
    custom_whatsapp_phone: Optional[str] = ""
    business_type: Optional[str] = "general"
    plan_name: Optional[str] = "Opening Offer 6 Months"
    plan_tier: Optional[str] = "enterprise"
    is_active: Optional[bool] = True
    custom_notes: Optional[str] = ""
    ai_instructions: Optional[str] = ""
    tags: Optional[List[str]] = ["Manual Entry"]

@app.get("/api/reg-db/shops")
@app.get("/api/reg-db/shops/")
async def get_reg_db_shops_api(
    search: Optional[str] = "",
    plan: Optional[str] = "",
    status: Optional[str] = ""
):
    from crm_core.reg_db_manager import get_all_shops_with_custom
    return get_all_shops_with_custom(search=search or "", plan_filter=plan or "", status_filter=status or "")

@app.get("/api/reg-db/pending")
@app.get("/api/reg-db/pending/")
async def get_reg_db_pending_api():
    from crm_core.reg_db_manager import get_all_pending_with_custom
    return get_all_pending_with_custom()

@app.post("/api/reg-db/shops/{shop_id}/custom")
async def update_reg_db_shop_custom_api(shop_id: str, req: ShopCustomInfoRequest):
    from crm_core.reg_db_manager import update_shop_custom_info
    return update_shop_custom_info(shop_id, req.dict())

@app.post("/api/reg-db/manual-shop")
async def add_or_update_manual_shop_api(req: ManualShopRequest):
    from crm_core.reg_db_manager import add_or_update_manual_shop
    return add_or_update_manual_shop(req.dict())

@app.delete("/api/reg-db/manual-shop/{manual_id}")
async def delete_manual_shop_api(manual_id: str):
    from crm_core.reg_db_manager import delete_manual_shop
    success = delete_manual_shop(manual_id)
    return {"success": success}


class QARuleRequest(BaseModel):
    id: Optional[str] = None
    question: str
    keywords: Any = []
    answer: str
    category: Optional[str] = "General"
    is_active: Optional[bool] = True

@app.get("/api/reg-db/qa-rules")
@app.get("/api/reg-db/qa-rules/")
async def get_qa_rules_api():
    from crm_core.qa_rules_manager import load_qa_rules
    return load_qa_rules()

@app.post("/api/reg-db/qa-rules")
@app.post("/api/reg-db/qa-rules/")
async def save_qa_rule_api(req: QARuleRequest):
    from crm_core.qa_rules_manager import add_or_update_qa_rule
    return add_or_update_qa_rule(req.dict())

@app.delete("/api/reg-db/qa-rules/{rule_id}")
@app.delete("/api/reg-db/qa-rules/{rule_id}/")
async def delete_qa_rule_api(rule_id: str):
    from crm_core.qa_rules_manager import delete_qa_rule
    success = delete_qa_rule(rule_id)
    return {"success": success}

@app.post("/api/chats/{phone}/bot-toggle")
async def toggle_chat_bot_status(phone: str, req: BotToggleRequest):
    from crm_core.ai_bot import load_bot_config, OMNIROUTE_URL, OMNIROUTE_KEY, save_bot_config
    cfg = load_bot_config()
    clean_digits = re.sub(r'\D', '', phone)
    disabled = set(re.sub(r'\D', '', p) for p in cfg.get("disabled_phones", []))
    if req.enabled:
        disabled.discard(clean_digits)
    else:
        disabled.add(clean_digits)
    cfg["disabled_phones"] = list(disabled)
    save_bot_config(cfg)
    return {"phone": phone, "is_bot_active": req.enabled}

@app.post("/api/chats/{phone}/read")
async def mark_chat_read(phone: str):
    def _mark_read():
        unread_qs = ChatMessage.objects.filter(phone=phone, is_from_me=False, is_read=False)
        keys = [{'remoteJid': m.jid or f'{phone}@s.whatsapp.net', 'id': m.whatsapp_msg_id} for m in unread_qs if m.whatsapp_msg_id]
        unread_qs.update(is_read=True)
        return keys

    keys = await sync_to_async(_mark_read)()
    
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(f'{WHATSAPP_ENGINE_URL}/mark-read', json={'phone': phone, 'keys': keys})
    except Exception:
        pass

    return {'success': True, 'phone': phone}

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

        def _save_outgoing():
            digits = re.sub(r'\D', '', phone)
            local_phone = '0' + digits[2:] if (digits.startswith('8801') and len(digits) == 13) else digits
            msg = ChatMessage.objects.create(
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
            mark_lead_contacted_by_phone(local_phone)
            return msg

        saved_msg = await sync_to_async(_save_outgoing)()

        try:
            from crm_core.learning_engine import observe_human_reply, update_customer_memory_from_chat
            digits = re.sub(r'\D', '', phone)
            local_phone = '0' + digits[2:] if (digits.startswith('8801') and len(digits) == 13) else digits
            def _get_last_customer_text():
                last_in = ChatMessage.objects.filter(phone=local_phone, is_from_me=False).order_by('-timestamp').first()
                return last_in.message_text if last_in else ""
            prev_text = await sync_to_async(_get_last_customer_text)()
            if prev_text:
                asyncio.create_task(observe_human_reply(local_phone, req.message, prev_text))
                asyncio.create_task(update_customer_memory_from_chat(local_phone, "Operator", prev_text, req.message))
        except Exception as e:
            logger.warning(f"Error observing human reply for learning: {e}")
        try:
            asyncio.create_task(ws_chat_manager.broadcast({
                "type": "NEW_MESSAGE",
                "message": {
                    "id": saved_msg.id,
                    "whatsapp_msg_id": saved_msg.whatsapp_msg_id,
                    "phone": phone,
                    "jid": saved_msg.jid,
                    "sender_name": saved_msg.sender_name,
                    "is_from_me": True,
                    "message_text": saved_msg.message_text,
                    "media_type": saved_msg.media_type,
                    "media_url": saved_msg.media_url,
                    "media_caption": saved_msg.media_caption,
                    "file_name": saved_msg.file_name,
                    "status": "SENT",
                    "is_read": True,
                    "timestamp": saved_msg.timestamp.isoformat()
                }
            }))
        except Exception:
            pass
        return result
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"WhatsApp Engine error: {e}")

# --- AUTH MODELS & ENDPOINTS ---
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin").strip()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123").strip()

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/auth/login")
async def login(req: LoginRequest):
    u = req.username.strip()
    p = req.password.strip()
    
    is_custom_admin = (u == ADMIN_USERNAME and p == ADMIN_PASSWORD)
    is_stockwhisk = (u == "stockwhisk" and p == "imontouhid4992")
    
    if is_custom_admin or is_stockwhisk:
        token_hash = hashlib.sha256(f"{u}_{p}_crm_salt_2026".encode()).hexdigest()[:16]
        token = f"wa_crm_token_{u}_{token_hash}"
        return {
            "success": True,
            "token": token,
            "username": u,
            "name": f"{u.capitalize()} Admin"
        }
    raise HTTPException(status_code=401, detail="Invalid username or password")

@app.get("/api/auth/verify")
async def verify_token(token: str = Query(...)):
    if token == "wa_crm_token_stockwhisk_sec_4992" or token.startswith("wa_crm_token_"):
        parts = token.split("_")
        u_name = parts[3] if len(parts) > 3 else "admin"
        return {
            "valid": True,
            "username": u_name,
            "name": f"{u_name.capitalize()} Admin"
        }
    raise HTTPException(status_code=401, detail="Invalid session token")

# --- INCOMING MESSAGE WEBHOOK ---
@app.post("/api/chats/incoming")
async def incoming_message_webhook(payload: IncomingMessageWebhook):
    try:
        def _save_incoming():
            local_phone = re.sub(r'\D', '', payload.phone)
            if local_phone.startswith('8801'):
                local_phone = '0' + local_phone[2:]
            
            msg_ts = datetime.fromisoformat(payload.timestamp.replace('Z', '+00:00')) if 'T' in payload.timestamp else django_tz.now()
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
                    "timestamp": msg_ts
                }
            )
            if payload.is_from_me:
                mark_lead_contacted_by_phone(local_phone, msg_ts)
            return msg, created

        msg, created = await sync_to_async(_save_incoming)()
        if created:
            if not payload.is_from_me:
                try:
                    from crm_core.ai_bot import handle_incoming_message_for_bot
                    asyncio.create_task(
                        handle_incoming_message_for_bot(
                            phone=payload.phone,
                            jid=payload.jid,
                            sender_name=payload.sender_name or "",
                            message_text=payload.message_text or payload.media_caption or "",
                            wa_engine_url=WHATSAPP_ENGINE_URL
                        )
                    )
                except Exception as bot_err:
                    print(f"Bot dispatch error: {bot_err}")

            try:
                asyncio.create_task(ws_chat_manager.broadcast({
                    "type": "NEW_MESSAGE",
                    "message": {
                        "id": msg.id,
                        "whatsapp_msg_id": msg.whatsapp_msg_id,
                        "phone": payload.phone,
                        "jid": msg.jid,
                        "sender_name": msg.sender_name,
                        "is_from_me": msg.is_from_me,
                        "message_text": msg.message_text,
                        "media_type": msg.media_type,
                        "media_url": msg.media_url,
                        "media_caption": msg.media_caption,
                        "file_name": msg.file_name,
                        "status": msg.status,
                        "is_read": msg.is_read,
                        "timestamp": msg.timestamp.isoformat()
                    }
                }))
            except Exception:
                pass
        return {"success": True, "created": created, "id": msg.id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save incoming message: {e}")

# --- BATCH INCOMING MESSAGE WEBHOOK ---
@app.post("/api/chats/incoming/batch")
async def incoming_batch_messages_webhook(payload: BatchIncomingMessageWebhook):
    try:
        def _save_batch():
            saved_count = 0
            for item in payload.messages:
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
                if item.is_from_me:
                    mark_lead_contacted_by_phone(local_phone, ts)
                if created:
                    saved_count += 1
            return saved_count

        saved = await sync_to_async(_save_batch)()
        return {"success": True, "saved": saved, "total": len(payload.messages)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save batch incoming messages: {e}")


@app.websocket("/api/ws/chats")
async def websocket_chat_endpoint(websocket: WebSocket):
    await ws_chat_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_chat_manager.disconnect(websocket)
    except Exception:
        ws_chat_manager.disconnect(websocket)

# --- CONTINUOUS LEARNING ENGINE & SUGGESTIONS ---

@app.get("/api/reg-db/learned-suggestions")
@app.get("/api/reg-db/learned-suggestions/")
async def get_learned_suggestions_api():
    from crm_core.learning_engine import get_learned_suggestions
    return get_learned_suggestions()

@app.post("/api/reg-db/learned-suggestions/{suggestion_id}/approve")
@app.post("/api/reg-db/learned-suggestions/{suggestion_id}/approve/")
async def approve_suggestion_api(suggestion_id: str):
    from crm_core.learning_engine import approve_suggestion
    res = approve_suggestion(suggestion_id)
    if not res:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    return {"success": True, "rule": res}

@app.delete("/api/reg-db/learned-suggestions/{suggestion_id}")
@app.delete("/api/reg-db/learned-suggestions/{suggestion_id}/")
async def dismiss_suggestion_api(suggestion_id: str):
    from crm_core.learning_engine import dismiss_suggestion
    success = dismiss_suggestion(suggestion_id)
    return {"success": success}

@app.post("/api/reg-db/mine-chats")
@app.post("/api/reg-db/mine-chats/")
async def mine_chats_api(limit: int = 40):
    from crm_core.learning_engine import mine_historical_chats
    res = await mine_historical_chats(sample_limit=limit)
    return res

@app.get("/api/chats/{phone}/memory")
@app.get("/api/chats/{phone}/memory/")
async def get_customer_memory_api(phone: str):
    from crm_core.learning_engine import get_customer_memory
    digits = re.sub(r'\D', '', phone)
    local_phone = '0' + digits[2:] if (digits.startswith('8801') and len(digits) == 13) else digits
    mem = get_customer_memory(local_phone)
    if not mem:
        mem = get_customer_memory(phone)
    return mem or {}


class SuggestReplyRequest(BaseModel):
    phone: str
    hint: str | None = None

@app.post("/api/bot/suggest-reply")
@app.post("/api/bot/suggest-reply/")
async def suggest_bot_reply(payload: SuggestReplyRequest):
    digits = re.sub(r'\D', '', payload.phone)
    local_phone = '0' + digits[2:] if (digits.startswith('8801') and len(digits) == 13) else digits

    def _get_history():
        msgs = ChatMessage.objects.filter(phone=local_phone).order_by('-timestamp')[:8]
        return [
            {
                "message_text": m.message_text,
                "is_from_me": m.is_from_me,
                "timestamp": m.timestamp.isoformat()
            }
            for m in reversed(msgs)
        ]

    history = await sync_to_async(_get_history)()
    last_user_msg = next((h["message_text"] for h in reversed(history) if not h["is_from_me"]), "")
    
    if payload.hint:
        last_user_msg += f" (অপারেটরের বাড়তি নোট: {payload.hint})"

    from crm_core.ai_bot import generate_bot_reply
    bot_result = await generate_bot_reply(
        phone=local_phone,
        sender_name="Customer",
        message_text=last_user_msg or "Hello",
        chat_history=history
    )
    return {"draft_reply": bot_result.get("reply_text", "")}

@app.post("/api/chats/{phone}/memory")
@app.post("/api/chats/{phone}/memory/")
async def update_customer_memory_api(phone: str, payload: Dict[str, Any]):
    from crm_core.learning_engine import save_customer_memory, get_customer_memory
    digits = re.sub(r'\D', '', phone)
    local_phone = '0' + digits[2:] if (digits.startswith('8801') and len(digits) == 13) else digits
    
    existing = get_customer_memory(local_phone)
    existing.update(payload)
    existing["updated_at"] = datetime.now().isoformat()
    success = save_customer_memory(local_phone, existing)
    return {"success": success, "memory": existing}
