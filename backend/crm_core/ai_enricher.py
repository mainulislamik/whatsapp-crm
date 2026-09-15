import re
import html
import httpx
import urllib.parse
from typing import Dict, Any, List, Optional

# Bangladesh Districts (English & Bengali)
BD_DISTRICTS_MAP = {
    "dhaka": "Dhaka", "ঢাকা": "Dhaka",
    "chattogram": "Chattogram", "chittagong": "Chattogram", "চট্টগ্রাম": "Chattogram",
    "chandpur": "Chandpur", "চাঁদপুর": "Chandpur",
    "sylhet": "Sylhet", "সিলেট": "Sylhet",
    "rajshahi": "Rajshahi", "রাজশাহী": "Rajshahi",
    "khulna": "Khulna", "খুলনা": "Khulna",
    "barishal": "Barishal", "barisal": "Barishal", "বরিশাল": "Barishal",
    "rangpur": "Rangpur", "রংপুর": "Rangpur",
    "mymensingh": "Mymensingh", "ময়মনসিংহ": "Mymensingh",
    "gazipur": "Gazipur", "গাজীপুর": "Gazipur",
    "narayanganj": "Narayanganj", "নারায়ণগঞ্জ": "Narayanganj",
    "cumilla": "Cumilla", "comilla": "Cumilla", "কুমিল্লা": "Cumilla",
    "bogra": "Bogura", "bogura": "Bogura", "বগুড়া": "Bogura",
    "jessore": "Jashore", "jashore": "Jashore", "যশোর": "Jashore",
    "cox's bazar": "Cox's Bazar", "coxsbazar": "Cox's Bazar", "কক্সবাজার": "Cox's Bazar",
    "tangail": "Tangail", "টাঙ্গাইল": "Tangail",
    "narsingdi": "Narsingdi", "নরসিংদী": "Narsingdi",
    "feni": "Feni", "ফেনী": "Feni",
    "noakhali": "Noakhali", "নোয়াখালী": "Noakhali",
    "brahmanbaria": "Brahmanbaria", "ব্রাহ্মণবাড়িয়া": "Brahmanbaria",
    "kushtia": "Kushtia", "কুষ্টিয়া": "Kushtia",
    "pabna": "Pabna", "পাবনা": "Pabna",
    "dinajpur": "Dinajpur", "দিনাজপুর": "Dinajpur",
    "jamalpur": "Jamalpur", "জামালপুর": "Jamalpur",
    "sirajganj": "Sirajganj", "সিরাজগঞ্জ": "Sirajganj",
    "faridpur": "Faridpur", "ফরিদপুর": "Faridpur",
    "manikganj": "Manikganj", "মানিকগঞ্জ": "Manikganj",
    "munshiganj": "Munshiganj", "মুন্সীগঞ্জ": "Munshiganj",
    "madaripur": "Madaripur", "মাদারীপুর": "Madaripur",
    "gopalganj": "Gopalganj", "গোপালগঞ্জ": "Gopalganj",
    "lakshmipur": "Lakshmipur", "লক্ষ্মীপুর": "Lakshmipur",
    "habiganj": "Habiganj", "হবিগঞ্জ": "Habiganj",
    "moulvibazar": "Moulvibazar", "মৌলভীবাজার": "Moulvibazar",
    "sunamganj": "Sunamganj", "সুনামগঞ্জ": "Sunamganj",
    "netrokona": "Netrokona", "নেত্রকোণা": "Netrokona",
    "sherpur": "Sherpur", "শেরপুর": "Sherpur",
    "kishoreganj": "Kishoreganj", "কিশোরগঞ্জ": "Kishoreganj",
    "kurigram": "Kurigram", "কুড়িগ্রাম": "Kurigram",
    "gaibandha": "Gaibandha", "গাইবান্ধা": "Gaibandha",
    "lalmonirhat": "Lalmonirhat", "লালমনিরহাট": "Lalmonirhat",
    "nilphamari": "Nilphamari", "নীলফামারী": "Nilphamari",
    "panchagarh": "Panchagarh", "পঞ্চগড়": "Panchagarh",
    "thakurgaon": "Thakurgaon", "ঠাকুরগাঁও": "Thakurgaon",
    "naogaon": "Naogaon", "নওগাঁ": "Naogaon",
    "natore": "Natore", "নাটোর": "Natore",
    "chapainawabganj": "Chapainawabganj", "চাঁপাইনবাবগঞ্জ": "Chapainawabganj",
    "joypurhat": "Joypurhat", "জয়পুরহাট": "Joypurhat",
    "satkhira": "Satkhira", "সাতক্ষীরা": "Satkhira",
    "bagerhat": "Bagerhat", "বাগেরহাট": "Bagerhat",
    "jhenaidah": "Jhenaidah", "ঝিনাইদহ": "Jhenaidah",
    "magura": "Magura", "মাগুরা": "Magura",
    "narail": "Narail", "নড়াইল": "Narail",
    "chuadanga": "Chuadanga", "চুয়াডাঙ্গা": "Chuadanga",
    "meherpur": "Meherpur", "মেহেরপুর": "Meherpur",
    "patuakhali": "Patuakhali", "পটুয়াখালী": "Patuakhali",
    "bhola": "Bhola", "ভোলা": "Bhola",
    "pirojpur": "Pirojpur", "পিরোজপুর": "Pirojpur",
    "jhalokati": "Jhalokati", "ঝালকাঠি": "Jhalokati",
    "barguna": "Barguna", "বরগুনা": "Barguna",
    "bandarban": "Bandarban", "বান্দরবান": "Bandarban",
    "khagrachhari": "Khagrachhari", "খাগড়াছড়ি": "Khagrachhari",
    "rangamati": "Rangamati", "রাঙ্গামাটি": "Rangamati"
}

