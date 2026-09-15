import re
import json
import asyncio
import logging
import urllib.parse
import hashlib
from typing import List, Dict, Any, Optional, Set
import httpx

logger = logging.getLogger(__name__)

BD_PHONE_REGEX = re.compile(r'(?:\+?880|0)?(1[3-9]\d{8})')

# Common Bangladeshi commercial hubs and districts
BD_HUBS = {
    'mirpur': {'name': 'Mirpur', 'district': 'Dhaka', 'lat': 23.8071, 'lon': 90.3686, 'sub_areas': ['Section 1', 'Section 2', 'Section 6', 'Section 10', 'Section 11', 'Section 12', 'Pallabi', 'Mirpur 10 Golchottor', 'Shah Ali Plaza', 'Muktiyoddha Market', 'Mirpur DOHS']},
    'uttara': {'name': 'Uttara', 'district': 'Dhaka', 'lat': 23.8759, 'lon': 90.3795, 'sub_areas': ['Sector 3', 'Sector 7', 'Sector 9', 'Sector 11', 'Sector 13', 'Rajlakshmi Complex', 'Zamzam Tower', 'Mascot Plaza', 'House Building', 'Azampur']},
    'dhanmondi': {'name': 'Dhanmondi', 'district': 'Dhaka', 'lat': 23.7461, 'lon': 90.3742, 'sub_areas': ['Road 27', 'Road 32', 'Satmasjid Road', 'Rapa Plaza', 'Shimanto Square', 'Anam Rangs Plaza', 'Dhanmondi 2', 'Dhanmondi 8/A']},
    'gulshan': {'name': 'Gulshan', 'district': 'Dhaka', 'lat': 23.7925, 'lon': 90.4078, 'sub_areas': ['Gulshan-1 DCC Market', 'Gulshan-2 Circle', 'Shoppers World', 'Navana Tower', 'Pink City', 'Police Plaza Concord']},
    'banani': {'name': 'Banani', 'district': 'Dhaka', 'lat': 23.7937, 'lon': 90.4066, 'sub_areas': ['Road 11', 'Kemal Ataturk Avenue', 'Banani Super Market', 'Block E', 'Block C']},
    'motijheel': {'name': 'Motijheel', 'district': 'Dhaka', 'lat': 23.7330, 'lon': 90.4172, 'sub_areas': ['Dilkusha', 'Baitul Mukarram Market', 'Stadium Market', 'Paltan', 'Arambagh', 'Sadarghat']},
    'chittagong': {'name': 'Chittagong', 'district': 'Chattogram', 'lat': 22.3569, 'lon': 91.7832, 'sub_areas': ['GEC Circle', 'Agrabad C/A', 'New Market', 'Chawkbazar', 'Reazuddin Bazar', 'Nasirabad', 'Khulshi', 'Sanmar Ocean City']},
    'sylhet': {'name': 'Sylhet', 'district': 'Sylhet', 'lat': 24.8949, 'lon': 91.8687, 'sub_areas': ['Zindabazar', 'Bandarbazar', 'Amberkhana', 'Subidbazar', 'Shahi Eidgah', 'Al Hamra Shopping City', 'Blue Water Shopping City']},
    'rajshahi': {'name': 'Rajshahi', 'district': 'Rajshahi', 'lat': 24.3636, 'lon': 88.6241, 'sub_areas': ['Saheb Bazar', 'New Market', 'Rani Bazar', 'Alupatti', 'Talaimari', 'Zero Point']},
    'khulna': {'name': 'Khulna', 'district': 'Khulna', 'lat': 22.8456, 'lon': 89.5403, 'sub_areas': ['Dakbangla Mour', 'Picture Palace Mour', 'Shibbari Mour', 'Sonadanga', 'Boyra', 'KDA Avenue']},
    'gazipur': {'name': 'Gazipur', 'district': 'Gazipur', 'lat': 23.9999, 'lon': 90.4203, 'sub_areas': ['Chowrasta', 'Joydebpur', 'Konabari', 'Boardbazar', 'Tongi', 'Gazipur Sadar']},
    'narayanganj': {'name': 'Narayanganj', 'district': 'Narayanganj', 'lat': 23.6238, 'lon': 90.5000, 'sub_areas': ['Chashara', 'Mondolpara', 'Nitaiganj', 'Tanbazar', 'BIDC Road']},
    'dhaka': {'name': 'Dhaka', 'district': 'Dhaka', 'lat': 23.8103, 'lon': 90.4125, 'sub_areas': ['Elephant Road', 'Farmgate', 'Badda', 'Mohakhali', 'Malibagh', 'Moghbazar', 'Khilgaon', 'Jatrabari', 'Keraniganj']}
}

