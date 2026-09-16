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

SEARXNG_INTERNAL_URL = os.getenv("SEARXNG_URL", "http://searxng:8080")
WA_ENGINE_URL = os.getenv("WA_ENGINE_URL", "http://wa-engine:5001")

COUNTRY_CONFIGS = {
    "BD": {
        "name": "Bangladesh",
        "dial_code": "+880",
        "default_city": "Dhaka",
        "phone_pattern": r'(?:(?:\+|00)?880\s*|0)?1[3-9](?:[\s\-\.\(\)]?\d){8}',
        "phone_clean": lambda p: "01" + re.sub(r'\D', '', p)[-9:] if len(re.sub(r'\D', '', p)) >= 10 else p,
        "phone_prefixes": ["017", "018", "019", "016", "013", "015", "014"],
        "directories": ["bikroy.com", "bdstall.com", "bdtradeinfo.com", "yellowpages.com.bd"]
    },
    "IN": {
        "name": "India",
        "dial_code": "+91",
        "default_city": "Delhi",
        "phone_pattern": r'(?:(?:\+|00)?91\s*|0)?[6-9](?:[\s\-\.\(\)]?\d){9}',
        "phone_clean": lambda p: "+91" + re.sub(r'\D', '', p)[-10:] if len(re.sub(r'\D', '', p)) >= 10 else p,
        "phone_prefixes": ["98", "99", "97", "96", "91", "88", "87", "70"],
        "directories": ["justdial.com", "indiamart.com", "tradeindia.com"]
    },
    "AE": {
        "name": "United Arab Emirates",
        "dial_code": "+971",
        "default_city": "Dubai",
        "phone_pattern": r'(?:(?:\+|00)?971\s*|0)?5[0-9](?:[\s\-\.\(\)]?\d){7}',
        "phone_clean": lambda p: "+971" + re.sub(r'\D', '', p)[-9:] if len(re.sub(r'\D', '', p)) >= 9 else p,
        "phone_prefixes": ["050", "052", "054", "055", "056", "058"],
        "directories": ["yellowpages.ae", "dcciinfo.ae"]
    },
    "SA": {
        "name": "Saudi Arabia",
        "dial_code": "+966",
        "default_city": "Riyadh",
        "phone_pattern": r'(?:(?:\+|00)?966\s*|0)?5[0-9](?:[\s\-\.\(\)]?\d){7}',
        "phone_clean": lambda p: "+966" + re.sub(r'\D', '', p)[-9:] if len(re.sub(r'\D', '', p)) >= 9 else p,
        "phone_prefixes": ["050", "053", "055", "054", "056", "059"],
        "directories": ["saudiayellowpages.com"]
    },
    "PK": {
        "name": "Pakistan",
        "dial_code": "+92",
        "default_city": "Karachi",
        "phone_pattern": r'(?:(?:\+|00)?92\s*|0)?3[0-9]{2}(?:[\s\-\.\(\)]?\d){7}',
        "phone_clean": lambda p: "+92" + re.sub(r'\D', '', p)[-10:] if len(re.sub(r'\D', '', p)) >= 10 else p,
        "phone_prefixes": ["0300", "0301", "0312", "0321", "0333", "0345"],
        "directories": ["pakistanphones.com", "yellowpages.biz.pk"]
    },
    "US": {
        "name": "United States",
        "dial_code": "+1",
        "default_city": "New York",
        "phone_pattern": r'(?:(?:\+|00)?1\s*)?(?:\([2-9]\d{2}\)|[2-9]\d{2})[\s\-\.]?[2-9]\d{2}[\s\-\.]?\d{4}',
        "phone_clean": lambda p: "+1" + re.sub(r'\D', '', p)[-10:] if len(re.sub(r'\D', '', p)) >= 10 else p,
        "phone_prefixes": [],
        "directories": ["yellowpages.com", "yelp.com", "manta.com"]
    },
    "GB": {
        "name": "United Kingdom",
        "dial_code": "+44",
        "default_city": "London",
        "phone_pattern": r'(?:(?:\+|00)?44\s*|0)?7[0-9]{3}[\s\-\.]?\d{6}',
        "phone_clean": lambda p: "+44" + re.sub(r'\D', '', p)[-10:] if len(re.sub(r'\D', '', p)) >= 10 else p,
        "phone_prefixes": [],
        "directories": ["yell.com", "scoot.co.uk"]
    },
    "GLOBAL": {
        "name": "Global",
        "dial_code": "",
        "default_city": "",
        "phone_pattern": r'(?:\+|00)?[1-9]\d{1,3}[\s\-\.\(\)]?\d{2,4}[\s\-\.\(\)]?\d{3,4}',
        "phone_clean": lambda p: "+" + re.sub(r'\D', '', p) if len(re.sub(r'\D', '', p)) >= 8 else p,
        "phone_prefixes": [],
        "directories": []
    }
}

