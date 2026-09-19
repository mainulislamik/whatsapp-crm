from crm_core.qa_rules_manager import format_qa_rules_for_prompt
import os
import json
import logging
import asyncio
import re
from datetime import datetime
from typing import Dict, Any, List, Optional
import httpx
import psycopg2
from asgiref.sync import sync_to_async
from django.utils import timezone as django_tz

from crm_core.models import Lead, ChatMessage, MessageTemplate, LeadCategory

logger = logging.getLogger('ai_bot')

# Configuration
STOCKWHISK_DB_URL = os.environ.get(
    'STOCKWHISK_DB_URL',
    'postgresql://stockwhisk:stockwhisk_password@stockwhisk_updated-db-1:5432/stockwhisk'
)
OMNIROUTE_URL = os.environ.get('OMNIROUTE_URL', 'http://172.20.0.1:20128/v1/chat/completions')
OMNIROUTE_KEY = os.environ.get('OMNIROUTE_KEY', 'sk-9cc...fc4f')
CONFIG_PATH = '/app/data/ai_bot_config.json'

DEFAULT_CONFIG = {
    "enabled": True,
    "auto_lead_gen": True,
    "model": "agy/gemini-3.8-flash-high",
    "fallback_model": "agy/gemini-3.7-flash",
    "reply_delay_seconds": 4,
    "disabled_phones": []
}

def load_bot_config() -> Dict[str, Any]:
    try:
        if os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
                return {**DEFAULT_CONFIG, **cfg}
    except Exception as e:
        logger.error(f"Error loading bot config: {e}")
    return DEFAULT_CONFIG.copy()

def save_bot_config(config: Dict[str, Any]):
    try:
        os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Error saving bot config: {e}")

# 1. Registration Database Inspector
def inspect_reg_db(phone: str) -> Dict[str, Any]:
    digits = re.sub(r'\D', '', phone)
    tail = digits[-10:] if len(digits) >= 10 else digits
    res = {
        "is_registered": False,
        "is_pending": False,
        "shops": [],
        "pending": [],
        "user_profile": None
    }
    if not tail:
        return res

    try:
        conn = psycopg2.connect(STOCKWHISK_DB_URL, connect_timeout=3)
        cur = conn.cursor()

        # Check Active Registered Shops
        cur.execute("""
            SELECT s.id, s.name, s.slug, s.business_type, s.phone, s.email, 
                   s.trial_ends_at, s.is_active, p.name as plan_name, p.tier
            FROM tenants_shop s
            LEFT JOIN tenants_subscriptionplan p ON s.plan_id = p.id
            WHERE s.phone LIKE %s
            LIMIT 2;
        """, (f'%{tail}',))
        for row in cur.fetchall():
            res["shops"].append({
                "id": row[0],
                "name": row[1],
                "slug": row[2],
                "business_type": row[3],
                "phone": row[4],
                "email": row[5],
                "trial_ends_at": row[6].isoformat() if row[6] else None,
                "is_active": row[7],
                "plan_name": row[8] or "Standard",
                "tier": row[9] or "Standard"
            })
        if res["shops"]:
            res["is_registered"] = True

        # Check Pending Registration
        cur.execute("""
            SELECT id, shop_name, owner_name, email, phone, business_type, created_at
            FROM accounts_pendingregistration
            WHERE phone LIKE %s
            LIMIT 1;
        """, (f'%{tail}',))
        row = cur.fetchone()
        if row:
            res["is_pending"] = True
            res["pending"].append({
                "id": row[0],
                "shop_name": row[1],
                "owner_name": row[2],
                "email": row[3],
                "phone": row[4],
                "business_type": row[5],
                "created_at": row[6].isoformat() if row[6] else None
            })

        conn.close()
    except Exception as e:
        logger.warning(f"StockWhisk Reg DB lookup warning: {e}")

    try:
        from crm_core.reg_db_manager import load_custom_reg_data
        custom_data = load_custom_reg_data()
        by_shop_id = custom_data.get("by_shop_id", {})
        
        # Attach custom info to existing shops
        for s in res["shops"]:
            sid = str(s.get("id"))
            if sid in by_shop_id:
                s["custom_notes"] = by_shop_id[sid].get("custom_notes", "")
                s["ai_instructions"] = by_shop_id[sid].get("ai_instructions", "")
                s["tags"] = by_shop_id[sid].get("tags", [])

        # Check manual entries if not registered in DB
        if not res["is_registered"]:
            for m in custom_data.get("manual_entries", []):
                m_phone = re.sub(r'\D', '', m.get("phone", "") or m.get("custom_whatsapp_phone", ""))
                if m_phone and m_phone.endswith(tail):
                    res["is_registered"] = True
                    res["shops"].append({
                        "id": m.get("id"),
                        "name": m.get("name") or m.get("shop_name", ""),
                        "business_type": m.get("business_type", "general"),
                        "phone": m.get("phone", ""),
                        "plan_name": m.get("plan_name", "Customized"),
                        "tier": m.get("plan_tier", "enterprise"),
                        "is_active": m.get("is_active", True),
                        "custom_notes": m.get("custom_notes", ""),
                        "ai_instructions": m.get("ai_instructions", ""),
                        "tags": m.get("tags", ["Manual Entry"]),
                        "is_manual": True
                    })
                    break
    except Exception as e:
        logger.warning(f"Error checking custom reg data in inspect_reg_db: {e}")

    return res

