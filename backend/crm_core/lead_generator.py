import os
import re
import json
import asyncio
import logging
import urllib.parse
import hashlib
from typing import List, Dict, Any, Optional, Set
import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

SEARXNG_URL = os.environ.get("SEARXNG_URL", "http://searxng:8080")
WHATSAPP_ENGINE_URL = os.environ.get("WHATSAPP_ENGINE_URL", "http://whatsapp-engine:5001")

# Regex to catch Bangladeshi mobile numbers in any formatting (English & Bengali numerals)
BN_DIGIT_MAP = str.maketrans('০১২৩৪৫৬৭৮৯', '0123456789')
BD_PHONE_REGEX = re.compile(r'(?:\+?880\s*|0)?1[3-9](?:[\s-]?\d){8}')

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
    def clean_bd_phone(text: str) -> Optional[str]:
        if not text:
            return None
        normalized = text.translate(BN_DIGIT_MAP)
        matches = BD_PHONE_REGEX.findall(normalized)
        for m in matches:
            digits = re.sub(r'\D', '', m)
            if digits.startswith('880'):
                digits = '0' + digits[3:]
            if len(digits) == 11 and digits.startswith('01'):
                # Valid operator check: 013, 014, 015, 016, 017, 018, 019
                if digits[2] in "3456789":
                    return digits
        return None

    @staticmethod
    def extract_all_phones(text: str) -> List[str]:
        if not text:
            return []
        normalized = text.translate(BN_DIGIT_MAP)
        phones = []
        matches = BD_PHONE_REGEX.findall(normalized)
        for m in matches:
            digits = re.sub(r'\D', '', m)
            if digits.startswith('880'):
                digits = '0' + digits[3:]
            if len(digits) == 11 and digits.startswith('01') and digits[2] in "3456789":
                if digits not in phones:
                    phones.append(digits)
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
    def extract_location_from_query(query: str) -> str:
        """Extract searched location/district/upazila from user query."""
        q_clean = query.lower()
        # Remove common query prefixes
        for prefix in ["electronics shop in", "shop in", "store in", "showroom in", "dealer in", "boutique in", "wholesale in", "in"]:
            q_clean = re.sub(r'\b' + re.escape(prefix) + r'\b', '', q_clean, flags=re.IGNORECASE).strip()
        
        # Capitalize words for clean display
        location = " ".join([word.capitalize() for word in q_clean.split() if len(word) > 1])
        return location if location else "Bangladesh"

    @staticmethod
    def clean_shop_title(title: str) -> str:
        """Clean raw web or Facebook titles to extract genuine business name."""
        clean = title
        # Strip trailing branding like | Facebook, - Facebook, | Official Page, etc.
        clean = re.sub(r'\s*[\|\-–—]\s*(Facebook|Official Page|Home|Instagram|YouTube|Website|BD|Bangladesh).*', '', clean, flags=re.IGNORECASE).strip()
        clean = re.sub(r'^(Grand opening of|Welcome to|Visit us at|Visit our|Official)\s*', '', clean, flags=re.IGNORECASE).strip()
        clean = re.sub(r'\s*\|\s*.*', '', clean).strip()
        
        # Remove trailing status suffixes
        clean = re.sub(r'\s*\.\.\.$', '', clean).strip()
        if len(clean) < 3 or clean.lower() in ["log in", "sign up", "facebook", "home", "about us", "contact us", "used products"]:
            return ""
        return clean

    async def fetch_searxng_multi_source(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Execute multiple targeted search passes via local SearXNG:
        1. General web and business directory search for the exact query.
        2. Facebook business pages & verified stores.
        3. Contact & phone number specific search.
        """
        location = self.extract_location_from_query(query)
        search_queries = [
            f"{query} Bangladesh",
            f"site:facebook.com {query} Bangladesh",
            f"{query} showroom address phone 017 OR 018 OR 019 OR 016 OR 013 OR 014 Bangladesh",
            f"{query} contact number store Bangladesh",
        ]

        raw_leads = []
        seen_urls = set()
        seen_titles = set()

        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            for sq in search_queries:
                try:
                    resp = await client.get(
                        f"{self.searxng_url}/search",
                        params={
                            "q": sq,
                            "format": "json",
                            "safesearch": "0"
                        }
                    )
                    if resp.status_code != 200:
                        continue

                    data = resp.json()
                    results = data.get("results", [])

                    for r in results:
                        url = r.get("url", "")
                        title = r.get("title", "")
                        content = r.get("content", "")
                        thumbnail = r.get("thumbnail") or r.get("img_src") or None

                        # Filter junk / authentication pages
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
                        if not shop_name or shop_name.lower() in seen_titles:
                            continue
                        seen_titles.add(shop_name.lower())

                        combined_text = f"{title} {content}"
                        phone = self.clean_bd_phone(combined_text)
                        email = self.extract_email(combined_text)
                        website = self.extract_website(combined_text)
                        fb_url = clean_url if "facebook.com" in clean_url else None

                        # Clean address extraction from content snippet
                        extracted_address = None
                        if location and location.lower() != "bangladesh":
                            extracted_address = f"{location}, Bangladesh"
                        
                        # Look for specific address markers in content (e.g. Market, Road, Holding, Bazar)
                        addr_match = re.search(r'([A-Za-z0-9\s,\-\.]{5,60}(?:Market|Bazar|Road|Holding|Ward|Showroom|Center|Plaza|Complex|Town|Division)[A-Za-z0-9\s,\-\.]*)', content, flags=re.IGNORECASE)
                        if addr_match:
                            found_addr = addr_match.group(1).strip()
                            if len(found_addr) > 10:
                                extracted_address = found_addr

                        raw_leads.append({
                            "shop_name": shop_name,
                            "phone": phone,
                            "email": email,
                            "website": website,
                            "facebook_url": fb_url,
                            "source_url": clean_url,
                            "content": content,
                            "thumbnail": thumbnail if thumbnail and not thumbnail.startswith("http://searxng") else None,
                            "address": extracted_address or f"{location}, Bangladesh",
                        })

                        if len(raw_leads) >= limit:
                            break
                except Exception as e:
                    logger.warning(f"SearXNG query error for '{sq}': {e}")

                if len(raw_leads) >= limit:
                    break

        return raw_leads

    async def search_and_generate_leads(
        self,
        query: str,
        category: Optional[str] = None,
        limit: int = 20,
        only_whatsapp: bool = False,
        exclude_existing: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        AI Discovery Engine:
        1. Query local SearXNG with multi-pass search across Web, Facebook & Local Directories.
        2. Extract REAL phone numbers, exact shop names, and accurate local addresses.
        3. Verify each phone on live WhatsApp Engine (sock.onWhatsApp & profile picture).
        4. Synthesize Google Maps Search URLs for direct navigation.
        """
        detected_category = self.detect_category(query, default="Retail")
        selected_category = category if category and category != "All" else detected_category
        location = self.extract_location_from_query(query)

        # 1. Fetch Real Multi-Source Leads via SearXNG
        raw_leads = await self.fetch_searxng_multi_source(query=query, limit=max(limit * 2, 40))

        leads: List[Dict[str, Any]] = []
        seen_phones: Set[str] = set()
        seen_names: Set[str] = set()

        for r in raw_leads:
            name = r["shop_name"]
            phone = r["phone"]
            email = r.get("email") or ""
            website = r.get("website") or ""
            fb_url = r.get("facebook_url")
            address = r.get("address") or f"{location}, Bangladesh"
            thumb = r.get("thumbnail")
            content = r.get("content") or ""

            if name.lower() in seen_names:
                continue
            seen_names.add(name.lower())

            # If no phone was in the snippet, we keep phone empty or check if there is a number
            if phone:
                if phone in seen_phones:
                    continue
                seen_phones.add(phone)
            else:
                phone = ""

            gmaps_query = urllib.parse.quote(f"{name} {location} Bangladesh")
            gmaps_url = f"https://www.google.com/maps/search/?api=1&query={gmaps_query}"
            lead_id = hashlib.md5(f"{phone}_{name}_{location}".encode()).hexdigest()[:12]

            leads.append({
                "id": lead_id,
                "shop_name": name,
                "phone": phone,
                "email": email,
                "website": website,
                "category": selected_category,
                "shop_type": "Verified Business",
                "address": address,
                "facebook_url": fb_url,
                "google_maps_url": gmaps_url,
                "profile_pic": thumb,
                "notes": f"{content[:160]}..." if content else f"Business located in {location}",
                "is_on_whatsapp": False,
                "whatsapp_profile_pic": None,
                "selected": True,
            })

            if len(leads) >= limit:
                break

        # 2. Batch WhatsApp Live Verification via wa-engine for leads with phone numbers
        leads_with_phones = [l for l in leads if l["phone"]]
        leads_without_phones = [l for l in leads if not l["phone"]]

        if leads_with_phones:
            verified_leads = await self._verify_whatsapp_batch(leads_with_phones)
        else:
            verified_leads = []

        combined = verified_leads + leads_without_phones

        # 3. Filter only WhatsApp if requested
        if only_whatsapp:
            combined = [l for l in combined if l.get("is_on_whatsapp")]

        return combined[:limit]

    async def _verify_whatsapp_batch(self, leads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Verify contact numbers on Baileys WhatsApp Engine in parallel."""
        async with httpx.AsyncClient(timeout=4.0) as client:
            tasks = []
            for lead in leads:
                phone = lead["phone"]
                if not phone:
                    tasks.append(asyncio.sleep(0))
                    continue
                tasks.append(
                    client.get(
                        f"{self.wa_engine_url}/check-contact",
                        params={"phone": phone}
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