# Dhaka Areas
DHAKA_AREAS_MAP = {
    "dhanmondi": "Dhanmondi", "ধানমন্ডি": "Dhanmondi",
    "gulshan": "Gulshan", "গুলশান": "Gulshan",
    "banani": "Banani", "বনানী": "Banani",
    "uttara": "Uttara", "উত্তরা": "Uttara",
    "mirpur": "Mirpur", "মিরপুর": "Mirpur",
    "mohakhali": "Mohakhali", "মহাখালী": "Mohakhali",
    "motijheel": "Motijheel", "মতিঝিল": "Motijheel",
    "badda": "Badda", "বাড্ডা": "Badda",
    "rampura": "Rampura", "রামপুরা": "Rampura",
    "malibagh": "Malibagh", "মালিবাগ": "Malibagh",
    "moghbazar": "Moghbazar", "মগবাজার": "Moghbazar",
    "shantinagar": "Shantinagar", "শান্তিনগর": "Shantinagar",
    "khilgaon": "Khilgaon", "খিলগাঁও": "Khilgaon",
    "basabo": "Basabo", "বাসাবো": "Basabo",
    "jatrabari": "Jatrabari", "যাত্রাবাড়ী": "Jatrabari",
    "lalbagh": "Lalbagh", "লালবাগ": "Lalbagh",
    "chawkbazar": "Chawkbazar", "চকবাজার": "Chawkbazar",
    "elephant road": "Elephant Road", "এলিফ্যান্ট রোড": "Elephant Road",
    "new market": "New Market", "নিউ মার্কেট": "New Market",
    "farmgate": "Farmgate", "ফার্মগেট": "Farmgate",
    "tejgaon": "Tejgaon", "তেজগাঁও": "Tejgaon",
    "panthapath": "Panthapath", "পান্থপথ": "Panthapath",
    "green road": "Green Road", "গ্রিন রোড": "Green Road",
    "pallabi": "Pallabi", "পল্লবী": "Pallabi",
    "kazipara": "Kazipara", "কাজী Formulas": "Kazipara",
    "shewrapara": "Shewrapara", "শেওড়াপাড়া": "Shewrapara",
    "mohammadpur": "Mohammadpur", "মোহাম্মদপুর": "Mohammadpur",
    "adabor": "Adabor", "আদাবর": "Adabor",
    "shyamoli": "Shyamoli", "শ্যামলী": "Shyamoli",
    "kalyanpur": "Kalyanpur", "কল্যাণপুর": "Kalyanpur",
    "savar": "Savar", "সাভার": "Savar",
    "ashulia": "Ashulia", "আশুলিয়া": "Ashulia",
    "tongi": "Tongi", "টঙ্গী": "Tongi",
    "wari": "Wari", "ওয়ারী": "Wari"
}