# 2. RAG Knowledge Base for StockWhisk
STOCKWHISK_KNOWLEDGE = """
সফটওয়্যার নাম: StockWhisk (স্টকহুইস্ক) - বাংলাদেশের সেরা অল-ইন-ওয়ান ক্লাউড ইআরপি ও স্মার্ট পিওএস সফটওয়্যার।
অফিসিয়াল ওয়েবসাইট: https://stockwhisk.com এবং https://app.stockwhisk.com

মূল সুবিধাসমূহ ও ২৪টি মডিউল:
1. দ্রুত পিওএস বিলিং (Fast POS Checkout): টাচ ও কিবোর্ড মোড, অফলাইন সেল মোড (ইন্টারনেট ছাড়াও বিক্রি করা যায়)।
2. ডিজিটাল ওজন স্কেল বারকোড ইন্টিগ্রেশন: সুপারশপ, মুদি, কাঁচাবাজার ও মিষ্টির দোকানের ওজন স্কেলের বারকোড (20[PLU][Weight]C) সম্পূর্ণ সাপোর্ট করে। ওজন ও দাম সরাসরি বিলে চলে আসে।
3. থার্মাল রিসিট ও টোকেন প্রিন্টিং: 58mm, 80mm ক্যাশ মেমো, সানমি (Sunmi) হ্যান্ডহেল্ড পিওএস সাপোর্ট।
4. মাল্টি-ব্রাঞ্চ ও ওয়্যারহাউজ ম্যানেজমেন্ট: এক ব্রাঞ্চ থেকে অন্য ব্রাঞ্চে সহজেই স্টক ট্রান্সফার।
5. সিরিয়াল / আইএমইআই (IMEI) ট্র্যাকিং: মোবাইল, কম্পিউটার ও ইলেকট্রনিক্স পণ্যের প্রতিটি পার্টস/ফোনের IMEI ও ওয়ারেন্টি ট্র্যাক করা যায়।
6. সার্ভিস টিকেটিং ও মোবাইল রিপেয়ার: সার্ভিস সেন্টারের কাস্টমার রিসিট, টেকনিশিয়ান অ্যাসাইন, পার্টস রিপ্লেসমেন্ট ট্র্যাকিং।
7. কিস্তি / ইএমআই (EMI) সেলস: ডাউন পেমেন্ট, মাসিক কিস্তির শিডিউল ও স্বয়ংক্রিয় ডিউ অ্যালার্ট।
8. অ্যাকাউন্টস ও লেজার: দৈনিক ক্লোজিং (Daily Settlement), আয়-ব্যয় (Expense), বাকির খাতা ও নগদ ক্যাশ ফ্লো।
9. পণ্যের মেয়াদ (Expiry Date) ট্র্যাকিং: ফার্মেসি ও খাদ্যপণ্যের মেয়াদ উত্তীর্ণ হওয়ার আগেই নোটিফিকেশন।

প্যাকেজ ও প্রাইসিং অফার:
- স্পেশাল ওপেনিং অফার (Opening Offer 6 Months): মাত্র ৳৪৯৯/মাস (৬ মাসের সাবস্ক্রিপশনে বা বাৎসরিক ৳৬০০০)। এতে পাচ্ছেন ১টি ব্রাঞ্চ, ২ জন ইউজার, ১০০ প্রোডাক্ট ট্রায়াল ও ফুল পিওএস।
- কাস্টমাইজড / এন্টারপ্রাইজ (Customized): ৳৯৯৯/মাস। আনলিমিটেড প্রোডাক্ট, ১০০০ ইউজার, ১০০০ ব্রাঞ্চ, ফুল বিজনেস ফিচার।
- ফ্রি লাইভ ডেমো: যেকোনো নতুন গ্রাহক ফ্রি ডেমো টেস্ট করতে পারেন।
"""

