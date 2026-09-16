import os
import re
import json
import asyncio
import logging
import urllib.parse
import hashlib
from typing import List, Dict, Any, Optional, Set
import httpx

logger = logging.getLogger(__name__)

SEARXNG_URL = os.environ.get("SEARXNG_URL", "http://searxng:8080")
WHATSAPP_ENGINE_URL = os.environ.get("WHATSAPP_ENGINE_URL", "http://whatsapp-engine:5001")

# Numeral translations for Bengali & Arabic
BN_DIGIT_MAP = str.maketrans('০১২৩৪৫৬৭৮৯', '0123456789')
AR_DIGIT_MAP = str.maketrans('٠١٢٣٤٥٦٧٨٩', '0123456789')

COUNTRY_CONFIGS = {
    "BD": {
        "name": "Bangladesh",
        "code": "BD",
        "dial_code": "+880",
        "regex": re.compile(r'(?:(?:\+|00)?880\s*|0)?1[3-9](?:[\s\-\.\(\)]?\d){8}'),
        "phone_cleaner": lambda digits: "0" + digits[3:] if digits.startswith("880") else digits,
        "is_valid": lambda digits: len(digits) == 11 and digits.startswith("01") and digits[2] in "3456789",
        "search_suffix": "Bangladesh",
        "operators": ["017", "018", "019", "016", "013", "015", "014"],
        "directories": ["bikroy.com", "bdstall.com", "bdtradeinfo.com", "yellowpages.com.bd"],
    },
    "IN": {
        "name": "India",
        "code": "IN",
        "dial_code": "+91",
        "regex": re.compile(r'(?:(?:\+|00)?91\s*|0)?[6-9](?:[\s\-\.\(\)]?\d){9}'),
        "phone_cleaner": lambda digits: digits[2:] if digits.startswith("91") and len(digits) == 12 else (digits[1:] if digits.startswith("0") and len(digits) == 11 else digits),
        "is_valid": lambda digits: len(digits) == 10 and digits[0] in "6789",
        "search_suffix": "India",
        "operators": ["phone", "mobile", "contact", "WhatsApp"],
        "directories": ["justdial.com", "indiamart.com", "tradeindia.com"],
    },
    "AE": {
        "name": "United Arab Emirates",
        "code": "AE",
        "dial_code": "+971",
        "regex": re.compile(r'(?:(?:\+|00)?971\s*|0)?5(?:[\s\-\.\(\)]?\d){8}'),
        "phone_cleaner": lambda digits: "0" + digits[3:] if digits.startswith("971") else digits,
        "is_valid": lambda digits: (len(digits) == 10 and digits.startswith("05")) or (len(digits) == 9 and digits.startswith("5")),
        "search_suffix": "UAE Dubai",
        "operators": ["phone", "mobile", "WhatsApp", "contact"],
        "directories": ["yellowpages.ae", "dubaibizdirectory.com"],
    },
    "SA": {
        "name": "Saudi Arabia",
        "code": "SA",
        "dial_code": "+966",
        "regex": re.compile(r'(?:(?:\+|00)?966\s*|0)?5(?:[\s\-\.\(\)]?\d){8}'),
        "phone_cleaner": lambda digits: "0" + digits[3:] if digits.startswith("966") else digits,
        "is_valid": lambda digits: (len(digits) == 10 and digits.startswith("05")) or (len(digits) == 9 and digits.startswith("5")),
        "search_suffix": "Saudi Arabia Riyadh",
        "operators": ["phone", "mobile", "WhatsApp", "contact"],
        "directories": ["saudiyellowpages.net"],
    },
    "PK": {
        "name": "Pakistan",
        "code": "PK",
        "dial_code": "+92",
        "regex": re.compile(r'(?:(?:\+|00)?92\s*|0)?3(?:[\s\-\.\(\)]?\d){9}'),
        "phone_cleaner": lambda digits: "0" + digits[2:] if digits.startswith("92") else digits,
        "is_valid": lambda digits: len(digits) == 11 and digits.startswith("03"),
        "search_suffix": "Pakistan",
        "operators": ["0300", "0301", "0321", "0333", "0345"],
        "directories": ["olx.com.pk", "pakbiz.com"],
    },
    "US": {
        "name": "United States",
        "code": "US",
        "dial_code": "+1",
        "regex": re.compile(r'(?:(?:\+|00)?1\s*)?[2-9]\d{2}(?:[\s\-\.\(\)]?\d{3})(?:[\s\-\.\(\)]?\d{4})'),
        "phone_cleaner": lambda digits: digits[1:] if digits.startswith("1") and len(digits) == 11 else digits,
        "is_valid": lambda digits: len(digits) == 10 and digits[0] in "23456789",
        "search_suffix": "USA",
        "operators": ["phone", "contact", "store"],
        "directories": ["yellowpages.com", "yelp.com"],
    },
    "GB": {
        "name": "United Kingdom",
        "code": "GB",
        "dial_code": "+44",
        "regex": re.compile(r'(?:(?:\+|00)?44\s*|0)?7(?:[\s\-\.\(\)]?\d){9}'),
        "phone_cleaner": lambda digits: "0" + digits[2:] if digits.startswith("44") else digits,
        "is_valid": lambda digits: len(digits) == 11 and digits.startswith("07"),
        "search_suffix": "UK London",
        "operators": ["phone", "mobile", "contact"],
        "directories": ["yell.com"],
    },
    "GLOBAL": {
        "name": "Global",
        "code": "GLOBAL",
        "dial_code": "",
        "regex": re.compile(r'(?:(?:\+|00)?\d{1,3}\s*)?\(?\d{2,4}\)?(?:[\s\-\.\(\)]?\d){6,10}'),
        "phone_cleaner": lambda digits: digits,
        "is_valid": lambda digits: 8 <= len(digits) <= 15,
        "search_suffix": "",
        "operators": ["phone", "mobile", "contact", "WhatsApp"],
        "directories": [],
    }
}