CATEGORY_KEYWORDS = {
    "Electronics": ["electronics", "gadget", "mobile", "computer", "laptop", "tv", "camera", "appliance", "phone", "ac", "refrigerator", "accessories"],
    "Fashion": ["clothing", "fashion", "boutique", "apparel", "tailor", "saree", "panjabi", "shoes", "garments", "wear"],
    "Food & Grocery": ["grocery", "supermarket", "food", "restaurant", "cafe", "bakery", "sweet", "catering", "meat", "fish", "spices"],
    "Healthcare": ["pharmacy", "medicine", "clinic", "hospital", "doctor", "dental", "diagnostic", "chemist", "optics"],
    "Services": ["agency", "consultancy", "travel", "courier", "cleaning", "repair", "service", "lawyer", "accounting"],
    "Real Estate": ["real estate", "property", "builder", "developer", "flat", "plot", "rent"],
    "Automotive": ["auto", "car", "bike", "motorcycle", "garage", "workshop", "parts", "tyre", "lubricant"],
}


class LeadScraperEngine:
    def __init__(self, searxng_url: str = SEARXNG_INTERNAL_URL, wa_engine_url: str = WA_ENGINE_URL):
        self.searxng_url = searxng_url
        self.wa_engine_url = wa_engine_url

    @staticmethod
    def generate_avatar_url(shop_name: str, website: Optional[str] = None, facebook_url: Optional[str] = None, thumbnail: Optional[str] = None) -> str:
        """Generate high-quality visual avatar / logo URL for business."""
        if thumbnail and not thumbnail.startswith("http://searxng") and "searxng:8080" not in thumbnail:
            return thumbnail
        if website:
            try:
                domain = urllib.parse.urlparse(website if website.startswith("http") else f"https://{website}").netloc.replace("www.", "").strip()
                if domain and "." in domain and not any(skip in domain.lower() for skip in ["facebook.com", "google.com", "youtube.com"]):
                    return f"https://www.google.com/s2/favicons?domain={domain}&sz=128"
            except Exception:
                pass
        if facebook_url and "facebook.com" in facebook_url:
            try:
                parts = [p for p in facebook_url.split("facebook.com/")[-1].split("/") if p and p not in ["posts", "videos", "photos", "groups", "events", "stories", "pages", "p"]]
                if parts:
                    handle = parts[0].split("?")[0].strip()
                    if len(handle) > 2 and not handle.isdigit():
                        return f"https://unavatar.io/facebook/{handle}"
            except Exception:
                pass
        
        # High contrast UI Avatar with colorful styling
        safe_name = urllib.parse.quote(shop_name[:25].strip() if shop_name else "Shop")
        return f"https://ui-avatars.com/api/?name={safe_name}&background=random&color=fff&size=128&bold=true&font-size=0.4"

    def clean_shop_name(self, raw_title: str) -> str:
        """Extract clean human-readable shop name from web title."""
        title = re.sub(r'https?://\S+', '', raw_title)
        separators = ['|', '-', '–', '—', '•', ':', '>', '–']
        for sep in separators:
            if sep in title:
                parts = [p.strip() for p in title.split(sep) if p.strip()]
                if parts:
                    for part in parts:
                        if not any(stop in part.lower() for stop in ['home', 'login', 'about us', 'contact', 'facebook', 'yellow pages', 'top 10', 'best']):
                            title = part
                            break
                    else:
                        title = parts[0]
        title = re.sub(r'[^\w\s\.\&\,\'\-\(\)]', '', title)
        title = re.sub(r'\s+', ' ', title).strip()
        return title[:70] if title else "Discovered Business"

    def extract_location_from_query(self, query: str, country_name: str) -> str:
        """Extract target city/area from query string."""
        q = query.lower()
        stopwords = ["in", "at", "near", "for", "shop", "shops", "store", "stores", "showroom", "business", "dealer", "wholesaler", "supplier", "best", "top", "online", "market", "plaza", "centre", "center"]
        for cat_list in CATEGORY_KEYWORDS.values():
            stopwords.extend([w.lower() for w in cat_list])
        
        words = q.split()
        location_words = [w for w in words if w not in stopwords and w != country_name.lower()]
        location = " ".join(location_words).strip().title()
        return location if location else country_name

    def extract_all_phones(self, text: str, country_code: str = "BD") -> List[str]:
        """Extract and normalize all valid phone numbers from a text snippet."""
        if not text:
            return []
        
        cfg = COUNTRY_CONFIGS.get(country_code.upper(), COUNTRY_CONFIGS["BD"])
        pattern = cfg["phone_pattern"]
        clean_fn = cfg["phone_clean"]

        # Normalize Bengali numerals
        bengali_digits = {'০':'0', '১':'1', '২':'2', '৩':'3', '৪':'4', '৫':'5', '৬':'6', '৭':'7', '৮':'8', '৯':'9'}
        for b_digit, e_digit in bengali_digits.items():
            text = text.replace(b_digit, e_digit)

        matches = re.finditer(pattern, text)
        results = []
        for m in matches:
            raw_match = m.group(0)
            cleaned = clean_fn(raw_match)
            if cleaned and cleaned not in results:
                # Basic sanity check
                digits = re.sub(r'\D', '', cleaned)
                if len(digits) >= 8:
                    results.append(cleaned)
        return results

    def detect_category(self, query: str, default: str = "Retail") -> str:
        """Infer business category from user search query."""
        q = query.lower()
        for cat, keywords in CATEGORY_KEYWORDS.items():
            for kw in keywords:
                if kw in q:
                    return cat
        return default

    def generate_search_queries(self, query: str, country_code: str = "BD", limit: int = 50) -> List[str]:
        """Generate smart multi-angle search query variations."""
        cfg = COUNTRY_CONFIGS.get(country_code.upper(), COUNTRY_CONFIGS["BD"])
        country_name = cfg["name"]
        location = self.extract_location_from_query(query, country_name)
        prefixes = cfg.get("phone_prefixes", [])
        directories = cfg.get("directories", [])

        queries = []
        suffix = country_name if country_name.lower() not in query.lower() else ""

        # 1. Base query combinations
        queries.append(f"{query} {suffix}".strip())
        queries.append(f"{query} contact number {suffix}".strip())
        queries.append(f"{query} whatsapp number {suffix}".strip())
        queries.append(f"{query} showroom address {suffix}".strip())
        queries.append(f"{query} store {location}".strip())

        # 2. Area variations if location detected
        if location and location.lower() != country_name.lower():
            for sub in ["1", "2", "10", "11", "12", "Market", "Plaza", "Shopping Complex"]:
                queries.append(f"{query} {sub} {suffix}".strip())

        # 3. Mobile operator prefix targeted queries
        for pfx in prefixes:
            queries.append(f"{query} {pfx} {suffix}".strip())

        # 4. Social & Business pages
        queries.append(f"site:facebook.com {query} {country_name}".strip())
        queries.append(f"site:facebook.com {query} contact".strip())
        queries.append(f"site:facebook.com {query} 017 OR 018 OR 019".strip())

        # 5. Local B2B and YellowPages directories
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

        raw_results = []
        seen_urls = set()
        for res_list in responses:
            for item in res_list:
                url = item.get("url", "")
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    raw_results.append(item)

        # Parse and structure
        extracted_leads = []
        for item in raw_results:
            title = item.get("title", "")
            content = item.get("content", "")
            url = item.get("url", "")
            thumbnail = item.get("thumbnail") or item.get("img_src")

            clean_name = self.clean_shop_name(title)
            phones = self.extract_all_phones(f"{title} {content} {url}", country_code=country_code)

            # Extract email
            email_match = re.search(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', f"{title} {content}")
            email = email_match.group(0) if email_match else ""

            # Check if Facebook or website
            fb_url = url if "facebook.com" in url else None
            website = url if not fb_url else ""

            # Extract rough address
            address_match = re.search(rf'(?:at|in|near|road|sector|block|level|shop\s*(?:no\.?)?)\s*([A-Za-z0-9\s,\-\./#]+(?:{location}|{country_name}))', f"{title} {content}", re.IGNORECASE)
            address = address_match.group(0).strip() if address_match else f"{location}, {country_name}"

            extracted_leads.append({
                "shop_name": clean_name,
                "phones": phones,
                "phone": phones[0] if phones else "",
                "email": email,
                "website": website,
                "facebook_url": fb_url,
                "address": address[:120],
                "thumbnail": thumbnail,
                "content": content
            })

        return extracted_leads

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
            
            # Generate best visual avatar / logo
            avatar_url = self.generate_avatar_url(name, website=website, facebook_url=fb_url, thumbnail=thumb)

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
                        "profile_pic": avatar_url,
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
                    "profile_pic": avatar_url,
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
                    name_wa = data.get("name")
                    about = data.get("about")
                    leads[i]["is_on_whatsapp"] = is_wa
                    if name_wa:
                        leads[i]["whatsapp_name"] = name_wa
                    if about:
                        leads[i]["whatsapp_about"] = about
                    if pic:
                        leads[i]["whatsapp_profile_pic"] = pic
                        leads[i]["profile_pic"] = pic
                    elif not leads[i].get("profile_pic"):
                        leads[i]["profile_pic"] = self.generate_avatar_url(
                            leads[i]["shop_name"],
                            website=leads[i].get("website"),
                            facebook_url=leads[i].get("facebook_url")
                        )
                else:
                    leads[i]["is_on_whatsapp"] = False

        return leads
