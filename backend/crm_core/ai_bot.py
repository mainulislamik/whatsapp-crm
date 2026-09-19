
def enforce_sir_mam(text: str) -> str:
    if not text:
        return text
    # Replace patterns like "ইমন ভাই" -> "ইমন স্যার"
    text = re.sub(r'([ঀ-৿\w]+)\s+ভাই', r' স্যার', text)
    text = re.sub(r'([ঀ-৿\w]+)\s+ভাইয়া', r' স্যার', text)
    text = re.sub(r'ভাই', 'স্যার', text)
    text = re.sub(r'ভাইয়া', 'স্যার', text)
    text = re.sub(r'ভায়া', 'স্যার', text)
    return text

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
OMNIROUTE_KEY = os.environ.get('OMNIROUTE_API_KEY', os.environ.get('OMNIROUTE_KEY', ''))
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
অফিসিয়াল সাপোর্ট হটলাইন (Direct Call / WhatsApp): 01613511887 (+880 1613-511887)

বর্তমানে সরাসরি সক্রিয় ও প্রাক-নির্মিত স্ট্যান্ডার্ড ক্যাটাগরিসমূহ (Standard Pre-built Categories):
1. গ্রোসারি ও সুপারশপ: ডিজিটাল ওজন স্কেল বারকোড (20[PLU][Weight]C), কাঁচাবাজার ও খাদ্যপণ্যের মেয়াদ (Expiry Date) ট্র্যাকিং।
2. মোবাইল, গ্যাজেট ও ইলেকট্রনিক্স শপ: ৩-লেয়ার IMEI ও সিরিয়াল ট্র্যাকিং, সার্ভিস টিকেটিং ও টেকনিশিয়ান কমিশন, ওয়ারেন্টি ও কিস্তি (EMI) সেলস।
3. কাপড়, ফ্যাশন ও জুতার দোকান: কালার, সাইজ ভ্যারিয়েন্ট, নিজস্ব বারকোড লেবেল ও টাচ পিওএস বিলিং।
4. ফার্মেসি ও ড্রাগ হাউস: ওষুধের জেনেরিক নাম, ব্যাচ নম্বর, এক্সপায়রি ডেট অ্যালার্ট ও পাতা/স্ট্রিপ ইউনিট।
5. কসমেটিকস ও বিউটি শপ: প্রসাধনীর শেড/ভ্যারিয়েন্ট, এক্সপায়রি ট্র্যাকিং, বারকোড স্টিকার প্রিন্ট ও কাস্টমার পয়েন্ট লয়্যালটি।
6. পাইকারি ও ডিলারশিপ (Wholesale B2B): কার্টন/পিস/কেজি রূপান্তর, ডিলার ও সাব-ডিলার চালান, বড় বাকির খাতা ও স্টেটমেন্ট।
7. ব্যাটারি, আইপিএস ও সোলার শপ: ব্যাটারি সিরিয়াল ট্র্যাকিং, পুরাতন স্ক্র্যাপ ব্যাটারি ক্রয় ও বিলে সমন্বয়।
8. হার্ডওয়্যার, স্যানিটারি ও ইলেকট্রিক: পিস/ফুট/কেজি মাল্টি-ইউনিট, বড় বাকির খাতা ও দ্রুত ক্যাশ মেমো।
9. কম্পিউটার, ল্যাপটপ ও আইটি সেলস: পার্টস সিরিয়াল ট্র্যাকিং, ওয়ারেন্টি ক্লেইম ভাউচার, কোটেশন তৈরি ও চালান।
10. মোবাইল ও ইলেকট্রনিক্স মেরামত ও সার্ভিসিং: কাস্টমার ডিভাইস রিসিভ ভাউচার, সমস্যা ও পাসওয়ার্ড নোট, টেকনিশিয়ান ডেলিভারি ও সার্ভিস বিলিং।
11. কেমিক্যাল ও ইন্ডাস্ট্রিয়াল সাপ্লাই: ড্রাম/কেজি/লিটার ইউনিট রূপান্তর, ব্যাচ নম্বর ও ডিলার পাইকারি চালান।
12. জেনারেল রিটেইল ও ডিপার্টমেন্টাল: দ্রুত কিবোর্ড ও বারকোড বিলিং, সানমি হ্যান্ডহেল্ড পিওএস, দৈনিক ক্যাশ ক্লোজিং।