CATEGORY_KEYWORDS = {
    "Clothing": [
        "cloth", "fashion", "wear", "boutique", "sharee", "panjabi", "dress",
        "attire", "garment", "textile", "tailor", "apparel", "lehenga", "kurti",
        "lungee", "shoe", "footwear", "collection", "lifestyle", "closet"
    ],
    "Mobile & Gadgets": [
        "phone", "mobile", "gadget", "smartphone", "iphone", "android",
        "cellular", "telecom", "sim", "device"
    ],
    "Electronics": [
        "electronic", "electronics", "appliance", "tv", "fridge", "refrigerator", "ac",
        "air condition", "washing machine", "sound system", "generator", "oven", "fan",
        "walton", "singer", "minister", "vision", "butterfly", "rfl", "havells"
    ],
    "Grocery": [
        "grocery", "super shop", "super store", "bazar", "vegetable", "fruit",
        "meat", "dairy", "daily needs", "halal", "food market", "departmental", "shwapno"
    ],
    "Pharmacy": [
        "pharmacy", "pharma", "medicine", "drug", "medicos", "health",
        "surgical", "clinic", "diagnostic", "doctor", "dispensary"
    ],
    "Computer & IT": [
        "computer", "laptop", "pc", "hardware", "it solutions", "cctv",
        "printer", "networking", "cyber", "software", "tech", "star tech", "ryans"
    ],
    "Cosmetics & Beauty": [
        "cosmetic", "beauty", "makeup", "skincare", "parlour", "salon", "perfume"
    ],
    "Jewellery": [
        "jewel", "gold", "diamond", "silver", "ornament", "gem"
    ],
    "Restaurant & Cafe": [
        "restaurant", "cafe", "food", "biryani", "coffee", "bakery", "sweets",
        "fast food", "catering", "kitchen"
    ],
    "Automobile & Motors": [
        "auto", "motor", "bike", "motorcycle", "car", "mechanic", "garage", "tyre", "parts"
    ],
    "Furniture & Decor": [
        "furniture", "interior", "wood", "sofa", "bed", "decor", "home decor", "hatil", "regal", "otobi"
    ],
    "Wholesale": [
        "wholesale", "wholesaler", "dealer", "importer", "distributor", "bulk", "supply"
    ],
}


