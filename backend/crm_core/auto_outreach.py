import os
import sys
import json
import re
import asyncio
import logging
import random
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional, Tuple

import httpx
from asgiref.sync import sync_to_async
from django.utils import timezone as django_tz

logger = logging.getLogger(__name__)

CONFIG_PATH = "/app/data/auto_outreach_config.json" if os.path.exists("/app/data") else "/root/whatsapp-crm/wa_backend_data/auto_outreach_config.json"
DATA_DIR = "/app/data" if os.path.exists("/app/data") else "/root/whatsapp-crm/wa_backend_data"

DEFAULT_CONFIG = {
    "enabled": False,
    "interval_minutes": 30,
    "batch_size": 15,
    "min_delay_seconds": 15,
    "max_delay_seconds": 22,
    "is_running": False,
    "last_run_at": None,
    "next_run_at": None,
    "total_sent": 0,
    "total_replied": 0,
    "last_batch_count": 0,
    "last_log": "AI Auto-Outreach engine is standing by.",
    "history": []
}

FALLBACK_TEMPLATES = {
    "battery": """আসসালামু আলাইকুম 🌟

আপনার ব্যাটারি পাইকারি ও খুচরা ব্যবসার বিক্রি, স্টক, লাভ, কাস্টমার ও বাকি—সবকিছু একসাথে ম্যানেজ করতে চান? 🔋

📱 StockWhisk — ব্যাটারি ব্যবসার জন্য স্মার্ট POS & Inventory Software।

🔹 পাইকারি ও খুচরা বিক্রয় এবং ডিজিটাল ইনভয়েস
🔹 স্টক ম্যানেজমেন্ট ও Low Stock Alert
🔹 ব্যাটারিভিত্তিক লাভের হিসাব
🔹 ব্যাটারির মডেল ও সিরিয়াল ট্র্যাকিং
🔹 কাস্টমার ও বাকি হিসাব ম্যানেজমেন্ট (সরাসরি হোয়াটসঅ্যাপ রিমাইন্ডার)
🔹 বিক্রি, স্টক ও লাভের বিস্তারিত রিপোর্ট
🔹 Purchase & Supplier Management
🔹 Excel/CSV Export সুবিধা
🔹 Cash Flow & Business Dashboard

💼 আপনার ব্যাটারি ব্যবসার প্রতিটি লেনদেন রাখুন হাতের মুঠোয়!

StockWhisk-এর মাধ্যমে সহজেই ম্যানেজ করুন—
✅ কোন ব্যাটারি কতটি স্টকে আছে
✅ কোন ব্যাটারিতে কত লাভ হচ্ছে
✅ কোন কাস্টমারের কত টাকা বাকি
✅ কোন সাপ্লায়ারের কাছ থেকে কত টাকার পণ্য কিনেছেন
✅ আপনার ব্যবসার দৈনিক বিক্রি ও লাভের হিসাব

📊 খাতাপত্রের ঝামেলা কমিয়ে আপনার ব্যাটারি ব্যবসাকে করুন আরও সংগঠিত, দ্রুত ও স্মার্ট।

✨ সীমিত সময়ের অফার: মাত্র ৳৪৯৯/মাস (প্রতিদিন মাত্র ~৳১৬)!

🌐 Website: stockwhisk.com
📞 Call / WhatsApp: 01613511887

🚀 StockWhisk — স্মার্ট হিসাব, সফল ব্যবসা।""",

    "electronics": """আসসালামু আলাইকুম 🌟

আপনার ইলেকট্রনিক্স ও গ্যাজেট দোকানের বিক্রি, স্টক, লাভ, কাস্টমার ও বাকি—সবকিছু একসাথে স্মার্টলি ম্যানেজ করতে চান? 📱

📱 StockWhisk — ইলেকট্রনিক্স ও মোবাইল ব্যবসার জন্য আধুনিক POS & Inventory Software।

🔹 বারকোড স্ক্যানার দিয়ে চোখের পলকে বিলিং ও ক্যাশ মেমো
🔹 IMEI ও প্রোডাক্ট সিরিয়াল নম্বর ট্র্যাকিং (ওয়ারেন্টি নিশ্চিতকরণ)
🔹 আইটেমভিত্তিক লাভ-ক্ষতি ও রিয়েল-টাইম স্টক আপডেট
🔹 কাস্টমার বাকির খাতা ও সরাসরি হোয়াটসঅ্যাপ রিমাইন্ডার
🔹 মোবাইল/গ্যাজেট সার্ভিসিং জব শিট ও স্ট্যাটাস ট্র্যাকিং
🔹 কম্পিউটার, ল্যাপটপ বা মোবাইলে ব্যবহারের পূর্ণ সুবিধা

🎉 সীমিত সময়ের স্পেশাল অফার: মাত্র ৳499/মাস প্রমোশনাল রেট!

🌐 Website: stockwhisk.com
📞 Call / WhatsApp: 01613511887

🚀 StockWhisk — স্মার্ট দোকান, সফল ব্যবসা।""",

    "fashion": """আসসালামু আলাইকুম 🌟

আপনার পোশাক ও ফ্যাশন দোকানের বিক্রি, স্টক, সাইজ-কালার ভ্যারিয়েন্ট, লাভ, কাস্টমার ও বাকি—সবকিছু একসাথে ম্যানেজ করতে চান? 👗

📱 StockWhisk — পোশাক, গার্মেন্টস ও ফ্যাশন ব্যবসার জন্য স্মার্ট POS & Inventory Software।

🔹 Barcode POS & দ্রুত ডিজিটাল ক্যাশ মেমো
🔹 সাইজ, রঙ ও ভ্যারিয়েন্টভিত্তিক স্টক ম্যানেজমেন্ট (Size/Color Variants)
🔹 Low Stock Alert (কোন সাইজ বা ডিজাইনের স্টক শেষ হচ্ছে)
🔹 পোশাকভিত্তিক ও দৈনিক লাভের হিসাব (Profit Report)
🔹 কাস্টমার ও বাকি হিসাব ম্যানেজমেন্ট (সরাসরি হোয়াটসঅ্যাপ রিমাইন্ডার)
🔹 বিক্রি, স্টক ও ক্যাশ ফ্লোর বিস্তারিত রিপোর্ট
🔹 পাইকারি সাপ্লায়ার ও পারচেজ (ক্রয়) ম্যানেজমেন্ট
🔹 Excel/CSV Export সুবিধা
🔹 যেকোনো কম্পিউটার, ল্যাপটপ, ট্যাবলেট বা মোবাইল ব্রাউজারে ব্যবহারের সুবিধা

💼 আপনার ফ্যাশন ব্যবসার প্রতিটি লেনদেন ও স্টক রাখুন হাতের মুঠোয়!

StockWhisk-এর মাধ্যমে সহজেই ম্যানেজ করুন—
✅ কোন পোশাক বা সাইজের কতটি স্টকে আছে
✅ কোন আইটেমে কত টাকা লাভ হচ্ছে
✅ কোন কাস্টমারের কত টাকা বাকি
✅ কোন সাপ্লায়ারের কাছ থেকে কত টাকার মাল কিনেছেন
✅ আপনার দোকানের দৈনিক বিক্রি ও নিখুঁত লাভের হিসাব

📊 সনাতন খাতা-কলমের ঝামেলা কমিয়ে আপনার ফ্যাশন ব্যবসাকে করুন আরও সুসংগঠিত, দ্রুত ও স্মার্ট।

✨ সীমিত সময়ের অফার: মাত্র ৳৪৯৯/মাস (প্রতিদিন মাত্র ~৳১৬)!

🌐 Website: stockwhisk.com
📞 Call / WhatsApp: 01613511887

🚀 StockWhisk — স্মার্ট দোকান, সফল ব্যবসা।""",

    "general": """আসসালামু আলাইকুম 🌟

আপনার ব্যবসা প্রতিষ্ঠানের দৈনিক বিক্রি, গোডাউন স্টক, লাভ-ক্ষতি এবং কাস্টমারের বাকির খাতা একসাথে আধুনিক উপায়ে পরিচালনা করতে চান? 💼

📱 StockWhisk — যেকোনো রিটেইল ও পাইকারি ব্যবসার জন্য অল-ইন-ওয়ান ক্লাউড ERP।

🔹 বারকোড পিওএস ও দ্রুত ডিজিটাল ক্যাশ মেমো
🔹 রিয়েল-টাইম স্টক আপডেট ও লো স্টক ওয়ার্নিং
🔹 ডিজিটাল বাকির খাতা ও সরাসরি হোয়াটসঅ্যাপ নোটিফিকেশন
🔹 কম্পিউটার, ল্যাপটপ, ট্যাবলেট বা মোবাইল—যেকোনো ডিভাইসে ব্যবহারের সুবিধা
🔹 দৈনিক ও মাসিক বিক্রি এবং নিট লাভের স্পষ্ট রিপোর্ট

🎉 সীমিত সময়ের স্পেশাল অফার: মাত্র ৳499/মাস প্রমোশনাল রেট!

🌐 Website: stockwhisk.com
📞 Call / WhatsApp: 01613511887

🚀 StockWhisk — স্মার্ট হিসাব, সফল ব্যবসা।"""
}