BUSINESS_KEYWORDS = [
    # English
    "shop", "store", "enterprise", "electronics", "fashion", "traders", "telecom",
    "boutique", "corner", "pharmacy", "restaurant", "gallery", "mart", "point",
    "supermarket", "jewellers", "tailors", "motors", "hardware", "agency", "foods",
    "cafe", "plaza", "centre", "center", "collection", "garments", "bakery",
    "bazar", "market", "optics", "diagnostic", "hospital", "cloth", "shoe",
    "footwear", "furniture", "cosmetics", "parlour", "salon", "agro", "poultry",
    "feed", "variety", "general", "supply", "distributor", "ltd", "fish", "ilish",
    # Bengali
    "দোকান", "শপ", "স্টোর", "মার্কেট", "বাজার", "বাজারের", "শোরুম", "এন্টারপ্রাইজ", "ট্রেডার্স", "ট্রেডিং",
    "ফ্যাশন", "গার্মেন্টস", "ফার্মেসি", "ফার্মা", "মিষ্টান্ন", "হোটেল", "রেস্তোরাঁ", "রেস্টুরেন্ট",
    "বেকারি", "কনফেকশনারি", "টেইলার্স", "জুয়েলার্স", "জুয়েলার্স", "টেলিকম", "ইলেকট্রনিক্স", "ইলেকট্রনিক",
    "মটরস", "মোটরস", "পোল্ট্রি", "ফিড", "ডিস্ট্রিবিউটর", "এজেন্সি", "লাইব্রেরি", "হাসপাতাল",
    "ক্লিনিক", "বুটিক", "কালেকশন", "সুপারশপ", "সুপারমার্কেট", "ইলিশ", "মাছ", "মৎস্য", "ডিপার্টমেন্টাল"
]

PERSON_KEYWORDS = [
    # English
    "md", "md.", "mohammad", "muhammad", "khan", "ahmed", "hossain", "hossen", "islam",
    "chowdhury", "rahman", "hasan", "hassan", "ali", "touhid", "imon", "akter",
    "begum", "mia", "miah", "talukdar", "sarker", "sheikh", "kazi", "bhuiyan", "uddin",
    "mahmud", "rana", "alam", "shakil", "tanvir", "sohag", "faruk", "kabir", "mollah",
    "sikder", "dewan", "babu", "hashem", "reza", "kamal", "mustafa", "rubel", "sajib",
    # Bengali
    "মো:", "মোঃ", "মোহাম্মদ", "মুহাম্মদ", "খান", "আহমেদ", "আহমেদ", "হোসেন", "হোসাইন",
    "ইসলাম", "চৌধুরী", "রহমান", "হাসান", "আলী", "তৌহিদ", "ইমন", "আক্তার", "বেগম",
    "মিয়া", "মিয়া", "তালুকদার", "সরকার", "শেখ", "কাজী", "ভূঁইয়া", "ভূঁইয়া", "উদ্দিন",
    "মাহমুদ", "রানা", "আলম", "শাকিল", "তানভীর", "সোহাগ", "ফারুক", "কবীর", "মোল্লা",
    "শিকদার", "দেওয়ান", "বাবু", "হাশেম", "রেজা", "কামাল", "রুবেল", "সজীব", "নাসির", "জসিম"
]