class LeadScraperEngine:
    def __init__(self, wa_engine_url: Optional[str] = None, searxng_url: Optional[str] = None):
        self.wa_engine_url = wa_engine_url or WHATSAPP_ENGINE_URL
        self.searxng_url = searxng_url or SEARXNG_URL

    @staticmethod
    def extract_phone(text: str, country_code: str = "BD") -> Optional[str]:
        if not text:
            return None
        cfg = COUNTRY_CONFIGS.get(country_code.upper(), COUNTRY_CONFIGS["BD"])
        normalized = text.translate(BN_DIGIT_MAP).translate(AR_DIGIT_MAP)
        matches = cfg["regex"].findall(normalized)
        for m in matches:
            digits = re.sub(r'\D', '', m)
            cleaned = cfg["phone_cleaner"](digits)
            if cfg["is_valid"](cleaned):
                return cleaned
        return None

    @staticmethod
    def extract_all_phones(text: str, country_code: str = "BD") -> List[str]:
        if not text:
            return []
        cfg = COUNTRY_CONFIGS.get(country_code.upper(), COUNTRY_CONFIGS["BD"])
        normalized = text.translate(BN_DIGIT_MAP).translate(AR_DIGIT_MAP)
        phones = []
        matches = cfg["regex"].findall(normalized)
        for m in matches:
            digits = re.sub(r'\D', '', m)
            cleaned = cfg["phone_cleaner"](digits)
            if cfg["is_valid"](cleaned) and cleaned not in phones:
                phones.append(cleaned)
        return phones

    @staticmethod
    def extract_email(text: str) -> Optional[str]:
        if not text:
            return None
        email_match = re.search(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', text)
        if email_match:
            email = email_match.group(0).lower()
            if not any(skip in email for skip in ['example.com', 'domain.com', 'email.com', 'sentry.io']):
                return email
        return None

    @staticmethod
    def extract_website(text: str) -> Optional[str]:
        if not text:
            return None
        url_match = re.search(r'https?://(?:www\.)?[a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+(?:/[^\s,;]*)?', text)
        if url_match:
            url = url_match.group(0)
            if not any(skip in url.lower() for skip in ['facebook.com', 'google.com', 'youtube.com', 'instagram.com', 'twitter.com']):
                return url
        return None

    @staticmethod
    def detect_category(query: str, default: str = "Retail") -> str:
        q_lower = query.lower()
        for cat, keywords in CATEGORY_KEYWORDS.items():
            if any(kw in q_lower for kw in keywords):
                return cat
        return default

    @staticmethod
    def extract_location_from_query(query: str, country_name: str = "Bangladesh") -> str:
        """Extract searched location/district/upazila from user query."""
        q_clean = query.lower()
        for prefix in ["electronics shop in", "shop in", "store in", "showroom in", "dealer in", "boutique in", "wholesale in", "in", "near"]:
            q_clean = re.sub(r'\b' + re.escape(prefix) + r'\b', '', q_clean, flags=re.IGNORECASE).strip()
        
        location = " ".join([word.capitalize() for word in q_clean.split() if len(word) > 1])
        return location if location else country_name

    @staticmethod
    def clean_shop_title(title: str) -> str:
        """Clean raw web or Facebook titles to extract genuine business name."""
        clean = title
        clean = re.sub(r'\s*[\|\-–—]\s*(Facebook|Official Page|Home|Instagram|YouTube|Website|BD|Bangladesh|India|UAE|USA|UK).*', '', clean, flags=re.IGNORECASE).strip()
        clean = re.sub(r'^(Grand opening of|Welcome to|Visit us at|Visit our|Official)\s*', '', clean, flags=re.IGNORECASE).strip()
        clean = re.sub(r'\s*\|\s*.*', '', clean).strip()
        clean = re.sub(r'\s*\.\.\.$', '', clean).strip()
        if len(clean) < 3 or clean.lower() in ["log in", "sign up", "facebook", "home", "about us", "contact us", "used products", "electronics"]:
            return ""
        return clean

    def generate_search_queries(self, query: str, country_code: str = "BD", limit: int = 20) -> List[str]:
        cfg = COUNTRY_CONFIGS.get(country_code.upper(), COUNTRY_CONFIGS["BD"])
        country_name = cfg["name"]
        suffix = cfg["search_suffix"]
        location = self.extract_location_from_query(query, country_name)
        operators = cfg.get("operators", ["phone", "mobile", "WhatsApp"])
        directories = cfg.get("directories", [])

        queries = [
            f"{query} {suffix}".strip(),
            f"site:facebook.com {query} {country_name}".strip(),
            f"site:facebook.com {query} {location} contact".strip(),
            f"{query} whatsapp number {country_name}".strip(),
            f"{query} contact number {location}".strip(),
            f"{query} mobile number {country_name}".strip(),
            f"{query} showroom address {suffix}".strip(),
            f"{query} market {location} {suffix}".strip(),
            f"{query} plaza {location} {suffix}".strip(),
            f"{query} shopping complex {location}".strip(),
            f"{query} shop list {location}".strip(),
            f"{query} dealer {country_name}".strip(),
        ]

        # Operator prefix searches (e.g. 017, 018, 019...)
        for op in operators:
            queries.append(f"{query} {op} {suffix}".strip())
            queries.append(f"site:facebook.com {query} {op}".strip())

        # Area code / section expansions for deep search
        for num in ["1", "2", "10", "11", "12"]:
            queries.append(f"{query} {num} {suffix}".strip())

        # Directory sites
        for d in directories:
            queries.append(f"site:{d} {query}".strip())

        # Deduplicate
        seen = set()
        deduped = []
        for q in queries:
            if q not in seen:
                seen.add(q)
                deduped.append(q)

        # Scale query count with requested limit
        if limit <= 10:
            return deduped[:8]
        elif limit <= 25:
            return deduped[:14]
        elif limit <= 50:
            return deduped[:22]
        else:
            return deduped

    async def fetch_searxng_multi_source(self, query: str, country_code: str = "BD", limit: int = 50) -> List[Dict[str, Any]]:
        """
        Execute deep parallel multi-engine search passes via local SearXNG (Google, Bing, Yahoo, Mojeek, Qwant):
        1. General web and business directories.
        2. Facebook business pages & verified stores.
        3. Contact & phone number specific search.
        """
        cfg = COUNTRY_CONFIGS.get(country_code.upper(), COUNTRY_CONFIGS["BD"])
        country_name = cfg["name"]
        location = self.extract_location_from_query(query, country_name)
        search_queries = self.generate_search_queries(query=query, country_code=country_code, limit=limit)

        sem = asyncio.Semaphore(4)
        max_pages = 1 if limit <= 10 else (2 if limit <= 25 else (3 if limit <= 50 else 4))

        async def fetch_page(client: httpx.AsyncClient, q: str, page: int) -> List[Dict[str, Any]]:
            async with sem:
                try:
                    resp = await client.get(
                        f"{self.searxng_url}/search",
                        params={
                            "q": q,
                            "format": "json",
                            "safesearch": "0",
                            "engines": "google,bing,yahoo,mojeek,qwant",
                            "pageno": page
                        },
                        timeout=10.0
                    )
                    if resp.status_code == 200:
                        return resp.json().get("results", [])
                except Exception as e:
                    logger.debug(f"SearXNG query error for '{q}' page {page}: {e}")
                return []

        tasks = []
        async with httpx.AsyncClient(timeout=12.0) as client:
            for sq in search_queries:
                for p in range(1, max_pages + 1):
                    tasks.append(fetch_page(client, sq, p))
            responses = await asyncio.gather(*tasks)

        raw_leads = []
        seen_urls = set()
        seen_titles = set()

        for res_list in responses:
            for r in res_list:
                url = r.get("url", "")
                title = r.get("title", "")
                content = r.get("content", "")
                thumbnail = r.get("thumbnail") or r.get("img_src") or None

                if any(skip in url.lower() for skip in [
                    "login", "help", "recover", "terms", "privacy", "policy",
                    "sharer", "places/clothing", "events/category", "accounts/login"
                ]):
                    continue

                clean_url = url.split("?")[0].rstrip("/")
                if clean_url in seen_urls:
                    continue
                seen_urls.add(clean_url)

                shop_name = self.clean_shop_title(title)
                if not shop_name:
                    continue

                combined_text = f"{title} {content} {clean_url}"
                phones = self.extract_all_phones(combined_text, country_code=country_code)
                email = self.extract_email(combined_text)
                website = self.extract_website(combined_text)
                fb_url = clean_url if "facebook.com" in clean_url else None

                extracted_address = f"{location}, {country_name}"
                addr_match = re.search(r'([A-Za-z0-9\s,\-\.]{5,60}(?:Market|Bazar|Road|Holding|Ward|Showroom|Center|Plaza|Complex|Town|Street|Avenue|Sector|Block|City)[A-Za-z0-9\s,\-\.]*)', content, flags=re.IGNORECASE)
                if addr_match:
                    found_addr = addr_match.group(1).strip()
                    if len(found_addr) > 8:
                        extracted_address = f"{found_addr}, {country_name}"

                raw_leads.append({
                    "shop_name": shop_name,
                    "phones": phones,
                    "phone": phones[0] if phones else None,
                    "email": email,
                    "website": website,
                    "facebook_url": fb_url,
                    "source_url": clean_url,
                    "content": content,
                    "thumbnail": thumbnail if thumbnail and not thumbnail.startswith("http://searxng") else None,
                    "address": extracted_address,
                })

        return raw_leads

    async def search_and_generate_leads(
        self,
        query: str,
        category: Optional[str] = None,
        country: str = "BD",
        limit: int = 20,
        only_whatsapp: bool = False,
        exclude_existing: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Deep AI Discovery Engine:
        1. Query local SearXNG across Multi-Engines scoped to chosen country.
        2. Extract REAL phone numbers, exact shop names, and accurate local addresses.
        3. Verify all discovered phones on live WhatsApp Engine (sock.onWhatsApp & profile picture).
        4. Synthesize Google Maps Search URLs for direct navigation.
        """
        detected_category = self.detect_category(query, default="Retail")
        selected_category = category if category and category != "All" else detected_category
        cfg = COUNTRY_CONFIGS.get(country.upper(), COUNTRY_CONFIGS["BD"])
        country_name = cfg["name"]
        location = self.extract_location_from_query(query, country_name)

        # 1. Fetch Multi-Engine Multi-Source Leads via SearXNG
        raw_leads = await self.fetch_searxng_multi_source(query=query, country_code=country, limit=limit)

        leads: List[Dict[str, Any]] = []
        seen_phones: Set[str] = set()
        seen_names: Set[str] = set()

        for r in raw_leads:
            name = r["shop_name"]
            phones = r.get("phones") or ([r["phone"]] if r.get("phone") else [])
            email = r.get("email") or ""
            website = r.get("website") or ""
            fb_url = r.get("facebook_url")
            address = r.get("address") or f"{location}, {country_name}"
            thumb = r.get("thumbnail")
            content = r.get("content") or ""

            if phones:
                for p in phones:
                    if p in seen_phones:
                        continue
                    seen_phones.add(p)
                    
                    gmaps_query = urllib.parse.quote(f"{name} {location} {country_name}")
                    gmaps_url = f"https://www.google.com/maps/search/?api=1&query={gmaps_query}"
                    lead_id = hashlib.md5(f"{p}_{name}_{location}_{country}".encode()).hexdigest()[:12]

                    leads.append({
                        "id": lead_id,
                        "shop_name": name,
                        "phone": p,
                        "email": email,
                        "website": website,
                        "country": country.upper(),
                        "category": selected_category,
                        "shop_type": "Verified Business",
                        "address": address,
                        "facebook_url": fb_url,
                        "google_maps_url": gmaps_url,
                        "profile_pic": thumb,
                        "notes": f"{content[:160]}..." if content else f"Business located in {location}, {country_name}",
                        "is_on_whatsapp": False,
                        "whatsapp_profile_pic": None,
                        "selected": True,
                    })
            else:
                if name.lower() in seen_names:
                    continue
                seen_names.add(name.lower())
                gmaps_query = urllib.parse.quote(f"{name} {location} {country_name}")
                gmaps_url = f"https://www.google.com/maps/search/?api=1&query={gmaps_query}"
                lead_id = hashlib.md5(f"no_phone_{name}_{location}_{country}".encode()).hexdigest()[:12]

                leads.append({
                    "id": lead_id,
                    "shop_name": name,
                    "phone": "",
                    "email": email,
                    "website": website,
                    "country": country.upper(),
                    "category": selected_category,
                    "shop_type": "Verified Business",
                    "address": address,
                    "facebook_url": fb_url,
                    "google_maps_url": gmaps_url,
                    "profile_pic": thumb,
                    "notes": f"{content[:160]}..." if content else f"Business located in {location}, {country_name}",
                    "is_on_whatsapp": False,
                    "whatsapp_profile_pic": None,
                    "selected": True,
                })

        # 2. Batch WhatsApp Live Verification via wa-engine for leads with phone numbers
        leads_with_phones = [l for l in leads if l["phone"]]
        leads_without_phones = [l for l in leads if not l["phone"]]

        if leads_with_phones:
            verified_leads = await self._verify_whatsapp_batch(leads_with_phones, country_code=country)
        else:
            verified_leads = []

        combined = verified_leads + leads_without_phones

        # 3. Filter only WhatsApp if requested
        if only_whatsapp:
            combined = [l for l in combined if l.get("is_on_whatsapp")]

        return combined[:limit]

    async def _verify_whatsapp_batch(self, leads: List[Dict[str, Any]], country_code: str = "BD") -> List[Dict[str, Any]]:
        """Verify contact numbers on Baileys WhatsApp Engine in parallel."""
        cfg = COUNTRY_CONFIGS.get(country_code.upper(), COUNTRY_CONFIGS["BD"])
        dial_prefix = cfg["dial_code"]

        async with httpx.AsyncClient(timeout=4.0) as client:
            tasks = []
            for lead in leads:
                phone = lead["phone"]
                if not phone:
                    tasks.append(asyncio.sleep(0))
                    continue
                
                # Format phone for international WhatsApp check
                check_phone = phone
                if country_code == "BD" and phone.startswith("01"):
                    check_phone = "880" + phone[1:]
                elif dial_prefix and not phone.startswith("+") and not phone.startswith(dial_prefix.replace("+", "")):
                    clean_dial = dial_prefix.replace("+", "")
                    clean_local = phone.lstrip("0")
                    check_phone = f"{clean_dial}{clean_local}"

                tasks.append(
                    client.get(
                        f"{self.wa_engine_url}/check-contact",
                        params={"phone": check_phone}
                    )
                )

            responses = await asyncio.gather(*tasks, return_exceptions=True)

            for i, resp in enumerate(responses):
                if isinstance(resp, httpx.Response) and resp.status_code == 200:
                    data = resp.json()
                    is_wa = data.get("exists", False)
                    pic = data.get("profilePicUrl")
                    leads[i]["is_on_whatsapp"] = is_wa
                    if pic:
                        leads[i]["whatsapp_profile_pic"] = pic
                        if not leads[i].get("profile_pic"):
                            leads[i]["profile_pic"] = pic
                else:
                    leads[i]["is_on_whatsapp"] = False

        return leads
