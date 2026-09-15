import re
import urllib.parse
import httpx
from typing import Dict, Any, List, Optional

# Predefined standard categories
CATEGORY_KEYWORDS = {
    'Fashion & Clothing': ['fashion', 'cloth', 'garments', 'boutique', 'tailor', 'wear', 'textile', 'পোশাক', 'বস্ত্র', 'ফ্যাশন', 'বুটিক'],
    'Mobile & Telecom': ['telecom', 'mobile', 'servicing', 'recharge', 'gadget', 'accessories', 'টেলিকম', 'মোবাইল', 'গ্যাজেট'],
    'Electronics & IT': ['electronics', 'computer', 'laptop', 'tech', 'hardware', 'ইলেকট্রনিক্স', 'কম্পিউটার'],
    'Supershop & Grocery': ['grocery', 'super shop', 'mart', 'store', 'general store', 'দোকান', 'মুদি', 'সুপারশপ', 'ভ্যারাইটিজ'],
    'Pharmacy & Health': ['pharmacy', 'pharma', 'medical', 'medicine', 'drug', 'ফার্মেসি', 'মেডিকেল', 'ঔষধ'],
    'Cosmetics & Beauty': ['cosmetics', 'beauty', 'parlour', 'salon', 'কসমেটিকস', 'বিউটি'],
    'Automobile & Bikes': ['auto', 'motors', 'parts', 'workshop', 'bike', 'মটরস', 'অটো'],
    'Restaurant & Food': ['restaurant', 'cafe', 'hotel', 'food', 'bakery', 'kitchen', 'রেস্টুরেন্ট', 'ক্যাফে', 'বেকারি', 'হোটেল'],
    'Footwear': ['shoes', 'footwear', 'leather', 'জুতা', 'লেদার'],
    'Hardware & Sanitary': ['sanitary', 'hardware', 'paint', 'tiles', 'স্যানিটারি', 'হার্ডওয়্যার', 'রং', 'টাইলস'],
    'Wholesale & Trade': ['enterprise', 'traders', 'trade', 'wholesale', 'পাইকারি', 'এন্টারপ্রাইজ', 'ট্রেডার্স'],
}

SHOP_TYPE_KEYWORDS = {
    'Wholesale': ['wholesale', 'wholesaler', 'পাইকারি', 'ডিলার', 'dealer', 'distributor'],
    'Online Store': ['online shop', 'e-commerce', 'facebook page', 'online order', 'অনলাইন শপ'],
    'Service Center': ['servicing', 'repair', 'service center', 'সার্ভিসিং', 'মেরামত'],
    'Distributor': ['distributor', 'agency', 'এজেন্সি', 'ডিস্ট্রিবিউটর'],
    'Corporate': ['ltd', 'limited', 'corporation', 'corp', 'company'],
    'Retail': ['retail', 'shop', 'store', 'দোকান', 'আউটলেট', 'outlet', 'showroom']
}

DISTRICTS = [
    'Dhaka', 'Chittagong', 'Chattogram', 'Sylhet', 'Rajshahi', 'Khulna', 'Barisal', 'Rangpur',
    'Mymensingh', 'Comilla', 'Cumilla', 'Gazipur', 'Narayanganj', 'Bogura', 'Bogra', 'Jessore',
    'Jashore', 'Tangail', 'Narsingdi', 'Faridpur', 'Pabna', 'Dinajpur', 'Kushtia', 'Cox\'s Bazar',
    'Feni', 'Noakhali', 'Brahmanbaria', 'Jamalpur', 'Sirajganj', 'Naogaon', 'Natore', 'Gopalganj',
    'ঢাকা', 'চট্টগ্রাম', 'সিলেট', 'রাজশাহী', 'খুলনা', 'বরিশাল', 'রংপুর', 'ময়মনসিংহ', 'কুমিল্লা',
    'গাজীপুর', 'নারায়ণগঞ্জ', 'বগুড়া', 'যশোর', 'টাঙ্গাইল', 'নরসিংদী', 'ফরিদপুর', 'পাবনা', 'দিনাজপুর'
]