CATEGORY_RULES = [
    # Fish, Meat, Grocery & Supermarket
    (["ilish", "fish", "ইলিশ", "মাছ", "মৎস্য", "বাজার", "কাঁচাবাজার", "সুপারশপ", "মুদি", "grocery", "supermarket", "super shop", "departmental", "department store"], "Grocery & Supermarket"),
    # Electronics & Gadgets
    (["electronics", "electronic", "ইলেকট্রনিক", "ইলেকট্রনিক্স", "gadget", "mobile", "মোবাইল", "computer", "কম্পিউটার", "telecom", "টেলিকম", "cctv", "laptop"], "Electronics & Gadgets"),
    # Fashion & Clothing
    (["fashion", "ফ্যাশন", "clothing", "পোশাক", "বস্ত্র", "saree", "শাড়ি", "শাড়ি", "panjabi", "পাঞ্জাবি", "boutique", "বুটিক", "tailor", "টেইলার্স", "shoe", "জুতা", "footwear", "garments", "গার্মেন্টস"], "Fashion & Clothing"),
    # Pharmacy & Healthcare
    (["pharmacy", "ফার্মেসি", "medicine", "ঔষধ", "ওষুধ", "drug", "health", "চিকিৎসা", "diagnostic", "ডায়াগনস্টিক", "dental", "clinic", "hospital", "হাসপাতাল"], "Pharmacy & Healthcare"),
    # Restaurant & Food
    (["restaurant", "রেস্তোরাঁ", "রেস্টুরেন্ট", "হোটেল", "cafe", "ক্যাফে", "food", "খাবার", "bakery", "বেকারি", "biryani", "বিরিয়ানি", "মিষ্টান্ন", "sweet", "juice"], "Restaurant & Food"),
    # Automobile & Hardware
    (["hardware", "হার্ডওয়্যার", "হার্ডওয়্যার", "motor", "মটরস", "মোটরস", "auto", "sanitary", "স্যানিটারি", "paint", "রং", "tools"], "Automobile & Hardware"),
    # Beauty & Personal Care
    (["cosmetics", "কসমেটিকস", "beauty", "সৌন্দর্য", "parlour", "পার্লার", "salon", "সেলুন", "skincare", "makeup"], "Beauty & Personal Care"),
    # Jewelry & Watch
    (["jeweller", "জুয়েলার্স", "জুয়েলার্স", "gold", "স্বর্ণ", "সোনার", "diamond", "ডায়মন্ড", "watch", "ঘড়ি", "optics", "চশমা"], "Jewelry & Watch"),
    # Furniture & Home Decor
    (["furniture", "ফার্নিচার", "interior", "ইন্টেরিয়র", "curtain", "পর্দা", "tiles", "টাইলস"], "Furniture & Home Decor"),
    # Agriculture & Agro
    (["agro", "এগ্রো", "poultry", "পোল্ট্রি", "feed", "ফিড", "fisheries", "fertilizer", "সার", "বীজ"], "Agriculture & Agro"),
    # Wholesale & Distribution
    (["enterprise", "এন্টারপ্রাইজ", "traders", "ট্রেডার্স", "trading", "ট্রেডিং", "distributor", "ডিস্ট্রিবিউটর", "importer", "আমদানিকারক", "agency", "এজেন্সি"], "Wholesale & Distribution")
]

def is_foreign_or_spam(text: str) -> bool:
    """Detect non-BD foreign language or spam characters (Chinese, Japanese, Korean, Cyrillic, Arabic)."""
    if not text:
        return False
    # Check for CJK characters
    if re.search(r'[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff]', text):
        return True
    lower = text.lower()
    spam_markers = [
        "alibaba", "aliexpress", "made-in-china", "taobao", "jd.com", "shopee", "lazada",
        "free download", "xml version", "register to use smart", "login", "sign up", "sign in",
        "404 not found", "cloudflare", "captcha", "lorem ipsum", "pornhub", "casino"
    ]
    return any(marker in lower for marker in spam_markers)

