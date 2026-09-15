import re
import html
import asyncio
import httpx
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse

# Bangladesh Mobile Operators
BD_OPERATORS = {
    "017": "Grameenphone",
    "013": "Grameenphone (Skitto)",
    "018": "Robi Axiata",
    "016": "Airtel Bangladesh",
    "019": "Banglalink",
    "014": "Banglalink",
    "015": "Teletalk Bangladesh"
}

# Bangladesh Districts (64 Districts)
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

# Major Commercial Areas & Markets in Bangladesh
BD_COMMERCIAL_AREAS = {
    "motijheel": ("Motijheel", "Dhaka"), "মতিঝিল": ("Motijheel", "Dhaka"),
    "gulshan": ("Gulshan", "Dhaka"), "গুলশান": ("Gulshan", "Dhaka"),
    "banani": ("Banani", "Dhaka"), "বনানী": ("Banani", "Dhaka"),
    "dhanmondi": ("Dhanmondi", "Dhaka"), "ধানমন্ডি": ("Dhanmondi", "Dhaka"),
    "uttara": ("Uttara", "Dhaka"), "উত্তরা": ("Uttara", "Dhaka"),
    "mirpur": ("Mirpur", "Dhaka"), "মিরপুর": ("Mirpur", "Dhaka"),
    "bashundhara": ("Bashundhara", "Dhaka"), "বসুন্ধরা": ("Bashundhara", "Dhaka"),
    "banasree": ("Banasree", "Dhaka"), "বনশ্রী": ("Banasree", "Dhaka"),
    "elephant road": ("Elephant Road", "Dhaka"), "এলিফ্যান্ট রোড": ("Elephant Road", "Dhaka"),
    "new market": ("New Market", "Dhaka"), "নিউ মার্কেট": ("New Market", "Dhaka"),
    "chawkbazar": ("Chawkbazar", "Dhaka"), "চকবাজার": ("Chawkbazar", "Dhaka"),
    "islampur": ("Islampur", "Dhaka"), "ইসলামপুর": ("Islampur", "Dhaka"),
    "kawran bazar": ("Kawran Bazar", "Dhaka"), "কাওরান বাজার": ("Kawran Bazar", "Dhaka"), "কারওয়ান বাজার": ("Kawran Bazar", "Dhaka"),
    "mohakhali": ("Mohakhali", "Dhaka"), "মহাখালী": ("Mohakhali", "Dhaka"),
    "badda": ("Badda", "Dhaka"), "বাড্ডা": ("Badda", "Dhaka"),
    "rampura": ("Rampura", "Dhaka"), "রামপুরা": ("Rampura", "Dhaka"),
    "malibagh": ("Malibagh", "Dhaka"), "মালিবাগ": ("Malibagh", "Dhaka"),
    "moghbazar": ("Moghbazar", "Dhaka"), "মগবাজার": ("Moghbazar", "Dhaka"),
    "shantinagar": ("Shantinagar", "Dhaka"), "শান্তিনগর": ("Shantinagar", "Dhaka"),
    "khilgaon": ("Khilgaon", "Dhaka"), "খিলগাঁও": ("Khilgaon", "Dhaka"),
    "jatrabari": ("Jatrabari", "Dhaka"), "যাত্রাবাড়ী": ("Jatrabari", "Dhaka"),
    "farmgate": ("Farmgate", "Dhaka"), "ফার্মগেট": ("Farmgate", "Dhaka"),
    "tejgaon": ("Tejgaon", "Dhaka"), "তেজগাঁও": ("Tejgaon", "Dhaka"),
    "panthapath": ("Panthapath", "Dhaka"), "পান্থপথ": ("Panthapath", "Dhaka"),
    "green road": ("Green Road", "Dhaka"), "গ্রিন রোড": ("Green Road", "Dhaka"),
    "mohammadpur": ("Mohammadpur", "Dhaka"), "মোহাম্মদপুর": ("Mohammadpur", "Dhaka"),
    "savar": ("Savar", "Dhaka"), "সাভার": ("Savar", "Dhaka"),
    "ashulia": ("Ashulia", "Dhaka"), "আশুলিয়া": ("Ashulia", "Dhaka"),
    "tongi": ("Tongi", "Gazipur"), "টঙ্গী": ("Tongi", "Gazipur"),
    "agrabad": ("Agrabad", "Chattogram"), "আগ্রাবাদ": ("Agrabad", "Chattogram"),
    "gec circle": ("GEC Circle", "Chattogram"), "জিইসি": ("GEC Circle", "Chattogram"),
    "khatunganj": ("Khatunganj", "Chattogram"), "খাতুনগঞ্জ": ("Khatunganj", "Chattogram"),
    "zindabazar": ("Zindabazar", "Sylhet"), "জিন্দাবাজার": ("Zindabazar", "Sylhet")
}