def clean_phone_number(raw_phone: str) -> tuple[str, str]:
    """Returns (local_format e.g. 018..., intl_format e.g. 88018...)"""
    digits = re.sub(r'\D', '', str(raw_phone))
    if digits.startswith('880') and len(digits) >= 13:
        local = digits[2:]
        intl = digits
    elif digits.startswith('88') and len(digits) >= 12:
        local = '0' + digits[2:]
        intl = digits
    elif digits.startswith('01') and len(digits) == 11:
        local = digits
        intl = '88' + digits
    else:
        local = digits
        intl = digits
    return local, intl


async def search_duckduckgo_osint(query: str, client: httpx.AsyncClient) -> List[Dict[str, str]]:
    """Fetches search snippets from DuckDuckGo HTML endpoint without requiring API keys."""
    results = []
    try:
        url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,bn;q=0.8",
        }
        resp = await client.get(url, headers=headers, timeout=6.0)
        if resp.status_code == 200:
            html = resp.text
            # Extract links and snippets via regex
            matches = re.findall(
                r'<a class="result__snippet[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
                html,
                re.DOTALL
            )
            title_matches = re.findall(
                r'<a class="result__url"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
                html,
                re.DOTALL
            )
            raw_snippets = re.findall(
                r'<a class="result__snippet[^"]*"[^>]*>(.*?)</a>',
                html,
                re.DOTALL
            )
            for s in raw_snippets[:8]:
                clean_s = re.sub(r'<[^>]+>', '', s).strip()
                # Exclude adult/spam keywords
                if clean_s and not re.search(r'(xxx|porn|erotic|sex|adult|casino|betting)', clean_s, re.IGNORECASE):
                    results.append({"snippet": clean_s})
    except Exception as e:
        pass
    return results