class AutoLeadOutreachManager:
    def __init__(self):
        self.lock = asyncio.Lock()
        os.makedirs(DATA_DIR, exist_ok=True)
        self.ensure_config()

    def ensure_config(self) -> Dict[str, Any]:
        if not os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(DEFAULT_CONFIG, f, indent=2, ensure_ascii=False)
            return DEFAULT_CONFIG
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                updated = False
                for k, v in DEFAULT_CONFIG.items():
                    if k not in cfg:
                        cfg[k] = v
                        updated = True
                if updated:
                    with open(CONFIG_PATH, "w", encoding="utf-8") as fw:
                        json.dump(cfg, fw, indent=2, ensure_ascii=False)
                return cfg
        except Exception as e:
            logger.error(f"Error reading auto outreach config: {e}")
            return DEFAULT_CONFIG

    def save_config(self, cfg: Dict[str, Any]):
        try:
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(cfg, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Error saving auto outreach config: {e}")

    def get_status(self) -> Dict[str, Any]:
        cfg = self.ensure_config()
        # Enrich with live queue counts
        try:
            from crm_core.models import Lead
            cfg["uncontacted_count"] = Lead.objects.filter(is_contacted=False).count()
            cfg["uncontacted_whatsapp_count"] = Lead.objects.filter(is_contacted=False, is_on_whatsapp=True).count()
            cfg["total_leads"] = Lead.objects.count()
        except Exception as e:
            logger.warning(f"Could not count leads for status: {e}")
        return cfg

    def set_enabled(self, enabled: bool) -> Dict[str, Any]:
        cfg = self.ensure_config()
        cfg["enabled"] = enabled
        now = datetime.now(timezone.utc)
        if enabled:
            cfg["last_log"] = f"Auto-Outreach enabled at {now.strftime('%I:%M %p')}. Scheduled to send {cfg.get('batch_size', 15)} messages every {cfg.get('interval_minutes', 30)}m."
            if not cfg.get("next_run_at"):
                cfg["next_run_at"] = now.isoformat()
        else:
            cfg["last_log"] = f"Auto-Outreach paused at {now.strftime('%I:%M %p')}."
            cfg["next_run_at"] = None
        self.save_config(cfg)
        return self.get_status()

    async def get_base_template(self, category: str) -> str:
        """
        Retrieves base template from MessageTemplate DB or falls back to tailored preset.
        """
        from asgiref.sync import sync_to_async
        from crm_core.models import MessageTemplate
        cat_lower = (category or "").lower()

        def _fetch_from_db():
            # 1. Fashion, Clothing & Boutiques
            if any(kw in cat_lower for kw in ["fashion", "clothing", "cloth", "garment", "boutique", "apparel"]):
                t = MessageTemplate.objects.filter(name__icontains="FASHION").first() or MessageTemplate.objects.filter(category__icontains="Fashion").first()
                if t and t.content and len(t.content.strip()) > 50:
                    return t.content
                return FALLBACK_TEMPLATES.get("fashion", FALLBACK_TEMPLATES["general"])

            # 2. Battery, IPS & Solar
            if any(kw in cat_lower for kw in ["battery", "ips", "solar"]):
                t = MessageTemplate.objects.filter(name__icontains="BATTERY").first() or MessageTemplate.objects.filter(category__icontains="battery").first()
                if t and t.content and len(t.content.strip()) > 50:
                    return t.content
                return FALLBACK_TEMPLATES["battery"]

            # 3. Electronics, Mobile, IT & Gadget Servicing
            if any(kw in cat_lower for kw in ["electronic", "mobile", "gadget", "repair", "computer", "servicing", "tech"]):
                t = MessageTemplate.objects.filter(name__icontains="ELECTRONICS").first() or MessageTemplate.objects.filter(category__icontains="electronics").first()
                if t and t.content and len(t.content.strip()) > 50:
                    return t.content
                return FALLBACK_TEMPLATES["electronics"]

            # 4. Other categories (Pharmacy, Wholesale, General Retail)
            t = MessageTemplate.objects.filter(category__icontains=category).first() or MessageTemplate.objects.filter(name__icontains=category).first()
            if t and t.content and len(t.content.strip()) > 50:
                return t.content
            return FALLBACK_TEMPLATES["general"]

        return await sync_to_async(_fetch_from_db)()

    async def enhance_message_with_ai(
        self,
        shop_name: str,
        category: str,
        address: str,
        base_template: str,
        owner_name: Optional[str] = None
    ) -> str:
        """
        Takes the base template and uses OmniRoute Gemini 3.8 Flash to enhance/personalize
        it specifically for that target shop, category, and address.
        """
        from crm_core.ai_bot import call_llm

        prompt = f"""You are an elite B2B sales copywriter for StockWhisk ERP (stockwhisk.com) in Bangladesh.
Your task is to take the authentic base marketing template and personalize it for this targeted shop.

Target Shop Details:
- Shop Name: {shop_name}
- Category: {category}
- Address / City: {address or 'Bangladesh'}
- Owner / Contact Name: {owner_name or 'Sir'}

Base Template:
{base_template}

STRICT MANDATORY CONSTRAINTS (ZERO TOLERANCE FOR INVENTED/FAKE FEATURES):
1. ABSOLUTELY DO NOT INVENT, FABRICATE, OR ADD ANY FEATURE THAT OUR SOFTWARE DOES NOT HAVE!
   - Under NO circumstances mention "পুরাতন ব্যাটারি স্ক্র্যাপ এক্সচেঞ্জ / ট্রেড-ইন" (StockWhisk does NOT have scrap battery exchange!).
   - Under NO circumstances mention "অফলাইন মোড" (StockWhisk is strictly cloud-based and requires internet/mobile data!).
   - Under NO circumstances mention "মোবাইল এসএমএস" (StockWhisk sends digital cash memos and due reminders directly via WhatsApp!).
   - Under NO circumstances mention GPS tracking or any other imaginary feature.
2. PRESERVE ONLY REAL, VERIFIED FEATURES FROM THE BASE TEMPLATE:
   - Barcode POS & Fast Digital Invoicing / Cash Memo
   - Stock Management & Low Stock Alerts
   - Battery Model & Serial Number Tracking / IMEI Tracking & Warranty Management
   - Customer Digital Due Ledger (বাকির খাতা) with Direct WhatsApp Reminders
   - Product-wise Profit & Loss Calculation
   - Supplier Purchase Management
   - Accessible from any PC, Laptop, Tablet, or Mobile browser
   - Sales & Profit Reports, Cash Flow
3. RESPECTFUL SHOP-SPECIFIC PERSONALIZATION:
   - Address the recipient with high corporate respect: "স্যার" (Sir) or "{owner_name} স্যার". NEVER use "ভাই" or informal terms.
   - Naturally mention their shop name "{shop_name}" and city/location "{address}" warmly in the opening greeting so it feels 100% genuine and customized for their business.
4. PROMO & CONTACT: Keep the promotional price of ৳499/মাস (~৳16/দিন), Website: stockwhisk.com, and Official Call/WhatsApp: 01613511887.
5. FORMATTING: Clean bullet points, appealing emojis (🔹, 🔋, 📱, ✨, 💼), clear readable spacing.
6. OUTPUT: Output ONLY the final Bengali message text. Do NOT include markdown code fences or explanatory meta comments."""

        try:
            enhanced = await call_llm([{"role": "user", "content": prompt}])
            if enhanced and len(enhanced.strip()) > 100:
                clean_text = re.sub(r'```.*?```', '', enhanced, flags=re.DOTALL).strip()
                return clean_text
        except Exception as e:
            logger.error(f"Error enhancing outreach message with AI: {e}")

        # Graceful fallback: Personalize the base template header
        return f"আসসালামু আলাইকুম {owner_name + ' স্যার' if owner_name else 'স্যার'} 🌟\n\nআপনার স্বনামধন্য প্রতিষ্ঠান **{shop_name}**-এর হিসাব-নিকাশ সহজ ও ডিজিটাল করতে—\n\n{base_template}"

    async def run_outreach_cycle(self, manual: bool = False) -> Dict[str, Any]:
        """
        Executes a 15-message outreach batch:
        - Selects up to 15 uncontacted leads
        - Reads & enhances category template with AI per shop
        - Sends via WhatsApp engine with 15-22s randomized anti-ban delays
        - Updates lead status to CONTACTED (strict 1-touch rule)
        """
        cfg = self.ensure_config()
        if not manual and not cfg.get("enabled"):
            return {"success": False, "message": "Outreach engine is disabled"}

        if self.lock.locked():
            return {"success": False, "message": "An outreach batch is already currently running"}

        async with self.lock:
            cfg["is_running"] = True
            now_utc = datetime.now(timezone.utc)
            cfg["last_run_at"] = now_utc.isoformat()
            interval = cfg.get("interval_minutes", 30)
            cfg["next_run_at"] = (now_utc + timedelta(minutes=interval)).isoformat()
            self.save_config(cfg)

            batch_size = cfg.get("batch_size", 15)
            min_delay = cfg.get("min_delay_seconds", 15)
            max_delay = cfg.get("max_delay_seconds", 22)

            from crm_core.models import Lead, ChatMessage

            def _fetch_candidate_leads():
                # Balanced Multi-Category Round-Robin Selection
                # Distributes the 15-message batch evenly across all categories with uncontacted leads
                raw_cats = Lead.objects.filter(is_contacted=False).values_list('category', flat=True)
                unique_cats = sorted(list(set([c for c in raw_cats if c and c.strip()])))

                if not unique_cats:
                    qs = list(Lead.objects.filter(is_contacted=False, is_on_whatsapp=True).order_by('id')[:batch_size])
                    if len(qs) < batch_size:
                        rem = batch_size - len(qs)
                        ex = [x.id for x in qs]
                        qs.extend(list(Lead.objects.filter(is_contacted=False).exclude(id__in=ex).order_by('id')[:rem]))
                    return [
                        {
                            "id": l.id,
                            "phone": l.phone,
                            "shop_name": l.shop_name,
                            "owner_name": l.owner_name,
                            "category": l.category,
                            "address": l.address,
                            "whatsapp_jid": l.whatsapp_jid,
                        }
                        for l in qs
                    ]

                cat_pools = {}
                for c in unique_cats:
                    # Prefer verified WhatsApp leads
                    l1 = list(Lead.objects.filter(is_contacted=False, category=c, is_on_whatsapp=True).order_by('id')[:batch_size])
                    if len(l1) < batch_size:
                        rem = batch_size - len(l1)
                        ex = [x.id for x in l1]
                        l2 = list(Lead.objects.filter(is_contacted=False, category=c).exclude(id__in=ex).order_by('id')[:rem])
                        l1.extend(l2)
                    cat_pools[c] = l1

                # Interleave leads evenly from all categories in round-robin fashion
                selected = []
                while len(selected) < batch_size:
                    added_in_round = False
                    for c in unique_cats:
                        if cat_pools[c]:
                            selected.append(cat_pools[c].pop(0))
                            added_in_round = True
                            if len(selected) >= batch_size:
                                break
                    if not added_in_round:
                        break

                return [
                    {
                        "id": l.id,
                        "phone": l.phone,
                        "shop_name": l.shop_name,
                        "owner_name": l.owner_name,
                        "category": l.category,
                        "address": l.address,
                        "whatsapp_jid": l.whatsapp_jid,
                    }
                    for l in selected
                ]

            candidate_leads = await sync_to_async(_fetch_candidate_leads)()

            if not candidate_leads:
                cfg["is_running"] = False
                cfg["last_log"] = "No uncontacted leads remaining in queue. Waiting for newly harvested leads."
                self.save_config(cfg)
                return {
                    "success": True,
                    "batch_count": 0,
                    "message": "Queue empty — all leads have been contacted!"
                }

            sent_count = 0
            failed_count = 0
            sent_leads_summary = []

            wa_engine_urls = ["http://wa-engine:5001", "http://whatsapp-engine:5001", "http://127.0.0.1:5001"]

            async with httpx.AsyncClient(timeout=35.0) as http_client:
                for idx, lead_info in enumerate(candidate_leads):
                    lead_id = lead_info["id"]
                    phone = lead_info["phone"]
                    shop_name = lead_info["shop_name"] or "Business"
                    owner_name = lead_info["owner_name"] or ""
                    category = lead_info["category"] or "General"
                    address = lead_info["address"] or ""
                    jid = lead_info["whatsapp_jid"]

                    try:
                        # 1. Get Base Category Template
                        base_tpl = await self.get_base_template(category)

                        # 2. 🧠 AI Dynamic Enhancement per Shop
                        enhanced_message = await self.enhance_message_with_ai(
                            shop_name=shop_name,
                            category=category,
                            address=address,
                            base_template=base_tpl,
                            owner_name=owner_name
                        )

                        # 3. Format Phone and Dispatch via wa-engine
                        clean_digits = re.sub(r'\D', '', phone)
                        if clean_digits.startswith("880"):
                            norm_phone = clean_digits
                        elif clean_digits.startswith("01"):
                            norm_phone = "88" + clean_digits
                        elif clean_digits.startswith("1"):
                            norm_phone = "880" + clean_digits
                        else:
                            norm_phone = clean_digits

                        dest_jid = jid if (jid and "@" in jid) else f"{norm_phone}@s.whatsapp.net"

                        payload = {
                            "phone": norm_phone,
                            "jid": dest_jid, "directJid": dest_jid,
                            "text": enhanced_message
                        }

                        send_success = False
                        wa_msg_id = f"outreach_{int(datetime.now().timestamp())}_{lead_id}"

                        for engine_url in wa_engine_urls:
                            try:
                                resp = await http_client.post(f"{engine_url}/send-message", json=payload)
                                if resp.status_code == 200:
                                    res_data = resp.json()
                                    if res_data.get("success"):
                                        send_success = True
                                        wa_msg_id = res_data.get("whatsapp_msg_id") or wa_msg_id
                                        break
                            except Exception:
                                continue

                        if send_success:
                            sent_count += 1

                            # 4. Strict 1-Touch Database Update
                            def _record_success():
                                lead = Lead.objects.filter(id=lead_id).first()
                                if lead:
                                    lead.is_contacted = True
                                    lead.status = "CONTACTED"
                                    lead.sent_messages_count += 1
                                    lead.last_contacted_at = django_tz.now()
                                    lead.notes = ((lead.notes or "") + f" | 🚀 Auto-Outreach Sent ({datetime.now().strftime('%d %b %I:%M %p')})").strip(" |")
                                    lead.save()

                                # Record ChatMessage for CRM thread continuity
                                ChatMessage.objects.create(
                                    whatsapp_msg_id=wa_msg_id,
                                    phone=norm_phone,
                                    jid=dest_jid,
                                    sender_name="StockWhisk",
                                    is_from_me=True,
                                    message_text=enhanced_message,
                                    status="SENT",
                                    timestamp=django_tz.now()
                                )

                            await sync_to_async(_record_success)()
                            sent_leads_summary.append({
                                "id": lead_id,
                                "shop_name": shop_name,
                                "phone": norm_phone,
                                "category": category
                            })
                            logger.info(f"Auto-Outreach sent message to {shop_name} ({norm_phone})")

                            # 🌟 Immediate live stats update after each single message dispatch
                            try:
                                live_cfg = self.ensure_config()
                                live_cfg["total_sent"] = live_cfg.get("total_sent", 0) + 1
                                live_cfg["last_log"] = f"Sent personalized pitch to {shop_name} ({sent_count}/{len(candidate_leads)})"
                                self.save_config(live_cfg)
                            except Exception as ex_cfg:
                                logger.warning(f"Failed to update real-time config: {ex_cfg}")
                        else:
                            failed_count += 1
                            logger.warning(f"Failed sending outreach message to {shop_name} ({phone})")

                    except Exception as e:
                        failed_count += 1
                        logger.error(f"Exception during outreach for lead {lead_id}: {e}")

                    # 5. Anti-Ban Randomized Delay between messages
                    if idx < len(candidate_leads) - 1:
                        sleep_time = random.uniform(min_delay, max_delay)
                        await asyncio.sleep(sleep_time)

            # Update final status & history
            cfg = self.ensure_config()
            cfg["is_running"] = False
            cfg["last_batch_count"] = sent_count
            cfg["last_log"] = f"Completed batch of {sent_count} personalized messages ({failed_count} failed) at {datetime.now().strftime('%I:%M %p')}."

            history_entry = {
                "timestamp": datetime.now().isoformat(),
                "sent_count": sent_count,
                "failed_count": failed_count,
                "manual": manual,
                "sample_leads": [s["shop_name"] for s in sent_leads_summary[:3]]
            }
            history = cfg.get("history", [])
            history.insert(0, history_entry)
            cfg["history"] = history[:30]

            self.save_config(cfg)
            return {
                "success": True,
                "sent_count": sent_count,
                "failed_count": failed_count,
                "summary": sent_leads_summary
            }


auto_outreach = AutoLeadOutreachManager()
