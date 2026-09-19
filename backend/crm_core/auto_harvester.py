import os
import sys
import json
import re
import asyncio
import logging
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional, Tuple

import httpx
from asgiref.sync import sync_to_async

logger = logging.getLogger(__name__)

CONFIG_PATH = "/app/data/auto_harvester_config.json" if os.path.exists("/app/data") else "/root/whatsapp-crm/wa_backend_data/auto_harvester_config.json"
DATA_DIR = "/app/data" if os.path.exists("/app/data") else "/root/whatsapp-crm/wa_backend_data"

ROTATION_PRESETS = [
    {
        "category": "Mobile Repair Shop",
        "query": "mobile phone repair servicing center contact",
        "cities": ["Dhaka", "Chittagong", "Sylhet", "Bogura", "Khulna", "Rajshahi", "Comilla"]
    },
    {
        "category": "Battery Shop",
        "query": "battery ips solar showroom dealer contact phone",
        "cities": ["Dhaka", "Chittagong", "Comilla", "Bogura", "Mymensingh", "Khulna", "Sylhet"]
    },
    {
        "category": "Electronics",
        "query": "electronics gadget mobile showroom store contact phone",
        "cities": ["Dhaka", "Chittagong", "Sylhet", "Rajshahi", "Khulna", "Barisal", "Bogura"]
    },
    {
        "category": "Clothing & Fashion",
        "query": "clothing fashion wear boutique store showroom whatsapp phone",
        "cities": ["Dhaka", "Chittagong", "Sylhet", "Comilla", "Bogura", "Narayanganj"]
    },
    {
        "category": "Pharmacy",
        "query": "pharmacy medicine drug house chemist store phone whatsapp",
        "cities": ["Dhaka", "Chittagong", "Rajshahi", "Sylhet", "Khulna", "Rangpur", "Bogura"]
    },
    {
        "category": "Cosmetics & Beauty",
        "query": "cosmetics beauty care parlor product store phone whatsapp",
        "cities": ["Dhaka", "Chittagong", "Sylhet", "Rajshahi", "Khulna", "Dhaka"]
    },
    {
        "category": "Grocery & Superstore",
        "query": "grocery supershop departmental store contact phone",
        "cities": ["Dhaka", "Chittagong", "Sylhet", "Bogura", "Khulna", "Dhaka"]
    },
    {
        "category": "Chemical",
        "query": "industrial textile chemical supplier trading phone contact",
        "cities": ["Dhaka", "Chittagong", "Narayanganj", "Gazipur"]
    },
    {
        "category": "Hardware & Sanitary",
        "query": "hardware sanitary pipe fittings electric store contact phone",
        "cities": ["Dhaka", "Chittagong", "Sylhet", "Bogura", "Mymensingh"]
    },
    {
        "category": "Computer & IT",
        "query": "computer laptop it accessories showroom store phone contact",
        "cities": ["Dhaka", "Chittagong", "Rajshahi", "Sylhet", "Khulna"]
    },
    {
        "category": "Wholesale & Distribution",
        "query": "wholesale dealer distributor merchant phone whatsapp",
        "cities": ["Dhaka", "Chittagong", "Bogura", "Narayanganj", "Khatunganj"]
    }
]

DEFAULT_CONFIG = {
    "enabled": False,
    "interval_minutes": 30,
    "batch_size": 20,
    "is_running": False,
    "last_run_at": None,
    "next_run_at": None,
    "total_harvested": 0,
    "last_log": "24/7 AI Autonomous Lead Harvester is standing by.",
    "current_category": "Mobile Repair Shop",
    "current_city": "Dhaka",
    "rotation_preset_index": 0,
    "rotation_city_index": 0,
    "history": []
}