# 3. LLM Caller
async def call_llm(messages: List[Dict[str, str]], model: Optional[str] = None) -> str:
    cfg = load_bot_config()
    target_model = model or cfg.get("model", "agy/gemini-3.8-flash-high")
    fallback_model = cfg.get("fallback_model", "agy/gemini-3.7-flash")

    headers = {
        "Authorization": f"Bearer {OMNIROUTE_KEY}",
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient(timeout=35.0) as client:
        try:
            resp = await client.post(
                OMNIROUTE_URL,
                headers=headers,
                json={"model": target_model, "messages": messages, "temperature": 0.4}
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            else:
                logger.warning(f"OmniRoute model {target_model} returned {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.error(f"OmniRoute request failed for {target_model}: {e}")

        # Try fallback model
        if target_model != fallback_model:
            try:
                resp = await client.post(
                    OMNIROUTE_URL,
                    headers=headers,
                    json={"model": fallback_model, "messages": messages, "temperature": 0.4}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            except Exception as e:
                logger.error(f"Fallback OmniRoute request failed for {fallback_model}: {e}")

    return "আসসালামু আলাইকুম ভাই! StockWhisk-এ আপনাকে স্বাগতম। আমাদের রিপ্রেজেন্টেটিভ শীঘ্রই আপনার মেসেজের উত্তর দিয়ে সহযোগিতা করবেন। ধন্যবাদ!"

# 4. Generate AI Reply
async def generate_bot_reply(
    phone: str,
    sender_name: str,
    message_text: str,
    chat_history: List[Dict[str, Any]]
) -> Dict[str, Any]:
    reg_info = await sync_to_async(inspect_reg_db)(phone)
    
    customer_context = ""
    if reg_info.get("is_registered"):
        shop = reg_info["shops"][0]
        customer_context = f"গ্রাহক StockWhisk-এ রেজিস্টার্ড শপ ওনার। দোকানের নাম: {shop['name']}, প্যাকেজ: {shop['plan_name']}, অ্যাক্টিভ: {shop['is_active']}。"
        if shop.get("custom_notes"):
            customer_context += f"\nদোকান সম্পর্কিত কাস্টম তথ্য/নোট: {shop['custom_notes']}"
        if shop.get("ai_instructions"):
            customer_context += f"\nঅপারেটর কর্তৃক বিশেষ AI নির্দেশনা (এই অনুযায়ী গ্রাহককে ডিল করুন): {shop['ai_instructions']}"
    elif reg_info.get("is_pending"):
        p = reg_info["pending"][0]
        customer_context = f"গ্রাহক রেজিস্ট্রেশন শুরু করেছিলেন কিন্তু সম্পন্ন করেননি। দোকানের নাম: {p['shop_name']}, ওনার: {p['owner_name']}।"
    else:
        customer_context = "গ্রাহক নতুন সম্ভাব্য ক্রেতা (New Prospect/Lead)। এখনও সফটওয়্যারে রেজিস্ট্রেশন করেননি।"

    try:
        from crm_core.qa_rules_manager import format_qa_rules_for_prompt
        qa_rules_text = format_qa_rules_for_prompt()
    except Exception as e:
        logger.warning(f"Error loading QA rules: {e}")
        qa_rules_text = "কোনো বিশেষ কাস্টম প্রশ্নোত্তর সেট করা নেই। সাধারণ নলেজবেস অনুসরণ করুন।"

    system_prompt = f"""
আপনি হলেন StockWhisk (স্টকহুইস্ক)-এর আন্তরিক, স্মার্ট ও প্রফেশনাল এআই সেলস এবং কাস্টমার সাপোর্ট এক্সিকিউটিভ।
আপনার দায়িত্ব গ্রাহকের সাথে অত্যন্ত অমায়িক, প্রফেশনাল ও মিষ্টি বাংলায় কথা বলা।

গ্রাহকের বর্তমান স্ট্যাটাস:
{customer_context}

StockWhisk সফটওয়্যার সম্পর্কিত সঠিক তথ্য ভাণ্ডার:
{STOCKWHISK_KNOWLEDGE}

গ্রাহকের নির্দিষ্ট প্রশ্ন ও উত্তরের কাস্টম নির্দেশিকা (কী প্রশ্ন করলে কী উত্তর দেবেন - FAQ Rules):
{qa_rules_text}

আপনার কথোপকথনের নিয়মাবলী:
1. গ্রাহক যদি সালাম বা কুশল বিনিময় করে, সুন্দর করে সালামের উত্তর দিন (যেমন: "আসসালামু আলাইকুম ভাই/ম্যাম")।
2. তথ্য দেওয়ার সময় সম্পূর্ণ সঠিক ও বাস্তবসম্মত তথ্য দিন। সফটওয়্যারে নেই এমন কোনো কাল্পনিক ফিচার বা ডিসকাউন্ট উল্লেখ করবেন না।
3. যদি গ্রাহক গ্রোসারি বা সুপারশপের কথা বলে, ডিজিটাল ওজন স্কেলের বারকোড (20[PLU][Weight]C) ও ফাস্ট বিলিং তুলে ধরুন।
4. যদি মোবাইল বা ইলেকট্রনিক্সের কথা বলে, IMEI ট্র্যাকিং, সার্ভিসিং টিকেটিং ও ওয়ারেন্টি ম্যানেজমেন্টের কথা বলুন।
5. যদি প্রাইস জানতে চায়, স্পেশাল ওপেনিং অফার (মাত্র ৳৪৯৯/মাস, ৬ মাস) এবং কাস্টমাইজড প্ল্যান (৳৯৯৯/মাস) পরিষ্কারভাবে জানান এবং ফ্রি লাইভ ডেমো দেখার আমন্ত্রণ জানান।
6. কথোপকথনের ফাঁকে মিষ্টিভাবে গ্রাহকের দোকানের নাম, ব্যবসার ক্যাটাগরি বা কয়টি ব্রাঞ্চ আছে তা জানার চেষ্টা করুন (যেমন: "ভাই আপনার দোকানের নামটা কি জানতে পারি? কয়টি ব্রাঞ্চ রয়েছে আপনার?")।
7. উত্তর খুব বেশি বড় বা ক্লান্তিকর করবেন না। হোয়াটসঅ্যাপে পড়ার উপযোগী আকর্ষণীয় ২-৩টি ছোট অনুচ্ছেদ বা প্রয়োজনীয় পয়েন্ট আকারে লিখুন।
"""

    messages = [{"role": "system", "content": system_prompt}]
    
    for m in chat_history[-6:]:
        role = "assistant" if m.get("is_from_me") else "user"
        messages.append({"role": role, "content": m.get("message_text", "")})

    messages.append({"role": "user", "content": message_text})

    reply_text = await call_llm(messages)

    return {
        "reply_text": reply_text,
        "reg_info": reg_info
    }

# 5. Auto Lead Generation & Intelligence Extractor
async def extract_and_save_lead(
    phone: str,
    sender_name: str,
    all_user_messages: str
) -> Optional[Dict[str, Any]]:
    cfg = load_bot_config()
    if not cfg.get("auto_lead_gen", True):
        return None

    extract_prompt = f"""
Analyze the following customer WhatsApp messages and extract structured business lead intelligence for CRM.
Return ONLY valid raw JSON with no markdown backticks and no explanation.

Customer Messages:
--- {all_user_messages} ---

Required JSON Schema:
{{
  "shop_name": "extracted shop/business name or empty string",
  "owner_name": "extracted owner name or empty string",
  "category": "one of: Grocery, Electronics, Clothing, Pharmacy, Restaurant, Hardware, Departmental, General",
  "district": "extracted city/district in Bangladesh or empty string",
  "status": "QUALIFIED if customer shared shop name or asked pricing/demo, else INTERESTED",
  "notes": "one concise bullet point summarizing their business requirements and interest"
}}
"""
    try:
        raw_json = await call_llm([
            {"role": "system", "content": "You are a CRM Lead Data Extraction AI. Return ONLY JSON."},
            {"role": "user", "content": extract_prompt}
        ])
        clean_json = re.sub(r'```json|```', '', raw_json).strip()
        data = json.loads(clean_json)

        shop_name = data.get("shop_name", "").strip() or sender_name or f"Lead {phone[-4:]}"
        owner_name = data.get("owner_name", "").strip() or sender_name
        category = data.get("category", "General").strip()
        status = data.get("status", "INTERESTED")
        notes = data.get("notes", "").strip()
        district = data.get("district", "").strip()

        def _update_lead():
            lead = Lead.objects.filter(phone=phone).first()
            if not lead:
                lead = Lead(
                    phone=phone,
                    shop_name=shop_name,
                    owner_name=owner_name,
                    category=category,
                    status=status,
                    notes=notes,
                    address=district,
                    is_contacted=True,
                    last_contacted_at=django_tz.now()
                )
                lead.save()
            else:
                changed = False
                if shop_name and lead.shop_name.startswith("Lead "):
                    lead.shop_name = shop_name
                    changed = True
                if owner_name and not lead.owner_name:
                    lead.owner_name = owner_name
                    changed = True
                if category != "General" and lead.category == "General":
                    lead.category = category
                    changed = True
                if notes and notes not in lead.notes:
                    lead.notes = (lead.notes + " | " + notes).strip(" |")
                    changed = True
                if district and not lead.address:
                    lead.address = district
                    changed = True
                if changed:
                    lead.save()
            return {
                "id": lead.id,
                "shop_name": lead.shop_name,
                "category": lead.category,
                "status": lead.status
            }

        result = await sync_to_async(_update_lead)()
        return result
    except Exception as e:
        logger.error(f"Auto lead extraction error: {e}")
        return None

# 6. Main Handler called on incoming WhatsApp message
async def handle_incoming_message_for_bot(
    phone: str,
    jid: str,
    sender_name: str,
    message_text: str,
    wa_engine_url: str = "http://whatsapp-engine:5001"
):
    cfg = load_bot_config()
    if not cfg.get("enabled", True):
        logger.info("AI Bot is disabled globally.")
        return

    clean_digits = re.sub(r'\D', '', phone)
    disabled_list = [re.sub(r'\D', '', p) for p in cfg.get("disabled_phones", [])]
    if clean_digits in disabled_list:
        logger.info(f"AI Bot is paused for {phone}.")
        return

    def _fetch_history():
        msgs = ChatMessage.objects.filter(phone=phone).order_by('-timestamp')[:8]
        return [
            {
                "message_text": m.message_text,
                "is_from_me": m.is_from_me,
                "timestamp": m.timestamp.isoformat()
            }
            for m in reversed(msgs)
        ]

    history = await sync_to_async(_fetch_history)()

    delay = cfg.get("reply_delay_seconds", 4)
    await asyncio.sleep(delay)

    bot_result = await generate_bot_reply(
        phone=phone,
        sender_name=sender_name,
        message_text=message_text,
        chat_history=history
    )
    reply_text = bot_result.get("reply_text")
    if not reply_text:
        return

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            req_data = {
                "phone": phone,
                "text": reply_text
            }
            resp = await client.post(f"{wa_engine_url}/send-message", json=req_data)
            if resp.status_code == 200:
                logger.info(f"AI Bot successfully sent reply to {phone}")
            else:
                logger.warning(f"wa-engine returned {resp.status_code} on AI reply: {resp.text}")
        except Exception as e:
            logger.error(f"Failed to deliver AI Bot message to wa-engine: {e}")

    all_user_text = " ".join([h["message_text"] for h in history if not h["is_from_me"]] + [message_text])
    asyncio.create_task(extract_and_save_lead(phone, sender_name, all_user_text))