def is_business_name(name: str) -> bool:
    """Check if a string is a business/shop name."""
    if not name:
        return False
    lower = name.lower()
    # Check if any business keyword is in the name
    for kw in BUSINESS_KEYWORDS:
        if kw in lower:
            return True
    return False

def is_person_name(name: str) -> bool:
    """Determine if a string looks like a person's name rather than a business name."""
    if not name:
        return False
    if is_business_name(name):
        return False
    lower = name.lower()
    for kw in PERSON_KEYWORDS:
        if kw in lower:
            return True
    # If standard 2-3 words without business keywords
    words = name.split()
    return 1 <= len(words) <= 3 and not is_business_name(name)

def clean_name(raw_name: str) -> str:
    """Clean name by stripping web suffixes, pipes, and boilerplate."""
    if not raw_name or is_foreign_or_spam(raw_name):
        return ""
    
    cleaned = raw_name
    patterns = [
        r'\s*\|\s*Facebook.*$',
        r'\s*-\s*Home\s*\|\s*Facebook.*$',
        r'\s*-\s*About\s*\|\s*Facebook.*$',
        r'\s*-\s*Posts\s*\|\s*Facebook.*$',
        r'\s*-\s*Local Business.*$',
        r'\s*-\s*Product/Service.*$',
        r'\s*-\s*Shopping & Retail.*$',
        r'\s*-\s*Clothing \(Brand\).*$',
        r'\s*-\s*E-commerce.*$',
        r'\s*-\s*Commercial & Industrial.*$',
        r'\s*-\s*Apparel & Clothing.*$',
        r'\s*-\s*Wholesale & Supply.*$',
        r'\s*-\s*Facebook.*$',
        r'\s*\|\s*Facebook.*$',
        r'\s*-\s*WorldPlaces.*$',
        r'\s*-\s*YouTube.*$',
        r'\s*-\s*Bikroy\.com.*$',
    ]
    for p in patterns:
        cleaned = re.sub(p, '', cleaned, flags=re.IGNORECASE)
    
    cleaned = cleaned.strip(" -|·'\"•,:\n\r\t")
    if len(cleaned) < 2 or len(cleaned) > 70:
        return ""
    
    lower = cleaned.lower()
    if lower in ["contact us", "contact", "home", "about us", "login", "sign in", "welcome", "page not found", "register to use smart"]:
        return ""
        
    return cleaned

def map_category(text_corpus: str) -> str:
    """Determine best category based on text corpus."""
    if not text_corpus:
        return "General"
    lower = text_corpus.lower()
    for keywords, category in CATEGORY_RULES:
        for kw in keywords:
            if kw in lower:
                return category
    return "General"

def extract_bd_address(text_corpus: str) -> str:
    """Extract clean Bangladeshi address hierarchy from text corpus (English and Bengali)."""
    if not text_corpus or is_foreign_or_spam(text_corpus):
        return ""
        
    found_area = None
    found_district = None
    
    # Check Dhaka sub-areas
    for kw, area_name in DHAKA_AREAS_MAP.items():
        if kw in text_corpus.lower():
            found_area = area_name
            found_district = "Dhaka"
            break
            
    # Check Districts
    if not found_district:
        for kw, dist_name in BD_DISTRICTS_MAP.items():
            if kw in text_corpus.lower():
                found_district = dist_name
                break
                
    if found_area and found_district:
        return f"{found_area}, {found_district}, Bangladesh"
    elif found_district:
        return f"{found_district}, Bangladesh"
    return ""