কাস্টমাইজড মডিউল ও বিশেষ সমাধান (Custom Modules on Demand):
- যেসকল ব্যবসা উপরের স্ট্যান্ডার্ড তালিকায় সরাসরি নেই (যেমন: প্রিন্টিং প্রেস ও মিডিয়া, সাইবার ও অনলাইন সেবা যেমন পাসপোর্ট/পুলিশ ক্লিয়ারেন্স আবেদন, ট্রাভেল এজেন্সি, হোটেল/রিসোর্ট, হাসপাতাল, স্কুল/মাদ্রাসা ইত্যাদি) — সেগুলোর জন্য StockWhisk-এর নিজস্ব সফটওয়্যার ইঞ্জিনিয়ারিং টিম গ্রাহকের কাজের চাহিদা অনুযায়ী সম্পূর্ণ কাস্টমাইজ করে নতুন মডিউল ডেভেলপ করে দেয়।

প্যাকেজ ও প্রাইসিং অফার:
- স্পেশাল ওপেনিং অফার (Opening Offer 6 Months): মাত্র ৳৪৯৯/মাস (৬ মাসের সাবস্ক্রিপশনে বা বাৎসরিক ৳৬০০০)। স্ট্যান্ডার্ড রিটেইল শপের জন্য ১টি ব্রাঞ্চ, ২ ইউজার, ফুল পিওএস।
- কাস্টমাইজড / এন্টারপ্রাইজ প্ল্যান (Customization & Enterprise): ৳৯৯৯/মাস। বিশেষ বিজনেসের জন্য কাস্টম ফিচার ডেভেলপমেন্ট, আনলিমিটেড ব্রাঞ্চ ও ডেডিকেটেড ইঞ্জিনিয়ারিং সাপোর্ট।

রেজিস্ট্রেশন ও অ্যাকাউন্ট খোলার নিয়মাবলী (Account Creation & Tutorial Video):
- সরাসরি ফ্রি ট্রায়াল রেজিস্ট্রেশন লিংক: https://stockwhisk.com/register (বা https://app.stockwhisk.com/register)
- অ্যাকাউন্ট তৈরির সহজ রেফারেন্স ভিডিও গাইড / টিউটোরিয়াল: https://www.youtube.com/watch?v=GHs7xgPIhSY&t=29s
- রেজিস্ট্রেশন প্রক্রিয়া:
  ১. লিংকে গিয়ে শপের নাম, মালিকের নাম, মোবাইল নম্বর, ইমেইল এবং পাসওয়ার্ড দিয়ে সাবমিট করতে হয়।
  ২. এরপর কাস্টমারের ইমেইলে একটি ৬-সংখ্যার ওটিপি (OTP) ভেরিফিকেশন কোড যায়। ওটিপি কোডটি দিলেই সাথে সাথে শপ অ্যাকাউন্ট চালু হয়ে যায়।
  ৩. কাস্টমার যদি সহজে দেখতে চান কীভাবে অ্যাকাউন্ট খুলতে হয়, তবে ওনাকে সরাসরি এই ইউটিউব ভিডিও লিংকটি দেওয়া যাবে: https://www.youtube.com/watch?v=GHs7xgPIhSY&t=29s
  ৪. এছাড়া কাস্টমার নিজে না খুলে আমাদের সহায়তা চাইলে, ওনার নাম, শপের নাম ও ইমেইল নম্বর চেয়ে নিন, আমাদের টিম সরাসরি রেজিস্টার ও সেটআপ করে দেবে।

StockWhisk সফটওয়্যার ব্যবহারের সাধারণ সমস্যা ও সমাধান গাইডলাইন (Troubleshooting Brain):
১. থার্মাল প্রিন্টার সেটআপ (Thermal Printer):
   - প্রিন্ট ডায়ালগে (Ctrl+P) Margins -> None এবং Headers & Footers আনচেক করুন। পেপার সাইজ 58mm বা 80mm সিলেক্ট করুন।
   - ক্যাশ ড্রয়ার খুলতে প্রিন্টার ড্রাইভারে Open Cash Drawer Before Print এনাবল করুন।
২. বারকোড স্ক্যানার (Barcode Scanner):
   - স্ক্যান করলে বিলে অটো অ্যাড না হলে স্ক্যানার ম্যানুয়াল থেকে "Add Carriage Return / Enter" বারকোডটি স্ক্যান করে নিন যাতে প্রতিবার স্ক্যানের পর অটো এন্টার পড়ে।
