import asyncio
import re
import hashlib
import json
import logging
from typing import List, Dict, Any, Optional, Set, Tuple
from urllib.parse import urlparse, quote_plus, unquote
import httpx
from bs4 import BeautifulSoup
import phonenumbers
from phonenumbers import PhoneNumberMatcher, PhoneNumberType

logger = logging.getLogger(__name__)

SEARXNG_ENGINES = "bing,qwant,yep,privacywall,google,brave"

COUNTRY_METADATA = {
    'BD': {
        'name': 'Bangladesh',
        'dial': '+880',
        'iso': 'BD',
        'cities': ['Dhaka', 'Chittagong', 'Sylhet', 'Rajshahi', 'Khulna', 'Bogura', 'Comilla'],
        'directories': ['yellowpagesbd.com', 'bizbangla.com', 'bikroy.com'],
    },
    'US': {
        'name': 'United States',
        'dial': '+1',
        'iso': 'US',
        'cities': ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Miami', 'Dallas', 'Atlanta', 'Seattle'],
        'directories': ['yellowpages.com', 'yelp.com', 'manta.com', 'bbb.org'],
    },
    'GB': {
        'name': 'United Kingdom',
        'dial': '+44',
        'iso': 'GB',
        'cities': ['London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow', 'Liverpool', 'Bristol'],
        'directories': ['yell.com', 'scoot.co.uk', 'freeindex.co.uk', 'thomsonlocal.com'],
    },
    'AE': {
        'name': 'United Arab Emirates',
        'dial': '+971',
        'iso': 'AE',
        'cities': ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Al Ain'],
        'directories': ['yellowpages.ae', 'daleeli.com', 'dubaibizdirectory.com', 'opensooq.com'],
    },
    'SA': {
        'name': 'Saudi Arabia',
        'dial': '+966',
        'iso': 'SA',
        'cities': ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar'],
        'directories': ['daleeli.com', 'yellowpages.com.sa', 'haraj.com.sa'],
    },
    'CA': {
        'name': 'Canada',
        'dial': '+1',
        'iso': 'CA',
        'cities': ['Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa', 'Edmonton'],
        'directories': ['yellowpages.ca', 'yelp.ca', '411.ca'],
    },
    'AU': {
        'name': 'Australia',
        'dial': '+61',
        'iso': 'AU',
        'cities': ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Gold Coast'],
        'directories': ['yellowpages.com.au', 'truelocal.com.au', 'localsearch.com.au'],
    },
    'IN': {
        'name': 'India',
        'dial': '+91',
        'iso': 'IN',
        'cities': ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad'],
        'directories': ['justdial.com', 'indiamart.com', 'tradeindia.com', 'sulekha.com'],
    },
    'PK': {
        'name': 'Pakistan',
        'dial': '+92',
        'iso': 'PK',
        'cities': ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan'],
        'directories': ['businessdirectory.pk', 'pakwheels.com', 'olx.com.pk'],
    },
    'QA': {
        'name': 'Qatar',
        'dial': '+974',
        'iso': 'QA',
        'cities': ['Doha', 'Al Rayyan', 'Al Wakrah', 'Lusail'],
        'directories': ['qatarspages.com', 'yellowpages.qa'],
    },
    'KW': {
        'name': 'Kuwait',
        'dial': '+965',
        'iso': 'KW',
        'cities': ['Kuwait City', 'Hawally', 'Salmiya', 'Al Ahmadi'],
        'directories': ['kuwaityellowpagesonline.com', 'dalilkuwait.com'],
    },
    'OM': {
        'name': 'Oman',
        'dial': '+968',
        'iso': 'OM',
        'cities': ['Muscat', 'Salalah', 'Sohar', 'Nizwa'],
        'directories': ['omanyellowpagesonline.com'],
    },
    'BH': {
        'name': 'Bahrain',
        'dial': '+973',
        'iso': 'BH',
        'cities': ['Manama', 'Riffa', 'Muharraq'],
        'directories': ['bahrainyellowpagesonline.com'],
    },
    'SG': {
        'name': 'Singapore',
        'dial': '+65',
        'iso': 'SG',
        'cities': ['Singapore', 'Jurong', 'Orchard', 'Tampines'],
        'directories': ['yellowpages.com.sg', 'insing.com'],
    },
    'MY': {
        'name': 'Malaysia',
        'dial': '+60',
        'iso': 'MY',
        'cities': ['Kuala Lumpur', 'George Town', 'Johor Bahru', 'Petaling Jaya'],
        'directories': ['yellowpages.my', 'businesslist.my'],
    },
    'DE': {
        'name': 'Germany',
        'dial': '+49',
        'iso': 'DE',
        'cities': ['Berlin', 'Munich', 'Frankfurt', 'Hamburg', 'Cologne', 'Stuttgart'],
        'directories': ['gelbeseiten.de', 'dasoertliche.de', 'europages.de'],
    },
    'FR': {
        'name': 'France',
        'dial': '+33',
        'iso': 'FR',
        'cities': ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Bordeaux'],
        'directories': ['pagesjaunes.fr', 'europages.fr'],
    },
    'IT': {
        'name': 'Italy',
        'dial': '+39',
        'iso': 'IT',
        'cities': ['Rome', 'Milan', 'Naples', 'Turin', 'Florence', 'Bologna'],
        'directories': ['paginegialle.it', 'europages.it'],
    },
    'ES': {
        'name': 'Spain',
        'dial': '+34',
        'iso': 'ES',
        'cities': ['Madrid', 'Barcelona', 'Valencia', 'Seville', 'Malaga', 'Bilbao'],
        'directories': ['paginasamarillas.es', 'europages.es'],
    },
    'TR': {
        'name': 'Turkey',
        'dial': '+90',
        'iso': 'TR',
        'cities': ['Istanbul', 'Ankara', 'Izmir', 'Bursa', 'Antalya'],
        'directories': ['sari-sayfalar.com', 'bulurum.com'],
    },
    'ZA': {
        'name': 'South Africa',
        'dial': '+27',
        'iso': 'ZA',
        'cities': ['Johannesburg', 'Cape Town', 'Durban', 'Pretoria'],
        'directories': ['yellowpages.co.za', 'brabys.com'],
    },
    'NG': {
        'name': 'Nigeria',
        'dial': '+234',
        'iso': 'NG',
        'cities': ['Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Kano'],
        'directories': ['businesslist.com.ng', 'vconnect.com'],
    },
    'BR': {
        'name': 'Brazil',
        'dial': '+55',
        'iso': 'BR',
        'cities': ['Sao Paulo', 'Rio de Janeiro', 'Brasilia', 'Salvador', 'Fortaleza'],
        'directories': ['telelistas.net', 'guiamais.com.br'],
    },
    'MX': {
        'name': 'Mexico',
        'dial': '+52',
        'iso': 'MX',
        'cities': ['Mexico City', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana'],
        'directories': ['seccionamarilla.com.mx'],
    },
    'ID': {
        'name': 'Indonesia',
        'dial': '+62',
        'iso': 'ID',
        'cities': ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Bali'],
        'directories': ['yellowpages.co.id'],
    },
    'TH': {
        'name': 'Thailand',
        'dial': '+66',
        'iso': 'TH',
        'cities': ['Bangkok', 'Nonthaburi', 'Chiang Mai', 'Phuket', 'Pattaya'],
        'directories': ['yellowpages.co.th'],
    },
    'NL': {
        'name': 'Netherlands',
        'dial': '+31',
        'iso': 'NL',
        'cities': ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven'],
        'directories': ['detelefoongids.nl', 'europages.nl'],
    },
    'IE': {
        'name': 'Ireland',
        'dial': '+353',
        'iso': 'IE',
        'cities': ['Dublin', 'Cork', 'Galway', 'Limerick'],
        'directories': ['goldenpages.ie', 'yell.ie'],
    },
    'NZ': {
        'name': 'New Zealand',
        'dial': '+64',
        'iso': 'NZ',
        'cities': ['Auckland', 'Wellington', 'Christchurch', 'Hamilton'],
        'directories': ['yellow.co.nz', 'finda.co.nz'],
    },
    'GLOBAL': {
        'name': 'Worldwide',
        'dial': '',
        'iso': None,
        'cities': [],
        'directories': ['yelp.com', 'yellowpages.com', 'google.com/maps', 'linkedin.com/company', 'facebook.com'],
    }
}


class LeadScraperEngine:
    def __init__(self, searxng_url: str = "http://searxng:8080", wa_engine_url: str = "http://wa-engine:5001"):
        self.searxng_url = searxng_url
        self.wa_engine_url = wa_engine_url

    def clean_business_name(self, raw_title: str) -> str:
        """Extract pristine business name by stripping platform suffixes and SEO filler."""
        if not raw_title:
            return "Verified Business"
        
        title = unquote(raw_title).strip()
        title = re.sub(r'&amp;', '&', title)
        title = re.sub(r'&#\d+;', '', title)
        
        patterns_to_strip = [
            r'\s*[-|–—]\s*(Home\s*\|\s*)?Facebook.*$',
            r'\s*[-|–—]\s*Instagram.*$',
            r'\s*[-|–—]\s*LinkedIn.*$',
            r'\s*[-|–—]\s*YouTube.*$',
            r'\s*[-|–—]\s*Twitter.*$',
            r'\s*[-|–—]\s*TikTok.*$',
            r'\s*[-|–—]\s*Yelp.*$',
            r'\s*[-|–—]\s*Yellow\s*Pages.*$',
            r'\s*[-|–—]\s*Tripadvisor.*$',
            r'\s*[-|–—]\s*Justdial.*$',
            r'\s*[-|–—]\s*IndiaMART.*$',
            r'\s*[-|–—]\s*Contact\s*(Us|Page).*$',
            r'\s*[-|–—]\s*Official\s*(Website|Site).*$',
            r'\s*[-|–—]\s*About\s*Us.*$',
            r'^Contact\s*(Us\s*[-|–—]\s*)?',
            r'^About\s*(Us\s*[-|–—]\s*)?',
            r'^Top\s*\d+\s+.*[-|–—]\s*',
            r'^Best\s+.*[-|–—]\s*',
            r'(\.\.\.|\s+\.)$'
        ]
        
        for pat in patterns_to_strip:
            title = re.sub(pat, '', title, flags=re.IGNORECASE)
        
        parts = re.split(r'\s+[|:–—]\s+', title)
        if len(parts) > 1 and len(parts[0].strip()) >= 3:
            title = parts[0].strip()
        
        title = re.sub(r'\s+', ' ', title).strip()
        return title[:60] if title else "Verified Business"

    def extract_and_format_phone(self, text: str, country_code: Optional[str] = None) -> Optional[str]:
        """
        Extract and validate international phone number using Google phonenumbers library.
        Converts any valid national/international phone format to E.164 (+14155552671).
        """
        if not text:
            return None

        # 1. First check WhatsApp direct links (wa.me/..., api.whatsapp.com/send?phone=...)
        wa_match = re.search(r'(?:wa\.me/|whatsapp\.com/send\?phone=)(\d{7,15})', text)
        if wa_match:
            raw_num = wa_match.group(1)
            try:
                parsed = phonenumbers.parse('+' + raw_num if not raw_num.startswith('+') else raw_num, None)
                if phonenumbers.is_valid_number(parsed):
                    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
            except Exception:
                pass

        # 2. Check tel: links
        tel_match = re.search(r'tel:([+\d\s().-]{7,25})', text)
        if tel_match:
            raw_tel = tel_match.group(1)
            try:
                parsed = phonenumbers.parse(raw_tel, country_code if country_code != 'GLOBAL' else None)
                if phonenumbers.is_valid_number(parsed):
                    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
            except Exception:
                pass

        # 3. Use Google phonenumbers matcher with targeted country ISO
        matcher_region = country_code if country_code and country_code != 'GLOBAL' else None
        try:
            for match in PhoneNumberMatcher(text, matcher_region):
                num = match.number
                if phonenumbers.is_valid_number(num):
                    return phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.E164)
        except Exception:
            pass

        # 4. Fallback for BD
        if country_code == 'BD':
            m = re.search(r'(?:\+?880|0)(1[3-9]\d{8})', text)
            if m:
                return f'+880{m.group(1)}'

        return None

    def extract_emails(self, text: str) -> List[str]:
        """Extract valid business emails from text."""
        if not text:
            return []
        raw = re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text)
        valid = []
        ignored = {'example.com', 'sentry.io', 'wixpress.com', 'domain.com', 'email.com', 'test.com', 'placeholder.com'}
        for email in raw:
            email_clean = email.lower().strip('.')
            domain = email_clean.split('@')[-1]
            if domain not in ignored and not email_clean.endswith(('.png', '.jpg', '.jpeg', '.webp', '.svg')):
                valid.append(email_clean)
        return list(dict.fromkeys(valid))

    def generate_worldwide_search_queries(self, base_query: str, country: str) -> List[str]:
        """Generate high-yield worldwide multi-engine search queries."""
        queries = []
        country_info = COUNTRY_METADATA.get(country, COUNTRY_METADATA['GLOBAL'])
        country_name = country_info['name']

        # 1. Base Query with phone & whatsapp intent
        queries.append(f"{base_query} contact phone")
        queries.append(f"{base_query} whatsapp")
        
        # 2. Country-specific expansion
        if country != 'GLOBAL' and country_name:
            queries.append(f"{base_query} {country_name}")
            queries.append(f"{base_query} {country_name} phone")
            queries.append(f"{base_query} {country_name} whatsapp")

        # 3. Major Cities queries
        for city in country_info['cities'][:2]:
            queries.append(f"{base_query} {city} contact")

        # 4. Social & Places footprints
        queries.append(f"{base_query} site:facebook.com")
        queries.append(f"{base_query} site:instagram.com")

        # 5. Top Directory footprints
        for directory in country_info['directories'][:2]:
            queries.append(f"{base_query} site:{directory}")

        return list(dict.fromkeys(queries))

    async def fetch_website_deep_contacts(self, url: str, client: httpx.AsyncClient, country: str) -> Dict[str, Any]:
        """
        Asynchronously fetch target website contact page to extract verified phone numbers,
        emails, and exact location addresses.
        """
        result = {'phones': [], 'emails': [], 'address': None}
        if not url or any(ign in url.lower() for ign in ['facebook.com', 'instagram.com', 'twitter.com', 'linkedin.com', 'youtube.com', 'tiktok.com', 'wikipedia.org', 'scribd.com', 'pinterest.com']):
            return result

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }

        try:
            resp = await client.get(url, headers=headers, timeout=3.5, follow_redirects=True)
            if resp.status_code == 200:
                text = resp.text
                phone = self.extract_and_format_phone(text, country)
                if phone:
                    result['phones'].append(phone)
                result['emails'].extend(self.extract_emails(text))
                
                soup = BeautifulSoup(text[:100000], 'html.parser')
                for tag in soup.find_all(['address', 'p', 'div', 'span'], class_=re.compile(r'address|location|contact', re.I)):
                    addr_text = tag.get_text(separator=' ', strip=True)
                    if len(addr_text) > 15 and len(addr_text) < 120 and re.search(r'\d+', addr_text):
                        result['address'] = addr_text
                        break
        except Exception:
            pass

        return result

    async def check_whatsapp_status(self, phone: str, client: httpx.AsyncClient) -> Tuple[bool, Optional[str]]:
        """Check if phone number is active on WhatsApp via Baileys engine."""
        try:
            clean_num = re.sub(r'\D', '', str(phone))
            if not clean_num or len(clean_num) < 7:
                return False, None
            resp = await client.get(f"{self.wa_engine_url}/check-contact", params={"phone": clean_num}, timeout=3.0)
            if resp.status_code == 200:
                data = resp.json()
                return bool(data.get('exists', False)), data.get('profilePictureUrl') or data.get('profilePicUrl')
        except Exception:
            pass
        return False, None

    async def search_and_generate_leads(
        self,
        query: str,
        country: str = 'GLOBAL',
        limit: int = 50,
        only_whatsapp: bool = False,
        category: Optional[str] = None,
        exclude_existing: bool = True
    ) -> List[Dict[str, Any]]:
        """
        High-Performance Concurrent Worldwide Lead Generation Pipeline.
        """
        country_info = COUNTRY_METADATA.get(country, COUNTRY_METADATA['GLOBAL'])
        country_name = country_info['name']
        lead_category = category or query.title()

        # Existing phone numbers set if excluding existing
        existing_phones: Set[str] = set()
        if exclude_existing:
            try:
                from crm_core.models import Lead
                existing_phones = set(Lead.objects.values_list('phone', flat=True))
            except Exception:
                pass

        search_queries = self.generate_worldwide_search_queries(query, country)
        collected_items = []
        seen_urls: Set[str] = set()

        async with httpx.AsyncClient(timeout=10.0) as client:
            # 1. Fetch search engine results concurrently
            async def _fetch_sq(sq: str):
                try:
                    params = {
                        'q': sq,
                        'format': 'json',
                        'engines': SEARXNG_ENGINES,
                    }
                    if country != 'GLOBAL' and country_info.get('iso'):
                        params['country'] = country_info['iso']
                    resp = await client.get(f"{self.searxng_url}/search", params=params, timeout=5.0)
                    if resp.status_code == 200:
                        return resp.json().get('results', [])
                except Exception as e:
                    logger.warning(f"SearXNG query '{sq}' failed: {e}")
                return []

            # Run top search queries simultaneously for max speed
            nested_results = await asyncio.gather(*[_fetch_sq(sq) for sq in search_queries[:8]])
            for res_list in nested_results:
                for item in res_list:
                    u = item.get('url', '')
                    if u and u not in seen_urls:
                        seen_urls.add(u)
                        collected_items.append(item)

            # 2. Extract candidate businesses
            candidates = []
            seen_phones: Set[str] = set()
            seen_names: Set[str] = set()

            for item in collected_items:
                title = item.get('title', '')
                content = item.get('content', '') or ''
                url = item.get('url', '')
                combined_text = f"{title} {content} {url}"

                phone = self.extract_and_format_phone(combined_text, country)
                emails = self.extract_emails(combined_text)
                address = None

                # Deep scraping for candidate URLs only if candidates are low
                if not phone and len(candidates) < limit * 2 and url and not any(ign in url.lower() for ign in ['facebook.com', 'instagram.com', 'youtube.com', 'tiktok.com', 'wikipedia.org', 'linkedin.com', 'pinterest.com', 'x.com']):
                    try:
                        deep = await asyncio.wait_for(self.fetch_website_deep_contacts(url, client, country), timeout=2.0)
                        if deep.get('phones'):
                            phone = deep['phones'][0]
                        if deep.get('emails'):
                            emails.extend(deep['emails'])
                        if deep.get('address'):
                            address = deep['address']
                    except Exception:
                        pass

                if not phone:
                    continue

                if phone in seen_phones or phone in existing_phones:
                    continue
                seen_phones.add(phone)

                shop_name = self.clean_business_name(title)
                if not shop_name or shop_name.lower() in seen_names:
                    continue
                seen_names.add(shop_name.lower())

                has_wa_link = bool(re.search(r'wa\.me/|whatsapp\.com|api\.whatsapp', combined_text, re.I))
                candidates.append({
                    'shop_name': shop_name,
                    'phone': phone,
                    'emails': emails,
                    'address': address,
                    'url': url,
                    'has_wa_link': has_wa_link,
                    'content': content
                })

            # 3. Parallel WhatsApp verification for candidate leads
            async def _verify_candidate(c: dict):
                is_on_wa = c['has_wa_link']
                wa_pic = None
                try:
                    engine_wa, engine_pic = await self.check_whatsapp_status(c['phone'], client)
                    if engine_wa:
                        is_on_wa = True
                    if engine_pic:
                        wa_pic = engine_pic
                except Exception:
                    pass
                return c, is_on_wa, wa_pic

            verified_tuples = await asyncio.gather(*[_verify_candidate(c) for c in candidates[:limit * 2]])

            leads: List[Dict[str, Any]] = []
            for c, is_on_wa, wa_pic in verified_tuples:
                if only_whatsapp and not is_on_wa:
                    continue

                url = c['url']
                shop_name = c['shop_name']
                phone = c['phone']
                emails = c['emails']
                address = c['address']

                # Domain favicon fallback
                domain = ""
                try:
                    parsed = urlparse(url)
                    domain = parsed.netloc.replace('www.', '')
                except Exception:
                    pass

                profile_pic = wa_pic or (f"https://www.google.com/s2/favicons?domain={domain}&sz=128" if domain else "")
                if not address:
                    address = f"{lead_category}, {country_name}" if country != 'GLOBAL' else lead_category

                google_maps_url = f"https://www.google.com/maps/search/?api=1&query={quote_plus(shop_name + ' ' + address)}"
                facebook_url = url if 'facebook.com' in url else None
                lead_id = hashlib.md5(f"{phone}_{shop_name}".encode()).hexdigest()[:12]

                leads.append({
                    'id': lead_id,
                    'shop_name': shop_name,
                    'phone': phone,
                    'email': emails[0] if emails else '',
                    'website': url,
                    'facebook_url': facebook_url,
                    'google_maps_url': google_maps_url,
                    'address': address,
                    'category': lead_category,
                    'is_on_whatsapp': is_on_wa,
                    'whatsapp_profile_pic': wa_pic,
                    'profile_picture_url': profile_pic,
                    'already_in_crm': phone in existing_phones,
                    'scraped_source': 'Concurrent Multi-Engine Search',
                })

                if len(leads) >= limit:
                    break

            return leads