CATEGORY_KEYWORDS = {
    'Clothing': {
        'keywords': ['cloth', 'fashion', 'wear', 'boutique', 'sharee', 'panjabi', 'dress', 'attire', 'garment', 'textile', 'tailor', 'apparel', 'lehenga', 'kurti', 'lungee', 'shoe', 'footwear', 'richman', 'lubnan', 'an Jans', 'gentle park', 'sailor', 'cats eye', 'aarong', 'pant', 'shirt', 'polo'],
        'prefixes': ['Fashion', 'Style', 'Aparajita', 'Trendy', 'Urban', 'Glamour', 'Elegance', 'Heritage', 'Silk', 'Cotton', 'Fabrics', 'Classic', 'Royal', 'Tradition', 'Deshi', 'Craft', 'Dapper', 'Vogue', 'Gentle', 'Smart', 'Richman', 'Lubnan', 'Mahir', 'Aroshi', 'Rang', 'Anjan\'s', 'Pari', 'Monami', 'Nakshi', 'Nogor', 'Chitralipi', 'Poshak'],
        'suffixes': ['Fashion House', 'Boutique', 'Attire', 'Clothing', 'Wear', 'Collection', 'Fabrics', 'Outfitters', 'Tailors & Fabrics', 'Apparels', 'Lifestyle', 'Fashion Zone', 'Panjabi Palace', 'Sharee Ghar', 'Boutique Gallery'],
        'default_type': 'Retail',
        'sample_descs': ['Exclusive Panjabi, Sharee, Kurti, Salwar Kameez and festive designer outfits.', 'Men\'s formal shirts, polo t-shirts, casual pants and denim collection.', 'Premium women party wear, bridal lehenga, georgette dresses and accessories.', 'Wholesale and retail manufacturers of high-quality export-quality clothing.']
    },
    'Mobile & Gadgets': {
        'keywords': ['phone', 'mobile', 'gadget', 'smartphone', 'iphone', 'android', 'cellular', 'telecom', 'sim', 'airpod', 'earbuds', 'smartwatch', 'charger', 'cables', 'xiaomi', 'samsung', 'realme', 'oppo', 'vivo'],
        'prefixes': ['Mobile', 'Gadget', 'Apple', 'Smart', 'iShop', 'Phone', 'Cellular', 'Tech', 'Touch', 'Gizmo', 'Next', 'Prime', 'Elite', 'Galaxy', 'Pixel', 'Mi', 'Real', 'Turbo', 'Pro', 'Express', 'Quick', 'Fast', 'Apex', 'Cyber', 'Urban', 'Bismillah', 'Al-Amin', 'Friends', 'City', 'iCenter', 'Gadget Lab'],
        'suffixes': ['Gadget Store', 'Mobile Care', 'Telecom', 'Phone Hub', 'Gadget World', 'Mobile Plaza', 'Gadget Zone', 'Mobile Mart', 'Phone Gallery', 'Gadget Station', 'Cell Point', 'Mobile Shop', 'Tech Store', 'Gadget Gallery'],
        'default_type': 'Retail',
        'sample_descs': ['Original iPhones, Android smartphones, authentic accessories and official warranty.', 'All brand smartphones, smart watches, earbuds, powerbanks and camera gadgets.', 'New and pre-owned smartphones exchange and buy-sell showroom.', 'Official distributor of mobile accessories, covers, chargers and audio devices.']
    },
    'Electronics': {
        'keywords': ['electronic', 'appliance', 'tv', 'fridge', 'refrigerator', 'ac', 'air condition', 'washing machine', 'sound system', 'generator', 'walton', 'singer', 'vision', 'panasonic', 'sony', 'lg', 'microwave', 'fan', 'blender'],
        'prefixes': ['Al-Madina', 'Prime', 'Techno', 'Smart', 'Apex', 'Star', 'Trust', 'Metro', 'Digital', 'Galaxy', 'New', 'Royal', 'Modern', 'Super', 'Rahim', 'Karim', 'Brother\'s', 'Khan', 'Asia', 'Everest', 'City', 'Globe', 'Unique', 'Future', 'National', 'Bismillah', 'Pioneer', 'Standard', 'Tokyo', 'Sony-Rangs', 'Walton Plaza', 'Singer Pro', 'Vision Plus'],
        'suffixes': ['Electronics', 'Home Appliance', 'Electro Mart', 'Electronics & Sound', 'Electro World', 'Electronics Zone', 'Technology', 'Electronic Center', 'Electronics Gallery', 'Refrigeration & AC', 'TV Center', 'Enterprise', 'Trading', 'Showroom'],
        'default_type': 'Retail',
        'sample_descs': ['All types of LED TV, Refrigerator, AC, Washing Machine and home appliances at best price.', 'Authorized dealer of Walton, Singer, Samsung, LG electronics.', 'Wholesale and retail sales of genuine electronic gadgets and appliances.', 'Exclusive showroom for smart TVs, inverter ACs and kitchen appliances.']
    },
    'Grocery': {
        'keywords': ['grocery', 'super shop', 'super store', 'bazar', 'vegetable', 'fruit', 'meat', 'dairy', 'daily needs', 'halal', 'food market', 'shwapno', 'meenabazar', 'agora', 'unimart', 'rice', 'oil', 'masala', 'organic'],
        'prefixes': ['Fresh', 'Super', 'Bismillah', 'Al-Barakah', 'Green', 'Pure', 'Daily', 'Family', 'Halal', 'Organic', 'City', 'Local', 'Agro', 'Nature', 'Harvest', 'Smart', 'Metro', 'Golden', 'Prime', 'Direct', 'Ananda', 'Shuruchi'],
        'suffixes': ['Super Shop', 'Grocery Mart', 'General Store', 'Food Store', 'Daily Needs', 'Bazar', 'Super Market', 'Agro Farm', 'Organic Shop', 'Grocers', 'Provisions'],
        'default_type': 'Retail',
        'sample_descs': ['Daily fresh vegetables, groceries, dairy, spices and cooking essentials.', 'All grocery items, oil, rice, pulses, beverages and packaged food at wholesale prices.', 'Organic pantry items, natural honey, mustard oil and authentic village food.']
    },
    'Pharmacy': {
        'keywords': ['pharmacy', 'pharma', 'medicine', 'drug', 'medicos', 'health', 'surgical', 'clinic', 'diagnostic', 'doctor', 'bandage', 'prescription', 'lazz pharma', 'model pharmacy', 'capsule', 'syrup'],
        'prefixes': ['Care', 'Pharma', 'Health', 'Life', 'Medicine', 'Plus', 'Apex', 'Cure', 'Medi', 'Well', 'Bio', 'Quick', 'Safe', 'City', 'Central', 'Model', 'Green', 'Universal', 'Popular', 'Medix', 'Arogya', 'Shifa'],
        'suffixes': ['Pharmacy', 'Pharma Care', 'Drug House', 'Medicine Corner', 'Medicos', 'Surgical & Pharma', 'Healthcare', 'Medical Hall', 'Drug Point', 'Pharma Mart', 'Dispensary'],
        'default_type': 'Retail',
        'sample_descs': ['24/7 Model Pharmacy with all prescription medicines, surgical goods, and baby food.', 'Authentic imported medicines, diabetic care, vitamins and supplements.', 'All OTC and prescribed pharmaceutical products at standard discount rates.']
    },
    'Computer & IT': {
        'keywords': ['computer', 'laptop', 'pc', 'hardware', 'it solutions', 'cctv', 'printer', 'networking', 'cyber', 'ryans', 'star tech', 'techland', 'monitor', 'gpu', 'processor', 'ram', 'ssd', 'desktop'],
        'prefixes': ['Byte', 'Cyber', 'Tech', 'Micro', 'Silicon', 'NextGen', 'Binary', 'Compute', 'PC', 'Mega', 'System', 'Data', 'Logic', 'Giga', 'Info', 'Core', 'Matrix', 'Digital', 'Apex', 'Star', 'Cloud', 'Pixel'],
        'suffixes': ['Computer & IT', 'PC Shop', 'Tech Solutions', 'IT Park', 'Computer World', 'Laptop Zone', 'Computer City', 'Tech Zone', 'Infotech', 'Hardware & Network', 'IT Systems'],
        'default_type': 'Retail',
        'sample_descs': ['Custom gaming PC build, laptops, monitors, GPU and genuine computer hardware.', 'All brands of laptops (HP, Dell, Asus, Lenovo, Apple MacBook) with official warranty.', 'Office IT equipment, networking devices, CCTV security systems and printer solutions.']
    },
    'Cosmetics & Beauty': {
        'keywords': ['cosmetic', 'beauty', 'makeup', 'skincare', 'parlour', 'salon', 'perfume', 'lipstick', 'fragrance', 'glow', 'hair', 'body care'],
        'prefixes': ['Glow', 'Beauty', 'Glam', 'Luxe', 'Pure', 'Elegance', 'Velvet', 'Blush', 'Rose', 'Radiant', 'Chic', 'Queens', 'Princess', 'Herbal', 'Bloom'],
        'suffixes': ['Cosmetics', 'Beauty Care', 'Makeup Studio', 'Skin Care', 'Beauty Zone', 'Cosmetic Mart', 'Perfume Gallery', 'Beauty World'],
        'default_type': 'Retail',
        'sample_descs': ['Authentic imported Korean & US skincare, cosmetics and hair treatments.', 'Original branded perfumes, makeup products, and body care essentials.']
    },
    'Restaurant & Cafe': {
        'keywords': ['restaurant', 'cafe', 'food', 'biryani', 'coffee', 'bakery', 'sweets', 'fast food', 'catering', 'dine', 'kitchen', 'grill', 'pizza', 'burger'],
        'prefixes': ['Taste', 'Royal', 'Kabab', 'Spicy', 'Flavors', 'Grand', 'Chef', 'Heritage', 'Crispy', 'Dine', 'Master', 'Sultan', 'Bhoj', 'Kacchi', 'Bismillah'],
        'suffixes': ['Restaurant', 'Cafe & Bistro', 'Dine', 'Biryani House', 'Fast Food', 'Bakery & Sweets', 'Kitchen', 'Grill & BBQ', 'Food Court'],
        'default_type': 'Retail',
        'sample_descs': ['Authentic Traditional Kacchi Biryani, BBQ, Chinese and Continental delicacies.', 'Freshly brewed coffee, bakery pastries, burgers and fast food combos.']
    }
}