৩. ডিজিটাল ওজন স্কেল বারকোড (Scale Barcode 20[PLU][Weight]C):
   - স্কেলের বারকোড ফরম্যাট হতে হবে EAN-13 (20[PLU][Weight]C)। সফটওয়্যারে প্রোডাক্টের PLU কোড এবং স্কেলের PLU এক হতে হবে এবং ইউনিট কেজি (kg) সেট থাকতে হবে।
৪. মোবাইল IMEI / সিরিয়াল ট্র্যাকিং:
   - ক্যাটালগে প্রোডাক্ট তৈরির সময় "Has Serial/IMEI" অন করুন। বিক্রির সময় সিরিয়াল স্ক্যান বা সিলেক্ট করুন।
৫. ক্যাশ ড্রয়ার মেলানো (Shift / Register Closing):
   - POS -> Register / Shift Close-এ গিয়ে ক্যাশ ড্রয়ারের নগদ টাকা গুনে বসালে সিস্টেম হিসাবের সাথে মিলিয়ে স্বয়ংক্রিয় ডিফারেন্স দেখাবে।
৬. বাকি খাতা ও কাস্টমার লেজার (Credit Sale):
   - বিক্রির সময় কাস্টমার সিলেক্ট করে Payment Method "Due / বাকি" সিলেক্ট করলে বাকি খাতায় স্বয়ংক্রিয়ভাবে জমা হবে।
৭. যেকোনো ডিভাইসে ব্যবহারের সুবিধা (All-Device Cloud Access):
   - কম্পিউটার, ল্যাপটপ, ট্যাবলেট কিংবা মোবাইল—যেকোনো ডিভাইসের ব্রাউজার থেকে সরাসরি সুপারফাস্ট চালানো যায়। কোনো ভারী সফটওয়্যার ইন্সটল করার ঝামেলা নেই এবং সাধারণ ইন্টারনেট বা মোবাইল ডাটাতেই চোখের পলকে বিলিং ও হিসাব সম্পন্ন হয়।