async def fetch_clean_osint(phone_str: str) -> List[Dict[str, str]]:
    """Fetch clean search results filtering out all non-BD / spam results."""
    digits = re.sub(r'\D', '', phone_str)
    if digits.startswith('880'):
        local_phone = '0' + digits[3:]
    elif digits.startswith('0'):
        local_phone = digits
    else:
        local_phone = '0' + digits
        
    dashed = f"{local_phone[:5]}-{local_phone[5:]}"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    }
    
    queries = [
        f'site:facebook.com "{local_phone}" OR "{dashed}"',
        f'"{local_phone}" OR "{dashed}" "Bangladesh"',
    ]
    
    items = []
    async with httpx.AsyncClient(headers=headers, timeout=5.0) as client:
        for q in queries:
            try:
                r = await client.post('https://html.duckduckgo.com/html/', data={'q': q})
                if r.status_code == 200:
                    raw_blocks = re.findall(r'<div class="result results_links[^"]*"[^>]*>(.*?)</div>\s*</div>\s*</div>', r.text, re.DOTALL)
                    for b in raw_blocks:
                        title_m = re.search(r'<h2 class="result__title">.*?<a[^>]*>(.*?)</a>', b, re.DOTALL)
                        snip_m = re.search(r'<a class="result__snippet"[^>]*>(.*?)</a>', b, re.DOTALL)
                        url_m = re.search(r'<a class="result__url"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', b, re.DOTALL)
                        
                        t = html.unescape(re.sub(r'<[^>]+>', '', title_m.group(1)).strip()) if title_m else ''
                        s = html.unescape(re.sub(r'<[^>]+>', '', snip_m.group(1)).strip()) if snip_m else ''
                        u = url_m.group(1) if url_m else ''
                        
                        # Filter out foreign or spam immediately
                        if not is_foreign_or_spam(t) and not is_foreign_or_spam(s):
                            clean_t = clean_name(t)
                            if clean_t:
                                items.append({'title': clean_t, 'snippet': s, 'url': u})
            except Exception:
                pass
                
    return items