class AutonomousHarvesterManager:
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
            logger.error(f"Error reading harvester config: {e}")
            return DEFAULT_CONFIG

    def save_config(self, cfg: Dict[str, Any]):
        try:
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(cfg, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Error saving harvester config: {e}")

    def get_status(self) -> Dict[str, Any]:
        cfg = self.ensure_config()
        return cfg

    def set_enabled(self, enabled: bool) -> Dict[str, Any]:
        cfg = self.ensure_config()
        cfg["enabled"] = enabled
        now = datetime.now(timezone.utc)
        if enabled:
            cfg["last_log"] = f"Harvester enabled at {now.strftime('%I:%M %p')}. Scheduled to run every {cfg.get('interval_minutes', 30)} minutes."
            if not cfg.get("next_run_at"):
                cfg["next_run_at"] = now.isoformat()
        else:
            cfg["last_log"] = f"Harvester paused at {now.strftime('%I:%M %p')}."
            cfg["next_run_at"] = None
        self.save_config(cfg)
        return cfg

    async def evaluate_candidate_with_ai(
        self,
        name: str,
        phone: str,
        snippet: str,
        city: str,
        target_cat: str
    ) -> Optional[Dict[str, Any]]:
        """
        Uses Gemini 3.8 Flash via call_llm to verify if the scraped candidate is a genuine business,
        cleans the shop name, and assigns exact category.
        """
        from crm_core.ai_bot import call_llm

        allowed_categories = [
            "Mobile Repair Shop", "Battery Shop", "Electronics", "Chemical",
            "Clothing & Fashion", "Grocery & Superstore", "Pharmacy", "Cosmetics & Beauty",
            "Wholesale & Distribution", "Hardware & Sanitary", "Computer & IT", "General Retail"
        ]

        prompt = f"""You are an expert AI Lead Auditor for StockWhisk ERP in Bangladesh.
Evaluate this prospective retail/wholesale business candidate found via web search:

Scraped Business Name: {name}
Phone Number: {phone}
Region / City: {city}
Target Intent Category: {target_cat}
Scraped Web Details: {snippet[:400]}

Your Mission:
1. "is_genuine": boolean (Is this a genuine physical/online retail shop, repair center, pharmacy, showroom or wholesale supplier in Bangladesh? Reject job ads, blog posts, news, generic listing sites, spam, and non-businesses).
2. "clean_shop_name": string (Return the clean, official business name in Bengali or English. Remove suffixes like "- Home | Facebook", phone numbers, SEO spam keywords).
3. "category": string (Must match exactly one from: {allowed_categories}).
4. "detected_area": string (Market or neighborhood area like "Stadium Market, Mirpur", "Agrabad", "GEC Circle", or at least "{city}").
5. "shop_type": string ("Retail" or "Wholesale").
6. "confidence": float between 0.0 and 1.0 (Rate confidence that this is a real business).

Return strictly JSON format:
{{
  "is_genuine": true,
  "clean_shop_name": "Al-Madina Mobile Servicing",
  "category": "{target_cat}",
  "detected_area": "Mirpur, {city}",
  "shop_type": "Retail",
  "confidence": 0.95
}}
"""
        try:
            raw = await call_llm([{"role": "user", "content": prompt}])
            clean = raw.strip()
            if "```json" in clean:
                clean = clean.split("```json")[1].split("```")[0].strip()
            elif "```" in clean:
                clean = clean.split("```")[1].split("```")[0].strip()
            data = json.loads(clean)
            if data.get("is_genuine") and float(data.get("confidence", 0)) >= 0.65:
                return data
        except Exception as e:
            logger.warning(f"AI Evaluation error for {name}: {e}")
        return None

    async def run_harvest_cycle(self, manual: bool = False) -> Dict[str, Any]:
        """
        Executes a 20-lead harvest cycle:
        1. Selects next rotation preset & city.
        2. Scrapes candidate businesses concurrently.
        3. Filters duplicates against existing CRM leads.
        4. Verifies active WhatsApp via Baileys engine.
        5. Audits genuineness and categorizes via Gemini 3.8 Flash.
        6. Inserts verified leads directly into CRM Lead table.
        """
        async with self.lock:
            cfg = self.ensure_config()
            if cfg.get("is_running") and not manual:
                return {"status": "busy", "message": "Harvest cycle already running."}

            cfg["is_running"] = True
            cfg["last_log"] = "Harvest cycle started: Searching candidates across Bangladesh..."
            self.save_config(cfg)

        try:
            from crm_core.lead_generator import LeadScraperEngine, TARGET_CATEGORY_PROFILES
            from crm_core.models import Lead

            cfg = self.ensure_config()
            p_idx = cfg.get("rotation_preset_index", 0) % len(ROTATION_PRESETS)
            preset = ROTATION_PRESETS[p_idx]
            category = preset["category"]
            cities = preset["cities"]
            c_idx = cfg.get("rotation_city_index", 0) % len(cities)
            city = cities[c_idx]

            query_text = f"{preset['query']} in {city}"
            batch_limit = cfg.get("batch_size", 20)

            cfg["current_category"] = category
            cfg["current_city"] = city
            cfg["last_log"] = f"Searching up to {batch_limit} leads for '{category}' in {city}..."
            self.save_config(cfg)

            scraper = LeadScraperEngine(wa_engine_url="http://wa-engine:5001")

            def _get_existing_phones():
                phones = set()
                for p in Lead.objects.values_list('phone', flat=True):
                    digits = re.sub(r'\D', '', str(p))
                    if digits:
                        phones.add(digits[-10:])
                return phones

            existing_phones_last10 = await sync_to_async(_get_existing_phones)()

            candidates = await scraper.search_and_generate_leads(
                query=query_text,
                country="BD",
                limit=batch_limit * 3,
                only_whatsapp=False,
                category=category,
                exclude_existing=True
            )

            verified_new_leads = []
            async with httpx.AsyncClient(timeout=10.0) as http_client:
                for cand in candidates:
                    if len(verified_new_leads) >= batch_limit:
                        break

                    raw_phone = cand.get("phone", "")
                    digits = re.sub(r'\D', '', str(raw_phone))
                    if not digits or len(digits) < 10:
                        continue

                    last10 = digits[-10:]
                    if last10 in existing_phones_last10:
                        continue

                    if digits.startswith("8801") and len(digits) == 13:
                        norm_phone = "0" + digits[3:]
                    elif digits.startswith("01") and len(digits) == 11:
                        norm_phone = digits
                    elif digits.startswith("1") and len(digits) == 10:
                        norm_phone = "0" + digits
                    else:
                        norm_phone = "0" + last10

                    # 1. WhatsApp Verification Check
                    is_wa = False
                    wa_pic = None
                    try:
                        is_wa, wa_pic = await scraper.check_whatsapp_status(norm_phone, http_client)
                    except Exception:
                        is_wa = False

                    if not is_wa:
                        continue

                    # 2. AI Audit and Genuineness Verification
                    raw_title = cand.get("shop_name") or cand.get("title") or "Business"
                    snippet = f"{cand.get('content', '')} {cand.get('url', '')}"
                    ai_audit = await self.evaluate_candidate_with_ai(
                        name=raw_title,
                        phone=norm_phone,
                        snippet=snippet,
                        city=city,
                        target_cat=category
                    )

                    if not ai_audit or not ai_audit.get("is_genuine"):
                        continue

                    clean_name = ai_audit.get("clean_shop_name") or raw_title
                    final_category = ai_audit.get("category") or category
                    detected_area = ai_audit.get("detected_area") or city
                    shop_type = ai_audit.get("shop_type") or "Retail"

                    matched_profile = TARGET_CATEGORY_PROFILES.get(final_category)
                    pitch_tpl = matched_profile["pitch_template"] if matched_profile else (
                        "আসসালামু আলাইকুম স্যার!\n\n"
                        f"আপনার প্রতিষ্ঠান **{clean_name}**-এর বিক্রয়, ইনভেন্টরি ও বাকির নিখুঁত ডিজিটাল হিসাবের জন্য StockWhisk ERP এখন মাত্র ৪৯৯ টাকায়!\n"
                        "ফ্রি লাইভ ডেমো দেখতে ভিজিট করুন: https://app.stockwhisk.com অথবা আমাদের ইনবক্স করুন স্যার।"
                    )
                    pitch = pitch_tpl.format(shop_name=clean_name, owner_or_sir="স্যার")

                    # 3. Insert Lead into CRM Database
                    def _insert_lead():
                        if Lead.objects.filter(phone=norm_phone).exists():
                            return None
                        
                        full_address = f"{detected_area}, {city}" if city not in detected_area else detected_area
                        lead_obj = Lead.objects.create(
                            phone=norm_phone,
                            shop_name=clean_name,
                            category=final_category,
                            shop_type=shop_type,
                            address=full_address,
                            website=cand.get("website") or cand.get("url") or "",
                            facebook_url=cand.get("facebook_url") or (cand.get("url") if "facebook.com" in (cand.get("url") or "") else ""),
                            is_on_whatsapp=True,
                            whatsapp_profile_pic=wa_pic or "",
                            whatsapp_name=clean_name,
                            status="NEW",
                            notes=f"🤖 AI Autonomous Harvester ({datetime.now().strftime('%d %b, %I:%M %p')}) | Verified WhatsApp | Quality Score: High | Scraped from {city}",
                        )
                        return lead_obj.id

                    lead_id = await sync_to_async(_insert_lead)()
                    if lead_id:
                        existing_phones_last10.add(last10)
                        verified_new_leads.append({
                            "id": lead_id,
                            "phone": norm_phone,
                            "shop_name": clean_name,
                            "category": final_category,
                            "city": city,
                            "address": detected_area
                        })

            # Advance rotation indexes
            now = datetime.now(timezone.utc)
            next_c_idx = (c_idx + 1) % len(cities)
            next_p_idx = p_idx
            if next_c_idx == 0:
                next_p_idx = (p_idx + 1) % len(ROTATION_PRESETS)

            cfg["rotation_city_index"] = next_c_idx
            cfg["rotation_preset_index"] = next_p_idx
            cfg["last_run_at"] = now.isoformat()
            
            interval_mins = cfg.get("interval_minutes", 30)
            cfg["next_run_at"] = (now + timedelta(minutes=interval_mins)).isoformat() if cfg.get("enabled") else None
            cfg["total_harvested"] = cfg.get("total_harvested", 0) + len(verified_new_leads)
            cfg["is_running"] = False

            log_msg = f"Harvest complete! Verified & added {len(verified_new_leads)} new leads for '{category}' in {city}."
            cfg["last_log"] = log_msg

            history = cfg.get("history", [])
            history.insert(0, {
                "timestamp": now.isoformat(),
                "category": category,
                "city": city,
                "leads_added": len(verified_new_leads),
                "leads": verified_new_leads[:5]
            })
            cfg["history"] = history[:15]
            self.save_config(cfg)

            return {
                "success": True,
                "leads_added": len(verified_new_leads),
                "category": category,
                "city": city,
                "leads": verified_new_leads,
                "next_run_at": cfg["next_run_at"]
            }

        except Exception as e:
            logger.error(f"Error in harvest cycle: {e}", exc_info=True)
            cfg = self.ensure_config()
            cfg["is_running"] = False
            cfg["last_log"] = f"Harvest cycle error: {str(e)[:100]}"
            self.save_config(cfg)
            return {"success": False, "error": str(e)}

auto_harvester = AutonomousHarvesterManager()