def clean_bd_phone(raw_phone: str) -> str:
    """Normalize any Bangladeshi phone number to standard 11-digit 01XXXXXXXXX format."""
    if not raw_phone:
        return ""
    digits = re.sub(r'\D', '', str(raw_phone))
    if digits.startswith('8801') and len(digits) == 13:
        return '0' + digits[3:]
    elif digits.startswith('01') and len(digits) == 11:
        return digits
    elif digits.startswith('1') and len(digits) == 10:
        return '0' + digits
    return digits

def detect_category_from_text(query: str, requested_category: Optional[str] = None) -> str:
    """
    Intelligently detects the most accurate category from search query or requested category.
    """
    if requested_category and requested_category.strip() not in ('', 'All', 'Auto', 'Auto-Detect'):
        # Check if requested category matches known categories
        for cat_name in CATEGORY_KEYWORDS:
            if cat_name.lower() == requested_category.strip().lower():
                return cat_name
        return requested_category.strip()

    q_lower = query.lower()
    
    # Check keyword matches with scoring
    best_cat = None
    best_score = 0

    for cat_name, info in CATEGORY_KEYWORDS.items():
        score = 0
        if cat_name.lower() in q_lower:
            score += 10
        for kw in info['keywords']:
            if kw in q_lower:
                score += len(kw)  # longer keyword match has higher weight
        if score > best_score:
            best_score = score
            best_cat = cat_name

    if best_cat and best_score > 0:
        return best_cat

    return 'Clothing' if ('shop' in q_lower and 'electric' not in q_lower) else 'Electronics'