async def enrich_lead(phone_raw: str, wa_data: Optional[Dict[str, Any]] = None, wa_engine_url: str = "http://whatsapp-engine:5001") -> Dict[str, Any]:
    """
    Ultra-accurate Lead Intelligence & Enrichment Engine:
    - Tier-1 Priority: WhatsApp Engine verified Business Profile & Name.
    - Accurate separation of Shop Name vs Contact Person Name.
    - Automatic Bengali/English District & Area detection.
    - Standardized Category & Shop Type detection.
    - Noise-free, professional structured Internal Notes.
    """
    digits = re.sub(r'\D', '', str(phone_raw))
    if digits.startswith('880'):
        normalized = digits
        local_phone = '0' + digits[3:]
    elif digits.startswith('0'):
        normalized = '88' + digits
        local_phone = digits
    else:
        normalized = '880' + digits
        local_phone = '0' + digits

    sources_found = []
    is_on_whatsapp = False
    profile_pic = None
    wa_about = None
    wa_name = None
    wa_biz_profile = None
    
    # 1. Process WhatsApp Engine Data
    if wa_data and wa_data.get("exists"):
        is_on_whatsapp = True
        sources_found.append("WhatsApp Profile")
        profile_pic = wa_data.get("profilePictureUrl")
        wa_about = wa_data.get("about")
        wa_name = clean_name(wa_data.get("name") or wa_data.get("pushName") or "")
        wa_biz_profile = wa_data.get("businessProfile")
        if wa_biz_profile:
            sources_found.append("WhatsApp Business Profile")
    elif not wa_data:
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.get(f"{wa_engine_url}/check-contact", params={"phone": normalized})
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("exists"):
                        is_on_whatsapp = True
                        sources_found.append("WhatsApp Profile")
                        profile_pic = data.get("profilePictureUrl")
                        wa_about = data.get("about")
                        wa_name = clean_name(data.get("name") or data.get("pushName") or "")
                        wa_biz_profile = data.get("businessProfile")
                        if wa_biz_profile:
                            sources_found.append("WhatsApp Business Profile")
        except Exception:
            pass

    detected_shop_name = ""
    detected_owner_name = ""
    detected_category = "General"
    detected_shop_type = "Retail Shop"
    detected_address = ""
    notes_lines = []

    # 2. WhatsApp Name & Business Profile (Tier-1 Ground Truth)
    if wa_name:
        if is_business_name(wa_name):
            detected_shop_name = wa_name
            # Extract location from shop name if present (e.g. 'চাঁদপুর ইলিশের বাজার' -> Chandpur)
            addr_from_name = extract_bd_address(wa_name)
            if addr_from_name:
                detected_address = addr_from_name
            # Detect category from shop name
            detected_category = map_category(wa_name)
        elif is_person_name(wa_name):
            detected_owner_name = wa_name
        else:
            # Ambiguous: Default to shop name
            detected_shop_name = wa_name

    if wa_biz_profile:
        biz_cat = wa_biz_profile.get("category")
        if biz_cat and biz_cat != "Other Business":
            detected_category = map_category(biz_cat)
            notes_lines.append(f"• WhatsApp Business Category: {biz_cat}")
            
        biz_addr = wa_biz_profile.get("address")
        if biz_addr and not is_foreign_or_spam(biz_addr):
            detected_address = biz_addr
            
        biz_desc = wa_biz_profile.get("description")
        if biz_desc and not is_foreign_or_spam(biz_desc):
            notes_lines.append(f"• Business Info: {biz_desc.strip()}")

    # 3. Clean OSINT fallback / enrichment
    osint_items = await fetch_clean_osint(local_phone)
    if osint_items:
        sources_found.append("Google / Web OSINT")
        combined_text = " ".join([f"{it['title']} {it['snippet']}" for it in osint_items[:2]])
        
        # If shop name is still empty, look in OSINT
        if not detected_shop_name:
            for it in osint_items:
                t = it['title']
                if is_business_name(t) and not is_foreign_or_spam(t):
                    detected_shop_name = t
                    break
                    
        # If owner name is empty, check if OSINT has person name
        if not detected_owner_name:
            for it in osint_items:
                t = it['title']
                if is_person_name(t) and not is_foreign_or_spam(t):
                    detected_owner_name = t
                    break

        # If address is still empty, check OSINT text
        if not detected_address:
            addr = extract_bd_address(combined_text)
            if addr:
                detected_address = addr

        # If category is still General, map from OSINT
        if detected_category == "General" and combined_text:
            detected_category = map_category(combined_text)

        # Check shop type
        lower_comb = combined_text.lower()
        if any(w in lower_comb for w in ["wholesale", "পাইকারি", "dealer", "distributor", "enterprise"]):
            detected_shop_type = "Wholesale / Dealer"
        elif any(w in lower_comb for w in ["online shop", "e-commerce", "facebook page", "অনলাইন"]):
            detected_shop_type = "Online / E-commerce"

    # Build clean, structured notes
    if is_on_whatsapp:
        notes_lines.insert(0, "• WhatsApp: Active Verified Account")
        if wa_about:
            notes_lines.append(f"• WhatsApp About: {wa_about.strip()}")
            
    if detected_address:
        notes_lines.append(f"• Location: {detected_address}")
        
    if detected_shop_name and detected_category != "General":
        notes_lines.append(f"• Classification: {detected_category} ({detected_shop_type})")

    clean_notes = "\n".join(notes_lines).strip()
    confidence = "high" if (is_on_whatsapp and detected_shop_name) else ("medium" if is_on_whatsapp else "low")

    return {
        "phone": local_phone,
        "is_on_whatsapp": is_on_whatsapp,
        "shop_name": detected_shop_name,
        "owner_name": detected_owner_name,
        "category": detected_category,
        "shop_type": detected_shop_type,
        "address": detected_address,
        "notes": clean_notes,
        "profile_picture_url": profile_pic,
        "whatsapp_about": wa_about,
        "sources_found": sources_found,
        "confidence": confidence
    }

# Export alias for compatibility
enrich_phone_intelligence = enrich_lead