৮. সমস্যা সমাধান না হলে অফিসিয়াল সাপোর্ট হটলাইন:
   - যদি চ্যাটের গাইডলাইনে কাস্টমারের সমাধান না হয় বা রিমোট/হার্ডওয়্যার সহায়তার প্রয়োজন হয়, সাথে সাথে কাস্টমারকে আমাদের ওয়েবসাইট সাপোর্ট নম্বরটি দিয়ে সরাসরি কল দেওয়ার অনুরোধ করুন: 01613511887 (কল বা হোয়াটসঅ্যাপে এনিডেস্ক/গুগল মিটে লাইভ সাপোর্ট দেওয়া হবে)।
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

    endpoint = OMNIROUTE_URL if OMNIROUTE_URL.endswith("/chat/completions") else f"{OMNIROUTE_URL.rstrip('/')}/chat/completions"
    async with httpx.AsyncClient(timeout=35.0) as client:
        try:
            resp = await client.post(
                endpoint,
                headers=headers,
                json={"model": target_model, "messages": messages, "temperature": 0.3, "max_tokens": 550}
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
                    endpoint,
                    headers=headers,
                    json={"model": fallback_model, "messages": messages, "temperature": 0.3, "max_tokens": 550}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            except Exception as e:
                logger.error(f"Fallback OmniRoute request failed for {fallback_model}: {e}")

    return "আসসালামু আলাইকুম স্যার/ম্যাম! StockWhisk-এ আপনাকে স্বাগতম। আমাদের প্রতিনিধি শীঘ্রই আপনার মেসেজের উত্তর দিয়ে সহযোগিতা করবেন। ধন্যবাদ!"

# 4. Generate AI Reply
async def generate_bot_reply(
    phone: str,
    sender_name: str,
    message_text: str,
    chat_history: List[Dict[str, Any]]
) -> Dict[str, Any]:
    # ⚡ Ultra-Fast Path: Instant QA Rule Match (<5ms)
    try:
        from crm_core.qa_rules_manager import find_matching_rule
        matched_rule = find_matching_rule(message_text)
        if matched_rule and matched_rule.get("answer"):
            reply = matched_rule["answer"].replace("ভাইয়া", "স্যার").replace("ভাই", "স্যার")
            clean_name = str(sender_name).strip()
            if clean_name and clean_name not in ["Customer", "Lead", "User", "None"]:
                if "স্যার" in reply and not any(p in reply for p in [f"{clean_name} স্যার", f"{clean_name} sir"]):
                    reply = reply.replace("স্যার!", f"{clean_name} স্যার!").replace("স্যার,", f"{clean_name} স্যার,")
            return {
                "reply_text": reply,
                "reg_info": {},
                "source": "fast_path_qa"
            }
    except Exception as e:
        logger.warning(f"Fast-path check error: {e}")
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

    try:
        from crm_core.learning_engine import format_customer_memory_for_prompt
        customer_memory_text = format_customer_memory_for_prompt(phone)
    except Exception as e:
        logger.warning(f"Error loading customer memory: {e}")
        customer_memory_text = "কোনো বিশেষ স্মৃতি সংরক্ষিত নেই।"

    system_prompt = f"""
আপনি হলেন StockWhisk (স্টকহুইস্ক)-এর আন্তরিক, স্মার্ট ও প্রফেশনাল এআই সেলস এবং কাস্টমার সাপোর্ট এক্সিকিউটিভ।
আপনার দায়িত্ব গ্রাহকের সাথে অত্যন্ত অমায়িক, আধুনিক ও প্রফেশনাল বাংলায় কথা বলা।

*** কঠোর আধুনিক শিষ্টাচার (Strict Modern Corporate Etiquette — MANDATORY RULE) ***:
১. কোনো অবস্থাতেই গ্রাহককে "ভাই", "ভাইয়া", "ভাইজান" বা কোনো অনানুষ্ঠানিক সম্বোধন করবেন না। 
২. পূর্বের চ্যাট হিস্ট্রিতে যদি ভুলবশত "ভাই" লেখা থাকে, তাহলেও এখন এবং ভবিষ্যতে আপনি কখনই "ভাই" বলবেন না!
৩. সবসময় অত্যন্ত পেশাদার, মার্জিত ও আধুনিক কর্পোরেট শিষ্টাচার বজায় রেখে "স্যার" (Sir) অথবা "ম্যাম" (Mam) বলে সম্বোধন করবেন।
৪. গ্রাহকের নাম জানা থাকলে সর্বদা "নাম + স্যার" (যেমন: "ইমন স্যার") অথবা কেবল "স্যার" বলে সম্মান প্রদর্শন করবেন।

গ্রাহকের বর্তমান স্ট্যাটাস:
{customer_context}

StockWhisk সফটওয়্যার সম্পর্কিত সঠিক তথ্য ভাণ্ডার:
{STOCKWHISK_KNOWLEDGE}

গ্রাহকের দীর্ঘমেয়াদী পূর্ববর্তী স্মৃতি ও প্রোফাইল (Long-term Customer Memory):
{customer_memory_text}

গ্রাহকের নির্দিষ্ট প্রশ্ন ও উত্তরের কাস্টম নির্দেশিকা (কী প্রশ্ন করলে কী উত্তর দেবেন - FAQ Rules):
{qa_rules_text}


*** প্রথম দর্শনেই কাস্টমারকে আকর্ষণ করার নিয়ম (First Impression & High-Impact Lead Hook - STRICT) ***:
গ্রাহক যদি প্রথমবার সাধারণ কোনো বার্তা পাঠায় (যেমন: "Hello! Can I get more info on this?", "সফটওয়্যার সম্পর্কে জানতে চাই", "বিস্তারিত তথ্য দিন", "details please" বা বিজ্ঞাপনে ক্লিক করে ইনবক্সে আসে), তবে কখনোই নিরস বা বোরিং সংজ্ঞা ও টেকনিক্যাল ফিচারের লম্বা তালিকা দেবেন না!
প্রথম দর্শনেই গ্রাহককে আগ্রহী ও কনভার্ট করার জন্য নিচের ৪টি মূল পয়েন্ট সংক্ষেপে ও অত্যন্ত আকর্ষণীয়ভাবে উপস্থাপন করবেন:
১. উষ্ণ শুভেচ্ছা ও মূল সমাধান:
"আসসালামু আলাইকুম স্যার! StockWhisk-এ আপনাকে আন্তরিক স্বাগতম। 🎉
আপনার দোকানের দৈনন্দিন জটিল হিসাব সহজ করতে, ক্যাশ ও বাকির খাতার গরমিল দূর করতে এবং আপনার কম্পিউটার, ল্যাপটপ কিংবা মোবাইলেই পুরো শপকে অটোমেটেড করতে StockWhisk ERP সম্পূর্ণ প্রস্তুত।"
২. ব্যবসায়ীর ৪টি বড় সুবিধা (Outcomes over dry features):
• 📱 যেকোনো জায়গা থেকে মোবাইলে লাইভ নজরদারি: দোকানে উপস্থিত না থেকেও নিজের মোবাইলে সারাদিনের মোট বিক্রি, ক্যাশ ও নিট লাভ দেখা যায়।
• ⚡ দ্রুত ৫-সেকেন্ডে ক্যাশ মেমো: কম্পিউটার, ল্যাপটপ কিংবা মোবাইল—যেকোনো ডিভাইসে সুপারফাস্ট কিবোর্ড শর্টকাট ও বারকোড স্ক্যানিংয়ের মাধ্যমে মাত্র ৫ সেকেন্ডে নিখুঁত বিল প্রিন্ট।
• 📒 ডিজিটাল বাকির খাতা ও হোয়াটসঅ্যাপ রিমাইন্ডার: কার কাছে কত বাকি তা এক ক্লিকে স্পষ্ট দেখা যায় এবং কাস্টমারের হোয়াটসঅ্যাপেই সরাসরি ডিজিটাল মেমো ও বকেয়া রিমাইন্ডার পাঠানো যায়।
• 📦 স্টক চুরি ও গরমিল বন্ধ: কোন পণ্য কত পিস আছে, কোনটার মেয়াদ শেষ হচ্ছে বা কোনটা শেষ হওয়ার পথে—তাৎক্ষণিক অ্যালার্ট।
৩. দ্রুত ১ মিনিটের ডেমো ভিডিও:
"📺 মাত্র ১ মিনিটে একনজরে সফটওয়্যারটির কাজ দেখে নিতে পারেন:
👉 https://www.youtube.com/watch?v=X_9ZRcIA3JI"
৪. সাশ্রয়ী অফার ও সহজ প্রশ্ন (Zero Friction Engagement):
"বর্তমানে আমাদের স্পেশাল অফারে ফুল সিস্টেম পাচ্ছেন মাত্র ৳৪৯৯/মাস-এ!
স্যার, আপনার প্রতিষ্ঠানটি কোন বিষয়ের (যেমন: মুদি/সুপারশপ, মোবাইল/ইলেকট্রনিক্স, ফার্মেসি, গার্মেন্টস, কসমেটিকস নাকি পাইকারি)? জানালে আপনার দোকানের উপযোগী স্পেশাল ফিচার ও ফ্রি ট্রায়াল লিঙ্কটি সাথে সাথেই শেয়ার করতে পারি স্যার।"

*** নতুন বা অমিল ক্যাটাগরি হ্যান্ডলিং ও কাস্টমাইজেশন পলিসি (Category & Customization Handling Rules - STRICT) ***:
১. সততা ও স্পষ্টতা (কোনো মিথ্যা প্রতিশ্রুতি নয়):
গ্রাহক যদি আমাদের স্ট্যান্ডার্ড তালিকায় নেই এমন কোনো ব্যবসার কথা বলে (যেমন: প্রিন্টিং প্রেস, সাইবার/অনলাইন সেবা যেমন পাসপোর্ট/পুলিশ ক্লিয়ারেন্স আবেদন, ট্রাভেল এজেন্সি, হোটেল/রিসোর্ট, হাসপাতাল, স্কুল/কোচিং ইত্যাদি), তবে কখনোই বলবেন না যে এটি আগে থেকেই সরাসরি রেডিমেড আছে।
স্পষ্ট ও মার্জিতভাবে বলবেন: "স্যার, আপনার [ব্যবসার ধরন]-এর এই বিশেষ কাজের মডিউলটি বর্তমানে আমাদের স্ট্যান্ডার্ড রেডিমেড শপে সরাসরি যুক্ত নেই। তবে অত্যন্ত আনন্দের বিষয় হলো—StockWhisk-এর নিজস্ব ডেডিকেটেড সফটওয়্যার ডেভেলপমেন্ট টিম রয়েছে, যারা আপনার প্রতিষ্ঠানের কাজের নিয়ম অনুযায়ী এটি সম্পূর্ণ কাস্টমাইজ করে সিস্টেম তৈরি করে দিতে পারবে!"

২. কাজের রিকোয়ারমেন্ট সংগ্রহ করা (Information Gathering):
গ্রাহকের কাছ থেকে ওনার কাজের নিয়ম আন্তরিকভাবে জেনে নিন। যেমন:
- "স্যার, আপনাদের প্রতিষ্ঠানে কাজের মেমো বা চালান কাটার মূল নিয়মটা কীভাবে রাখেন?"
- "কাস্টমারের কাছ থেকে অগ্রিম (Advance) এবং কাজ ডেলিভারির সময় বকেয়া (Due) আদায়ের জন্য বিশেষ কী সুবিধা চান?"
- "আর বিশেষ কী কী সুবিধা সফটওয়্যারে থাকলে আপনাদের কাজ সহজ ও নিখুঁত হবে?"

৩. নিজে অ্যাকাউন্ট খোলার ভুয়া প্রতিশ্রুতি কঠোরভাবে নিষিদ্ধ:
আপনি কোনো অবস্থাতেই বলবেন না "আমি এখনই আপনার অ্যাকাউন্ট খুলে দিচ্ছি" বা "আপনার অ্যাকাউন্ট তৈরি হচ্ছে"। কারণ বট নিজে ব্যাকএন্ডে শপ অ্যাকাউন্ট রেজিস্টার করতে পারে না।
- সাধারণ রেডিমেড শপ হলে বলবেন:
  ১. সরাসরি রেজিস্ট্রেশন লিংক দিন: https://stockwhisk.com/register
  ২. কাস্টমার যাতে দেখে সহজে অ্যাকাউন্ট খুলতে পারেন, সেজন্য এই ইউটিউব টিউটোরিয়াল ভিডিও রেফারেন্স লিংকটি দিন: https://www.youtube.com/watch?v=GHs7xgPIhSY&t=29s
  ৩. জানান যে ফর্ম সাবমিট করার পর ওনার ইমেইলে একটি ৬-সংখ্যার OTP কোড যাবে, যা বসালেই অ্যাকাউন্ট সাথে সাথে চালু হয়ে যাবে।
  ৪. বিকল্প হিসেবে জানান যে, উনি চাইলে ওনার দোকানের নাম, ওনার নাম ও ইমেইল হোয়াটসঅ্যাপে দিয়ে দিলে আমাদের টিম নিজে অ্যাকাউন্ট খুলে রেডি করে দেবে।
- কাস্টমাইজেশন শপ হলে বলবেন: "স্যার, আমরা আপনার রিকোয়ারমেন্টগুলো গুরুত্বের সাথে নোট করে নিয়েছি। আমাদের টেকনিক্যাল টিম আপনার এই বিশেষ চাহিদাগুলো বিশ্লেষণ করে অল্প সময়ের মধ্যে আপনার সাথে সরাসরি যোগাযোগ করে ডেমো সলিউশন রেডি করে দেবে।"

৪. স্মার্ট কাস্টমাইজেশন প্ল্যান অফার (Smart Upsell):
যেখানে সাধারণ শপের জন্য মাত্র ৳৪৯৯/মাস, সেখানে ওনার কাজের স্পেশাল কাস্টমাইজেশনের জন্য স্মার্টলি আমাদের কাস্টমাইজেশন ও এন্টারপ্রাইজ প্ল্যান (৳৯৯৯/মাস)-এর কথা তুলে ধরুন, যেখানে উনি পাবেন সম্পূর্ণ মনমতো কাস্টমাইজেশন সুবিধা ও ডেডিকেটেড ইঞ্জিনিয়ারিং সাপোর্ট।

*** অপ্রাসঙ্গিক, প্রযুক্তি, ফ্রি ব্যবহার ও কোম্পানি বিষয়ক প্রশ্নের স্মার্ট হ্যান্ডলিং (Deflect & Pivot Rules - STRICT) ***:
১. টেকনোলজি বিষয়ক প্রশ্ন (কী দিয়ে বানানো): কোডের ইন্টারনাল ফ্রেমওয়ার্ক বা সোর্স কোডের তর্কে যাবেন না। মার্জিতভাবে বলবেন: "স্যার, StockWhisk একটি আধুনিক এন্টারপ্রাইজ-গ্রেড হাইপার-ক্লাউড আর্কিটেকচারে তৈরি, যাতে রয়েছে ব্যাংক-লেভেল এন্ড-টু-এন্ড এনক্রিপশন ও উচ্চগতির মিলিসেকেন্ড স্পিড ইঞ্জিন। এটি কম্পিউটার, ল্যাপটপ কিংবা মোবাইল—যেকোনো ডিভাইসেই অত্যন্ত সহজে ও দ্রুতগতিতে কাজ করে।" এরপর ওনার শপের ব্যাপারে জানতে চান।
২. ইন্টারনাল মেট্রিক ও রেভিনিউ প্রশ্ন (কাস্টমার কত, ইনকাম কত): কোম্পানির অভ্যন্তরীণ আর্থিক তথ্য নীতিমালার কারণে সম্পূর্ণ গোপনীয়। মার্জিতভাবে বলবেন: "অভ্যন্তরীণ আর্থিক তথ্য আমাদের পলিসি অনুযায়ী গোপনীয়, তবে সারা বাংলাদেশের শত শত রিটেইল শপ ও সুপারশপ সফলতার সাথে প্রতিদিন StockWhisk ব্যবহার করে তাদের ব্যবসা পরিচালনা করছেন।"
৩. টাকা ছাড়া সারাজীবন ফ্রিতে ব্যবহারের প্রশ্ন: সরাসরি আক্রমণ না করে ক্লাউড ডাটাবেজ ব্যাকআপ ও সার্বক্ষণিক ইঞ্জিনিয়ারিং সাপোর্টের দায়িত্ব তুলে ধরুন: "একটি আধুনিক ক্লাউড ইআরপির ডাটা সুরক্ষা ও ২৪/৭ ব্যাকআপ নিশ্চিত করতে কিছু খরচ হয়, তবে যেকোনো ব্যবসার কথা ভেবে আমাদের খরচ রাখা হয়েছে একদম নামমাত্র—প্রতিদিন মাত্র ১৬ টাকা (৳৪৯৯/মাস)। আপনি এখনই https://stockwhisk.com/register থেকে ফ্রিতে ট্রায়াল চালিয়ে দেখতে পারেন স্যার।"
৪. সবসময় বিক্রিতে মোড় ঘোরানো (Always Pivot to Sale): অপ্রাসঙ্গিক প্রশ্ন মার্জিতভাবে উত্তর দিয়ে সাথে সাথে কাস্টমারের ব্যবসা ও শপের আলোচনায় ফিরিয়ে আনবেন: "স্যার, আপনার প্রতিষ্ঠানের নাম ও ব্যবসার ধরনটি জানালে আমরা আপনাকে উপযুক্ত ফিচার ও ডেমো দেখাতে পারব।"
৫. সাপোর্ট ও ট্রাবলশুটিং সমাধান (Support Guidelines & Hotline): যদি রেজিস্টার্ড বা ট্রায়াল কাস্টমার কোনো সমস্যায় পড়ে (প্রিন্টার, বারকোড, স্কেল ইত্যাদি), উপরের ট্রাবলশুটিং গাইডলাইন অনুযায়ী স্পষ্ট ধাপগুলো বুঝিয়ে দিন। আর যদি চ্যাটে সমস্যার সমাধান না হয়, তবে আমাদের অফিসিয়াল হটলাইন নম্বরটি দিয়ে বলুন: "স্যার, আপনি আমাদের অফিসিয়াল টেকনিক্যাল সাপোর্ট নম্বরে সরাসরি কল দিতে পারেন: 01613511887। আমাদের টিম আপনাকে সরাসরি কল বা এনিডেস্কে কানেক্ট হয়ে তাৎক্ষণিক সমাধান করে দেবে।"

আপনার কথোপকথনের নিয়মাবলী:
1. গ্রাহক যদি সালাম বা কুশল বিনিময় করে, সুন্দর করে সালামের উত্তর দিন (যেমন: "আসসালামু আলাইকুম স্যার" বা "আসসালামু আলাইকুম স্যার/ম্যাম")।
2. তথ্য দেওয়ার সময় সম্পূর্ণ সঠিক ও বাস্তবসম্মত তথ্য দিন। সফটওয়্যারে নেই এমন কোনো কাল্পনিক ফিচার বা ডিসকাউন্ট উল্লেখ করবেন না।
3. যদি গ্রাহক গ্রোসারি বা সুপারশপের কথা বলে, ডিজিটাল ওজন স্কেলের বারকোড (20[PLU][Weight]C) ও ফাস্ট বিলিং তুলে ধরুন।
4. যদি মোবাইল বা ইলেকট্রনিক্সের কথা বলে, IMEI ট্র্যাকিং, সার্ভিসিং টিকেটিং ও ওয়ারেন্টি ম্যানেজমেন্টের কথা বলুন।
5. যদি প্রাইস জানতে চায়, স্পেশাল ওপেনিং অফার (মাত্র ৳৪৯৯/মাস, ৬ মাস) এবং কাস্টমাইজড প্ল্যান (৳৯৯৯/মাস) পরিষ্কারভাবে জানান এবং ফ্রি লাইভ ডেমো দেখার আমন্ত্রণ জানান।
6. কথোপকথনের ফাঁকে মার্জিতভাবে গ্রাহকের দোকানের নাম, ব্যবসার ক্যাটাগরি বা কয়টি ব্রাঞ্চ আছে তা জানার চেষ্টা করুন (যেমন: "স্যার, আপনার প্রতিষ্ঠানের নাম ও লোকেশন কি একটু জানতে পারি? কয়টি ব্রাঞ্চ রয়েছে আপনার?")।
7. উত্তর খুব বেশি বড় বা ক্লান্তিকর করবেন না। হোয়াটসঅ্যাপে পড়ার উপযোগী আকর্ষণীয় ২-৩টি ছোট অনুচ্ছেদ বা প্রয়োজনীয় পয়েন্ট আকারে লিখুন।
8. যদি গ্রাহকের পূর্ববর্তী কোনো স্মৃতি, দোকানের তথ্য বা আগের প্রসঙ্গের বিবরণ উপরে দেওয়া থাকে, তবে গ্রাহককে আগের আলাপের সূত্র ধরে অত্যন্ত আপন ও ব্যক্তিগতভাবে রেসপন্স দিন।
"""

    messages = [{"role": "system", "content": system_prompt}]
    
    for m in chat_history[-6:]:
        role = "assistant" if m.get("is_from_me") else "user"
        messages.append({"role": role, "content": m.get("message_text", "")})

    messages.append({"role": "user", "content": message_text})

    reply_text = await call_llm(messages)
    reply_text = enforce_sir_mam(reply_text)

    try:
        from crm_core.learning_engine import update_customer_memory_from_chat
        asyncio.create_task(update_customer_memory_from_chat(phone, sender_name, message_text, reply_text))
    except Exception as e:
        logger.warning(f"Error scheduling customer memory update: {e}")

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

Standard supported retail categories:
- Grocery
- Electronics
- Clothing
- Pharmacy
- Restaurant
- Hardware
- Departmental
- Battery
- Chemical

Special Categorization Rules:
If customer's business falls outside standard retail (e.g. Printing, Media, Passport/Cyber Online Services, Travel Agency, Hotel, Hospital, Coaching, Manufacturing, etc.) OR if they request custom software features:
- Set "category": "Custom: " + actual business type
- Set "status": "NEEDS_CUSTOMIZATION"
- Set "is_custom": true
Otherwise, if standard business and they shared shop name or asked pricing/demo:
- Set "status": "QUALIFIED"
- Set "is_custom": false

Required JSON Schema:
{{
  "shop_name": "extracted shop/business name or empty string",
  "owner_name": "extracted owner name or empty string",
  "category": "one of the standard categories OR 'Custom: <BusinessType>'",
  "district": "extracted city/district in Bangladesh or empty string",
  "status": "NEEDS_CUSTOMIZATION if custom, else QUALIFIED if intent/shop shared, else INTERESTED",
  "is_custom": true or false,
  "notes": "concise summary of requirements, custom features needed, or interest"
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
        district = data.get("district", "").strip()
        is_custom = data.get("is_custom", False)
        status = "NEEDS_CUSTOMIZATION" if is_custom else data.get("status", "INTERESTED")
        notes = data.get("notes", "").strip()

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
                if status == "NEEDS_CUSTOMIZATION":
                    lead.status = "NEEDS_CUSTOMIZATION"
                    changed = True
                if category and category != "General":
                    lead.category = category
                    changed = True
                if notes and notes not in (lead.notes or ""):
                    lead.notes = ((lead.notes or "") + " | " + notes).strip(" |")
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
                "status": lead.status,
                "notes": lead.notes
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

    # 1. Instantly trigger typing presence to eliminate perceived wait time
    try:
        async with httpx.AsyncClient(timeout=2.0) as quick_client:
            await quick_client.post(
                f"{wa_engine_url}/presence",
                json={"jid": jid, "phone": phone, "status": "composing"}
            )
    except Exception as e:
        logger.debug(f"Immediate presence: {e}")

    delay = cfg.get("reply_delay_seconds", 0)
    if delay > 0:
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
                "jid": jid,
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