# Exhaustive Business / Commercial Entity Keywords
BUSINESS_KEYWORDS = [
    "gadget", "gadgets", "tech", "technology", "technologies", "mobile", "mobiles",
    "telecom", "computer", "computers", "laptop", "laptops", "it", "digital",
    "electronics", "electronic", "cctv", "accessories", "solution", "solutions",
    "oasis", "smart", "robotics", "device", "devices", "audio", "sound", "ac",
    "appliances", "home appliances", "daikin", "mitsubishi", "hisense", "sharp",
    "shop", "store", "stores", "mart", "market", "bazar", "bazaar", "supermarket",
    "supershop", "super shop", "outlet", "showroom", "point", "corner", "hub",
    "zone", "plaza", "centre", "center", "gallery", "world", "house", "palace",
    "general", "variety", "departmental",
    "fashion", "clothing", "garments", "wear", "outfit", "boutique", "collection",
    "tailor", "tailors", "fabrics", "cloth", "shoe", "shoes", "footwear", "leather",
    "saree", "panjabi", "kids", "apparel",
    "pharmacy", "pharma", "medicine", "drug", "diagnostic", "hospital", "clinic",
    "dental", "surgical", "health", "care", "optics", "optical",
    "restaurant", "cafe", "food", "foods", "bakery", "sweets", "hotel", "kitchen",
    "biryani", "agro", "poultry", "feed", "fisheries", "fish", "ilish", "dairy",
    "enterprise", "enterprises", "traders", "trading", "agency", "distributor",
    "distribution", "wholesale", "dealer", "importer", "exporter", "supply", "supplies",
    "hardware", "sanitary", "motors", "motor", "auto", "paints", "furniture",
    "jewellers", "jewellery", "jewelry", "gold", "diamond", "express", "plus",
    "pro", "max", "studio", "media", "limited", "ltd", "corp", "corporation",
    "গ্যাজেট", "মোবাইল", "কম্পিউটার", "ইলেকট্রনিক্স", "ইলেকট্রনিক", "টেলিকম", "ল্যাপটপ",
    "দোকান", "শপ", "স্টোর", "মার্কেট", "বাজার", "বাজারের", "শোরুম", "আউটলেট", "পয়েন্ট",
    "পয়েন্ট", "হাব", "জোন", "প্লাজা", "সেন্টার", "ওয়ার্ল্ড", "ওয়ার্ল্ড", "হাউজ", "হাউস",
    "সুপারশপ", "সুপারমার্কেট", "এন্টারপ্রাইজ", "ট্রেডার্স", "ট্রেডিং", "ডিস্ট্রিবিউটর", "এজেন্সি",
    "ফ্যাশন", "গার্মেন্টস", "বুটিক", "কালেকশন", "বস্ত্রালয়", "টেইলার্স", "জুতা", "শাড়ি", "পাঞ্জাবি",
    "ফার্মেসি", "ফার্মা", "ঔষধ", "ওষুধ", "হাসপাতাল", "ক্লিনিক", "ডায়াগনস্টিক", "অপটিক্স", "চশমা",
    "মিষ্টান্ন", "হোটেল", "রেস্তোরাঁ", "রেস্টুরেন্ট", "বেকারি", "কনফেকশনারি", "খাবার",
    "জুয়েলার্স", "জুয়েলার্স", "স্বর্ণ", "হার্ডওয়্যার", "হার্ডওয়্যার", "মটরস", "মোটরস", "স্যানিটারি",
    "ফার্নিচার", "ইন্টেরিয়র", "ইন্টেরিয়র", "এগ্রো", "পোল্ট্রি", "ফিড", "মৎস্য", "মাছ", "ইলিশ"
]