async def search_bing_osint(query: str, client: httpx.AsyncClient) -> List[Dict[str, str]]:
    """Fallback search using Bing Lite."""
    results = []
    try:
        url = f"https://www.bing.com/search?q={urllib.parse.quote(query)}"
        headers = {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        resp = await client.get(url, headers=headers, timeout=6.0)
        if resp.status_code == 200:
            html = resp.text
            # Extract title and snippets
            snippets = re.findall(r'<p class="b_lineclamp[^>]*>(.*?)</p>', html, re.DOTALL)
            for s in snippets[:6]:
                clean_s = re.sub(r'<[^>]+>', '', s).strip()
                if clean_s:
                    results.append({"snippet": clean_s})
    except Exception:
        pass
    return results


def extract_entities_from_text(all_text: str, phone: str) -> Dict[str, Any]:
    """Heuristic / NLP parser to extract shop name, owner name, address, category, and shop type."""
    detected_shop_name = None
    detected_owner_name = None
    detected_address = None
    detected_category = 'General'
    detected_shop_type = 'Retail'
    notes_list = []

    # 1. Clean and split sentences
    lines = [l.strip() for l in re.split(r'[\n\r\|\•\-\–]', all_text) if len(l.strip()) > 3]

    # 2. Look for Facebook page titles / Shop titles e.g. "Abc Fashion - Home", "M/S Rahim Traders"
    shop_patterns = [
        r'(?:M/S|মেসার্স|M/s)\s+([A-Za-z0-9\s\u0980-\u09FF\.\'\&]+(?:Traders|Enterprise|Store|Telecom|Fashion|Electronics|টেক|টেলিকম|এন্টারপ্রাইজ|ট্রেডার্স|দোকান|মার্ট))',
        r'([A-Za-z0-9\s\u0980-\u09FF\.\'\&]+(?:Fashion|Telecom|Electronics|Enterprise|Traders|Store|Super Shop|Mart|Pharmacy|Jewellers|Cloth Store|Motors|Restaurant|Bakery|টেলিকম|ফ্যাশন|ইলেকট্রনিক্স|ফার্মেসি|ট্রেডার্স|এন্টারপ্রাইজ))',
        r'([A-Za-z0-9\s\u0980-\u09FF\.\'\&]+)\s*\|\s*Facebook',
        r'([A-Za-z0-9\s\u0980-\u09FF\.\'\&]+)\s*\-\s*Home\s*\|\s*Facebook',
    ]

    for pat in shop_patterns:
        match = re.search(pat, all_text, re.IGNORECASE)
        if match:
            candidate = match.group(1).strip()
            # Clean up candidate
            candidate = re.sub(r'^(about|welcome to|visit|contact)\s+', '', candidate, flags=re.IGNORECASE)
            candidate = re.sub(r'\s+(home|facebook|reviews|photos)$', '', candidate, flags=re.IGNORECASE)
            if 3 < len(candidate) < 60 and not candidate.isdigit():
                detected_shop_name = candidate
                break

    # 3. Look for Owner Name e.g. "Proprietor: Md. ...", "Pro: ...", "স্বত্বাধিকারী: ..."
    owner_patterns = [
        r'(?:Proprietor|Prop|Pro|Owner|স্বত্বাধিকারী|প্রোপাইটার|পরিচালক|মালিক)\s*[:\-\.]\s*([A-Za-z\.\s\u0980-\u09FF]{3,35})',
        r'(?:Md\.|Mohammad|Al\-Haj|মুহাম্মদ|মোহাম্মদ|মোঃ)\s+([A-Za-z\s\u0980-\u09FF]{3,30})',
    ]

    for pat in owner_patterns:
        match = re.search(pat, all_text, re.IGNORECASE)
        if match:
            candidate = match.group(1).strip() if match.lastindex == 1 else match.group(0).strip()
            candidate = re.sub(r'[\,\.\:\;].*', '', candidate).strip()
            if 3 < len(candidate) < 40 and not re.search(r'(phone|call|facebook|shop|market|store)', candidate, re.I):
                detected_owner_name = candidate
                break

    # 4. Look for Address / Location clues
    address_parts = []
    for district in DISTRICTS:
        if re.search(r'\b' + re.escape(district) + r'\b', all_text, re.IGNORECASE):
            address_parts.append(district)
            break

    # Look for market / road patterns
    loc_match = re.search(
        r'([A-Za-z0-9\s\u0980-\u09FF\,\.\-\#]+(?:Market|Plaza|Tower|Complex|Shopping Mall|Bazar|Road|Floor|Shop|মার্কেট|প্লাজা|টাওয়ার|বাজার|রোড|দোকান|শপিং মল)[A-Za-z0-9\s\u0980-\u09FF\,\.\-]*)',
        all_text,
        re.IGNORECASE
    )
    if loc_match:
        loc_str = loc_match.group(1).strip()
        loc_str = re.sub(r'\s+', ' ', loc_str)
        if 5 < len(loc_str) < 80:
            detected_address = loc_str

    if not detected_address and address_parts:
        detected_address = address_parts[0] + ', Bangladesh'
    elif detected_address and address_parts and address_parts[0].lower() not in detected_address.lower():
        detected_address += f", {address_parts[0]}"

    # 5. Detect Category
    lower_text = all_text.lower()
    for cat_name, kws in CATEGORY_KEYWORDS.items():
        if any(kw.lower() in lower_text for kw in kws):
            detected_category = cat_name
            break

    # 6. Detect Shop Type
    for st_name, kws in SHOP_TYPE_KEYWORDS.items():
        if any(kw.lower() in lower_text for kw in kws):
            detected_shop_type = st_name
            break

    return {
        "detected_shop_name": detected_shop_name,
        "detected_owner_name": detected_owner_name,
        "detected_address": detected_address,
        "detected_category": detected_category,
        "detected_shop_type": detected_shop_type,
    }


async def enrich_phone_intelligence(phone: str, whatsapp_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Main orchestration engine:
    1. Reads WhatsApp Engine details (Profile, Verified Business info, About, Picture)
    2. Runs Web OSINT queries on DuckDuckGo and Bing for the phone
    3. Runs AI / NLP heuristics to extract all business parameters
    4. Merges signals into a structured, high-accuracy response
    """
    local_phone, intl_phone = clean_phone_number(phone)
    sources = []

    # Data placeholders
    shop_name = ""
    owner_name = ""
    category = "General"
    shop_type = "Retail"
    address = ""
    notes = ""
    profile_pic = None
    whatsapp_about = None
    is_on_whatsapp = False

    # --- Step 1: Process WhatsApp Profile & Business Info ---
    if whatsapp_data and whatsapp_data.get('exists'):
        is_on_whatsapp = True
        sources.append("WhatsApp Profile")

        wa_name = whatsapp_data.get('name') or whatsapp_data.get('pushName')
        if wa_name:
            owner_name = wa_name

        if whatsapp_data.get('profilePictureUrl'):
            profile_pic = whatsapp_data['profilePictureUrl']

        if whatsapp_data.get('about'):
            whatsapp_about = whatsapp_data['about']
            notes = f"WhatsApp About: {whatsapp_about}"

        # Business Profile from WhatsApp IQ
        biz = whatsapp_data.get('businessProfile')
        if biz and isinstance(biz, dict):
            sources.append("WhatsApp Business Profile")
            if biz.get('description'):
                notes = (notes + "\n" + biz['description']).strip()
            if biz.get('address'):
                address = biz['address']
            if biz.get('category'):
                category = biz['category']
            if biz.get('business_name'):
                shop_name = biz['business_name']

    # --- Step 2: Web Intelligence Search ---
    queries = [
        f'"{local_phone}" OR "{intl_phone}"',
        f'"{local_phone}" shop OR facebook OR দোকান OR "Google Maps"'
    ]

    all_snippets = []
    async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
        for q in queries:
            try:
                res_ddg = await search_duckduckgo_osint(q, client)
                for r in res_ddg:
                    all_snippets.append(r.get('snippet', ''))
                if not all_snippets:
                    res_bing = await search_bing_osint(q, client)
                    for r in res_bing:
                        all_snippets.append(r.get('snippet', ''))
            except Exception:
                pass

    if all_snippets:
        sources.append("Google / Web OSINT")

    combined_web_text = " ".join(all_snippets)

    # --- Step 3: Extract Entities via NLP / Heuristics ---
    extracted = extract_entities_from_text(combined_web_text, local_phone)

    # Merge intelligence with priority:
    # Shop Name: WhatsApp Business Name > Web Detected Shop Name > WhatsApp Profile PushName
    if not shop_name:
        if extracted.get('detected_shop_name'):
            shop_name = extracted['detected_shop_name']
        elif owner_name:
            shop_name = owner_name

    # Owner Name: WhatsApp PushName > Web Detected Owner Name
    if not owner_name and extracted.get('detected_owner_name'):
        owner_name = extracted['detected_owner_name']

    # Address: WhatsApp Business Address > Web Detected Address
    if not address and extracted.get('detected_address'):
        address = extracted['detected_address']

    # Category: WhatsApp Business Category > Web Detected Category
    if category == 'General' and extracted.get('detected_category'):
        category = extracted['detected_category']

    # Shop Type: Web Detected Shop Type
    if extracted.get('detected_shop_type'):
        shop_type = extracted['detected_shop_type']

    if all_snippets and not notes:
        # Include a preview snippet in notes
        sample_snippet = all_snippets[0][:150]
        notes = f"Web Info: {sample_snippet}"

    # If shop_name is still empty, fallback to phone
    if not shop_name:
        shop_name = f"Shop {local_phone}"

    return {
        "phone": local_phone,
        "is_on_whatsapp": is_on_whatsapp,
        "shop_name": shop_name,
        "owner_name": owner_name,
        "category": category,
        "shop_type": shop_type,
        "address": address,
        "notes": notes,
        "profile_picture_url": profile_pic,
        "whatsapp_about": whatsapp_about,
        "sources_found": sources,
        "confidence": "high" if len(sources) >= 2 else "medium" if len(sources) == 1 else "low"
    }