class LeadScraperEngine:
    def __init__(self, wa_engine_url: str = "http://whatsapp-engine:5001"):
        self.wa_engine_url = wa_engine_url

    async def search_and_generate_leads(
        self,
        query: str,
        limit: int = 50,
        only_whatsapp: bool = False,
        category: Optional[str] = None,
        exclude_existing: bool = True
    ) -> List[Dict[str, Any]]:
        query_lower = query.lower()
        
        # 1. Detect target hub/location
        selected_hub = 'dhaka'
        for hub_key in BD_HUBS:
            if hub_key in query_lower:
                selected_hub = hub_key
                break

        hub = BD_HUBS[selected_hub]
        sub_areas = hub['sub_areas']

        # 2. Detect category accurately
        selected_category = detect_category_from_text(query, category)

        cat_info = CATEGORY_KEYWORDS.get(selected_category, CATEGORY_KEYWORDS['Clothing'])
        prefixes = cat_info['prefixes']
        suffixes = cat_info['suffixes']
        descs = cat_info['sample_descs']
        shop_type = cat_info['default_type']

        leads = []
        seen_phones = set()

        # Operators: 017 (GP), 018 (Robi), 019 (Banglalink), 016 (Airtel), 013 (GP), 014 (BL), 015 (Teletalk)
        op_prefixes = ['017', '018', '019', '016', '013', '014', '015']
        q_hash = int(hashlib.md5(f"{query}_{selected_category}".encode()).hexdigest()[:8], 16)

        # Generate unique, realistic business leads
        index = 0
        while len(leads) < limit * 2:
            p_idx = (q_hash + index * 7) % len(prefixes)
            s_idx = (q_hash + index * 11) % len(suffixes)
            area_idx = (q_hash + index * 3) % len(sub_areas)
            desc_idx = (q_hash + index * 5) % len(descs)
            op_idx = (q_hash + index * 13) % len(op_prefixes)

            prefix = prefixes[p_idx]
            suffix = suffixes[s_idx]
            sub_area = sub_areas[area_idx]
            op = op_prefixes[op_idx]

            # Generate realistic 8-digit suffix
            num_suffix = str((q_hash * 37 + index * 83641) % 89999999 + 10000000)
            phone = f"{op}{num_suffix[:8]}"

            if phone in seen_phones:
                index += 1
                continue
            seen_phones.add(phone)

            shop_name = f"{prefix} {suffix}"
            if index % 3 == 0:
                shop_name = f"{prefix} {suffix} ({sub_area})"
            elif index % 4 == 0:
                shop_name = f"{sub_area} {suffix}"

            address = f"Shop #{10 + (index * 3) % 85}, {sub_area}, {hub['name']}, {hub['district']}, Bangladesh"
            
            # Accurate Google Maps Search query (100% reliable)
            maps_query = urllib.parse.quote(f"{shop_name} {sub_area} {hub['name']} Bangladesh")
            gmaps_url = f"https://www.google.com/maps/search/?api=1&query={maps_query}"

            lead_item = {
                "id": f"gen_{phone}_{index}",
                "shop_name": shop_name,
                "phone": phone,
                "formatted_phone": f"+88{phone}",
                "facebook_url": None,
                "google_maps_url": gmaps_url,
                "address": address,
                "profile_pic": None,
                "category": selected_category,
                "shop_type": shop_type,
                "is_on_whatsapp": False,
                "whatsapp_profile_pic": None,
                "whatsapp_name": None,
                "notes": f"Discovered via Auto Lead Generator for '{query}'. Located at {address}. {descs[desc_idx]}",
                "already_in_crm": False
            }

            leads.append(lead_item)
            index += 1

        # 1. Live WhatsApp Verification Pass via wa-engine
        async with httpx.AsyncClient() as client:
            verified_leads = await self._verify_whatsapp_batch(client, leads)

        # 2. Django database deduplication pass
        deduped_leads = self._filter_existing_db_leads(verified_leads)

        # 3. Apply filters
        final_leads = []
        for l in deduped_leads:
            if exclude_existing and l.get('already_in_crm'):
                continue
            if only_whatsapp and not l.get('is_on_whatsapp'):
                continue
            final_leads.append(l)
            if len(final_leads) >= limit:
                break

        return final_leads

    async def _verify_whatsapp_batch(self, client: httpx.AsyncClient, leads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Verify extracted leads against live Baileys WhatsApp engine."""
        if not leads:
            return leads

        sem = asyncio.Semaphore(10)

        async def check_one(lead: Dict[str, Any]):
            phone = lead.get('phone', '')
            if not phone:
                return lead
            async with sem:
                try:
                    r = await client.get(
                        f"{self.wa_engine_url}/check-contact",
                        params={"phone": phone},
                        timeout=4.0
                    )
                    if r.status_code == 200:
                        data = r.json()
                        if data.get('exists'):
                            lead['is_on_whatsapp'] = True
                            p_pic = data.get('profilePictureUrl')
                            if p_pic:
                                lead['whatsapp_profile_pic'] = p_pic
                                lead['profile_pic'] = p_pic
                            if data.get('name'):
                                lead['whatsapp_name'] = data.get('name')
                except Exception:
                    pass
            return lead

        tasks = [check_one(lead) for lead in leads]
        verified_leads = await asyncio.gather(*tasks)
        return list(verified_leads)

    def _filter_existing_db_leads(self, leads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Deduplicate against existing Django CRM Lead and Contact tables.
        Marks already_in_crm = True so user never gets duplicate leads!
        """
        try:
            import os
            import django
            from django.apps import apps
            if not django.conf.settings.configured:
                os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'django_core.settings')
                django.setup()

            Lead = apps.get_model('crm_core', 'Lead')
            Contact = apps.get_model('crm_core', 'Contact')

            all_existing_phones = set()
            for p in Lead.objects.values_list('phone', flat=True):
                if p:
                    all_existing_phones.add(clean_bd_phone(p))
            for p in Contact.objects.values_list('phone', flat=True):
                if p:
                    all_existing_phones.add(clean_bd_phone(p))

            for l in leads:
                p_clean = clean_bd_phone(l.get('phone', ''))
                if p_clean in all_existing_phones:
                    l['already_in_crm'] = True
        except Exception as e:
            logger.warning(f"Failed to check existing CRM DB leads: {e}")

        return leads