PERSON_HONORIFICS_AND_SURNAMES = [
    "মো:", "মোঃ", "মোহাম্মদ", "মুহাম্মদ", "খান", "আহমেদ", "হোসেন", "হোসাইন", "ইসলাম",
    "চৌধুরী", "রহমান", "হাসান", "হাসেন", "আলী", "তৌহিদ", "ইমন", "আক্তার", "বেগম",
    "মিয়া", "মিয়া", "তালুকদার", "সরকার", "শেখ", "কাজী", "ভূঁইয়া", "ভূঁইয়া", "উদ্দিন",
    "মাহমুদ", "রানা", "আলম", "শাকিল", "তানভীর", "সোহাগ", "ফারুক", "কবীর", "মোল্লা",
    "শিকদার", "দেওয়ান", "বাবু", "হাশেম", "রেজা", "কামাল", "রুবেল", "সজীব", "নাসির",
    "জসিম", "রায়", "দাস", "শাহা", "ঘোষ", "মণ্ডল", "অধিকারী", "বিশ্বাস", "মজুমদার",
    "md", "md.", "mohammad", "muhammad", "khan", "ahmed", "hossain", "hossen", "islam",
    "chowdhury", "rahman", "hasan", "hassan", "ali", "touhid", "imon", "akter",
    "begum", "mia", "miah", "talukdar", "sarker", "sheikh", "kazi", "bhuiyan", "uddin",
    "mahmud", "rana", "alam", "shakil", "tanvir", "sohag", "faruk", "kabir", "mollah",
    "sikder", "dewan", "babu", "hashem", "reza", "kamal", "mustafa", "rubel", "sajib",
    "nasir", "jashim", "roy", "das", "shaha", "ghosh", "mondal", "biswas", "majumder"
]

CATEGORY_RULES = [
    (["gadget", "gadgets", "tech", "technology", "mobile", "mobiles", "computer", "computers", "laptop", "electronics", "electronic", "cctv", "ac", "appliances", "air condition", "গ্যাজেট", "মোবাইল", "কম্পিউটার", "ইলেকট্রনিক্স", "ইলেকট্রনিক", "টেলিকম"], "Electronics"),
    (["repair", "servicing", "service center", "care", "সার্ভিস", "রিপেয়ারিং"], "Mobile Repair & Tech"),
    (["fashion", "clothing", "garments", "wear", "boutique", "collection", "tailor", "shoe", "shoes", "footwear", "saree", "panjabi", "ফ্যাশন", "গার্মেন্টস", "বুটিক", "কালেকশন", "বস্ত্রালয়", "টেইলার্স", "জুতা", "শাড়ি"], "Fashion"),
    (["grocery", "supermarket", "supershop", "super shop", "departmental", "mart", "fish", "meat", "ilish", "bakery", "sweets", "মাছ", "ইলিশ", "বাজার", "মুদি", "সুপারশপ", "সুপারমার্কেট", "মিষ্টান্ন", "বেকারি"], "Supershop & Grocery"),
    (["pharmacy", "pharma", "medicine", "drug", "health", "hospital", "clinic", "diagnostic", "dental", "ঔষধ", "ওষুধ", "ফার্মেসি", "ফার্মা", "হাসপাতাল", "ক্লিনিক", "ডায়াগনস্টিক"], "Pharmacy"),
    (["wholesale", "enterprise", "traders", "trading", "distributor", "distribution", "dealer", "পাইকারি", "এন্টারপ্রাইজ", "ট্রেডার্স", "ট্রেডিং", "ডিস্ট্রিবিউটর", "ডিলার"], "Wholesale")
]

def is_foreign_or_spam(text: str) -> bool:
    if not text:
        return False
    if re.search(r'[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff]', text):
        return True
    lower = text.lower()
    spam_markers = [
        "alibaba", "aliexpress", "made-in-china", "taobao", "jd.com", "shopee", "lazada",
        "free download", "xml version", "login", "sign up", "sign in", "404 not found",
        "cloudflare", "captcha", "lorem ipsum", "pornhub", "casino", "zhihu", "baidu"
    ]
    return any(marker in lower for marker in spam_markers)

def is_business_name(name: str) -> bool:
    if not name or is_foreign_or_spam(name):
        return False
    lower = name.lower()
    return any(kw in lower for kw in BUSINESS_KEYWORDS)

def is_person_name(name: str) -> bool:
    if not name or is_foreign_or_spam(name):
        return False
    if is_business_name(name):
        return False
    lower = name.lower()
    for kw in PERSON_HONORIFICS_AND_SURNAMES:
        if re.search(rf'\b{re.escape(kw)}\b', lower) or kw in lower:
            return True
    return False

def clean_title_or_name(raw_name: str) -> str:
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
        r'\s*-\s*Facebook.*$',
        r'\s*\|\s*Facebook.*$',
        r'\s*-\s*WorldPlaces.*$',
        r'\s*-\s*YouTube.*$',
        r'\s*-\s*Bikroy\.com.*$'
    ]
    for p in patterns:
        cleaned = re.sub(p, '', cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.strip(" -|·'\"•,:\n\r\t*")
    
    # If string contains quoted brand / shop name like "M.A. Tech Enterprise" or “এম. এ. টেক”
    quoted = re.findall(r'["“\'‘]([^"”\'’]{3,50})["”\'’]', cleaned)
    if quoted:
        for q in quoted:
            if is_business_name(q) or not is_foreign_or_spam(q):
                return q.strip()
                
    if len(cleaned) < 2 or len(cleaned) > 80:
        return ""
    lower = cleaned.lower()
    if lower in ["contact us", "contact", "home", "about us", "login", "sign in", "welcome", "page not found"]:
        return ""
    return cleaned

def map_category(text_corpus: str) -> str:
    if not text_corpus:
        return "General"
    lower = text_corpus.lower()
    for keywords, category in CATEGORY_RULES:
        for kw in keywords:
            if kw in lower:
                return category
    return "General"

def extract_bd_address(text_corpus: str) -> str:
    if not text_corpus or is_foreign_or_spam(text_corpus):
        return ""
    lower = text_corpus.lower()
    for kw, (area_name, district_name) in BD_COMMERCIAL_AREAS.items():
        if re.search(rf'\b{re.escape(kw)}\b', lower) or kw in lower:
            return f"{area_name}, {district_name}, Bangladesh"
    for kw, dist_name in BD_DISTRICTS_MAP.items():
        if re.search(rf'\b{re.escape(kw)}\b', lower) or kw in lower:
            return f"{dist_name}, Bangladesh"
    return ""

def get_operator_info(phone_digits: str) -> str:
    if phone_digits.startswith("880"):
        p = "0" + phone_digits[3:]
    elif phone_digits.startswith("0"):
        p = phone_digits
    else:
        p = "0" + phone_digits
    prefix = p[:3]
    return BD_OPERATORS.get(prefix, "Bangladesh Mobile Network")

async def extract_from_website_url(url: str) -> Dict[str, Any]:
    """Fetch website or Facebook page URL to extract site name, business title, and description."""
    if not url or not url.startswith(('http://', 'https://')):
        return {}
        
    domain = ""
    try:
        parsed = urlparse(url)
        netloc = parsed.netloc.lower().replace('www.', '')
        domain_root = netloc.split('.')[0]
        if domain_root not in ['facebook', 'instagram', 'wa', 'me', 'bikroy', 'daraz', 'google', 'youtube']:
            domain = domain_root.title()
    except Exception:
        pass

    headers = {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }

    try:
        async with httpx.AsyncClient(timeout=4.0, follow_redirects=True, headers=headers) as client:
            r = await client.get(url)
            if r.status_code == 200:
                body = r.text
                og_site = re.search(r'<meta property="og:site_name" content="([^"]+)"', body)
                og_title = re.search(r'<meta property="og:title" content="([^"]+)"', body)
                og_desc = re.search(r'<meta property="og:description" content="([^"]+)"', body)
                title = re.search(r'<title>(.*?)</title>', body, re.IGNORECASE)

                site_name = html.unescape(og_site.group(1).strip()) if og_site else ""
                raw_title = html.unescape(og_title.group(1).strip() if og_title else (title.group(1).strip() if title else ""))
                raw_desc = html.unescape(og_desc.group(1).strip() if og_desc else "")

                clean_name = ""
                if site_name and not is_foreign_or_spam(site_name):
                    clean_name = site_name
                elif raw_title and not is_foreign_or_spam(raw_title):
                    parts = [p.strip() for p in re.split(r'[-–—|•:]', raw_title) if p.strip()]
                    for p in parts:
                        if is_business_name(p):
                            clean_name = p
                            break
                    if not clean_name and parts:
                        clean_name = parts[0]
                elif domain:
                    clean_name = domain

                return {
                    "shop_name": clean_name or domain,
                    "title": raw_title,
                    "description": raw_desc,
                    "url": url
                }
    except Exception:
        pass
        
    if domain:
        return {"shop_name": domain, "url": url}
    return {}

async def fetch_facebook_business_page(business_name: str) -> Optional[Dict[str, Any]]:
    if not business_name or len(business_name) < 3:
        return None
    clean_alpha = re.sub(r'[^a-zA-Z0-9]', '', business_name)
    if not clean_alpha or len(clean_alpha) < 3:
        return None

    candidates = [
        clean_alpha,
        clean_alpha + 'bd',
        clean_alpha + '.bd',
        clean_alpha + 'official',
        clean_alpha + 'bangladesh',
        clean_alpha + 'shop',
        clean_alpha + 'store'
    ]
    
    headers = {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
    
    async with httpx.AsyncClient(timeout=3.5, follow_redirects=True, headers=headers) as client:
        for slug in candidates:
            url = f'https://www.facebook.com/{slug}'
            try:
                r = await client.get(url)
                if r.status_code == 200:
                    og_title_m = re.search(r'<meta property="og:title" content="([^"]+)"', r.text)
                    og_desc_m = re.search(r'<meta property="og:description" content="([^"]+)"', r.text)
                    if og_title_m:
                        og_title = html.unescape(og_title_m.group(1))
                        og_desc = html.unescape(og_desc_m.group(1)) if og_desc_m else ''
                        if 'Log into Facebook' in og_title or 'log in or sign up' in og_title or 'Facebook' == og_title.strip():
                            continue
                        likes_match = re.search(r'([\d,]+)\s*(?:likes|followers)', og_desc, re.IGNORECASE)
                        likes = likes_match.group(1) if likes_match else None
                        return {
                            'page_url': url,
                            'title': og_title,
                            'description': og_desc,
                            'likes': likes
                        }
            except Exception:
                pass
    return None

def extract_owner_name_from_text(corpus: str) -> str:
    """Extract owner/proprietor name from bio or notes."""
    if not corpus:
        return ""
    patterns = [
        r'(?:owner|proprietor|প্রোপ্রাইটর|মালিক|পরিচালক|contact person|যোগাযোগ)[\s:–—]+([A-Za-z\s.\u0980-\u09ff]{3,35})(?:[,\n\.]|$)',
        r'(?:Engr\.|Engr|Md\.|Md|Dr\.|Mohammad|মুহাম্মদ|মোহাম্মদ)\s+([A-Za-z\s.\u0980-\u09ff]{3,30})'
    ]
    for p in patterns:
        m = re.search(p, corpus, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip(" -:,.|")
            if is_person_name(candidate):
                return candidate
    return ""

async def enrich_lead(phone_raw: str, wa_data: Optional[Dict[str, Any]] = None, wa_engine_url: str = "http://whatsapp-engine:5001") -> Dict[str, Any]:
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

    carrier = get_operator_info(local_phone)
    sources_found = []
    is_on_whatsapp = False
    profile_pic = None
    wa_about = None
    wa_name = ""
    wa_biz_profile = None

    if wa_data and wa_data.get("exists"):
        is_on_whatsapp = True
        sources_found.append("WhatsApp Profile")
        profile_pic = wa_data.get("profilePictureUrl")
        wa_about = wa_data.get("about")
        raw_n = wa_data.get("name") or wa_data.get("pushName") or ""
        wa_name = clean_title_or_name(raw_n)
        wa_biz_profile = wa_data.get("businessProfile")
        if wa_biz_profile:
            sources_found.append("WhatsApp Business Profile")

    detected_shop_name = ""
    detected_owner_name = ""
    detected_category = "General"
    detected_shop_type = "Retail"
    detected_address = ""
    notes_lines = []

    # 1. Check Websites in WhatsApp Business Profile
    if wa_biz_profile:
        websites = wa_biz_profile.get("website") or []
        if isinstance(websites, list) and websites:
            for w in websites:
                if w and isinstance(w, str):
                    web_info = await extract_from_website_url(w)
                    if web_info.get("shop_name"):
                        detected_shop_name = web_info["shop_name"]
                        sources_found.append("Business Website")
                    if web_info.get("description"):
                        notes_lines.append(f"• Website Info: {web_info['description']}")
                    notes_lines.append(f"• Website: {w}")
                    break

    # 2. Evaluate WhatsApp Profile & Business Account Description
    if wa_name and not detected_shop_name:
        if wa_biz_profile or is_business_name(wa_name):
            detected_shop_name = wa_name
            addr_from_name = extract_bd_address(wa_name)
            if addr_from_name and not detected_address:
                detected_address = addr_from_name
            detected_category = map_category(wa_name)
        elif is_person_name(wa_name):
            detected_owner_name = wa_name
        else:
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
            
            # If shop name is still missing, extract from description
            if not detected_shop_name:
                quoted = re.findall(r'["“\'‘]([^"”\'’]{3,50})["”\'’]', biz_desc)
                if quoted:
                    detected_shop_name = quoted[0].strip()
                else:
                    # Check dealer patterns: "Authorised Top Dealer Of Worlds No. 01 Air Condition Brand DAIKIN"
                    m_dealer = re.search(r'Authorised.*?(?:Dealer|Distributor)\s+Of\s+([A-Za-z0-9\s&.\'-]{3,40}?)(?:,|\.|\n|Retailer|Wholesaler|$)', biz_desc, re.IGNORECASE)
                    if m_dealer:
                        brand = m_dealer.group(1).strip()
                        brand = re.sub(r'Worlds\s+No\.\s*\d+\s*', '', brand, flags=re.IGNORECASE)
                        brand = re.sub(r'Air\s+Condition\s+Brand\s*', '', brand, flags=re.IGNORECASE).strip()
                        if brand:
                            detected_shop_name = f"{brand} Authorized Dealer"
                            
            # Check owner from description
            if not detected_owner_name:
                owner_from_desc = extract_owner_name_from_text(biz_desc)
                if owner_from_desc:
                    detected_owner_name = owner_from_desc

    # 3. Location from WhatsApp About or Description
    if not detected_address:
        corpus = (wa_about or "") + " " + (wa_biz_profile.get("description", "") if wa_biz_profile else "")
        addr_extracted = extract_bd_address(corpus)
        if addr_extracted:
            detected_address = addr_extracted

    # 4. Facebook Open Graph & Page OSINT
    search_target = detected_shop_name or wa_name
    if search_target and is_business_name(search_target):
        try:
            fb_info = await fetch_facebook_business_page(search_target)
            if fb_info:
                sources_found.append("Facebook Page")
                fb_addr = extract_bd_address(fb_info['title'] + ' ' + fb_info['description'])
                if fb_addr and not detected_address:
                    detected_address = fb_addr
                if detected_category == "General":
                    detected_category = map_category(fb_info['title'] + ' ' + fb_info['description'])
                likes_str = f" ({fb_info['likes']} likes)" if fb_info.get('likes') else ""
                short_url = fb_info['page_url'].replace('https://www.', '').replace('https://', '')
                notes_lines.append(f"• Facebook: {short_url}{likes_str}")
        except Exception:
            pass

    # 5. Determine category & shop type
    comb_corpus = (detected_shop_name + " " + (wa_about or "") + " " + (notes_lines[0] if notes_lines else "")).lower()
    if detected_category == "General":
        detected_category = map_category(comb_corpus)
        
    if any(w in comb_corpus for w in ["wholesale", "wholesaler", "পাইকারি", "distributor", "dealer", "enterprise", "ট্রেডার্স"]):
        detected_shop_type = "Wholesale"
    elif any(w in comb_corpus for w in ["online", "e-commerce", "facebook", "page", "অনলাইন"]):
        detected_shop_type = "Online Store"
    elif any(w in comb_corpus for w in ["servicing", "service", "repair", "care", "সার্ভিস"]):
        detected_shop_type = "Service Center"
    else:
        detected_shop_type = "Retail"

    # Notes Assembly
    if is_on_whatsapp:
        notes_lines.insert(0, f"• WhatsApp: Active Verified Account ({carrier})")
        if wa_about:
            notes_lines.append(f"• WhatsApp About: {wa_about.strip()}")
            
    if detected_address:
        notes_lines.append(f"• Location: {detected_address}")
        
    if detected_shop_name:
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

enrich_phone_intelligence = enrich_lead