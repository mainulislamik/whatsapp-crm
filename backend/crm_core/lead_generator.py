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



TARGET_CATEGORY_PROFILES = {
    "Mobile Repair Shop": {
        "aliases": ["mobile repair", "phone servicing", "smartphone repair", "mobile lab", "touch display repair", "servicing shop"],
        "queries": [
            "{city} mobile repair servicing center contact phone",
            "{city} smartphone repair shop whatsapp",
            "{city} mobile touch display replacement facebook",
            "{city} mobile parts servicing lab"
        ],
        "key_features": "সার্ভিসিং টিকেটিং, কাস্টমার জব শিট, টেকনিশিয়ান কমিশন ও পার্টস ইনভেন্টরি ট্র্যাকিং",
        "pitch_template": (
            "আসসালামু আলাইকুম স্যার/ম্যাম!\n\n"
            "আপনার প্রতিষ্ঠান **{shop_name}**-এর মোবাইল রিপেয়ার ও সার্ভিসিং কাজের হিসাব আরও সহজ ও নিখুঁত করতে StockWhisk ERP-তে রয়েছে ডেডিকেটেড ফিচার:\n\n"
            "• **সার্ভিস টিকেটিং ও জব শিট:** কাস্টমার মোবাইল জমা দিলে তাৎক্ষণিক রিসিট মেমো ও ডেলিভারি স্ট্যাটাস ট্র্যাকিং।\n"
            "• **টেকনিশিয়ান কমিশন:** কোন টেকনিশিয়ান কয়টি মোবাইল মেরামত করলেন তার স্বয়ংক্রিয় কাজের কমিশন হিসাব।\n"
            "• **পার্টস ও ডিসপ্লে ইনভেন্টরি:** ব্যাটারি, ডিসপ্লে ও স্পেয়ার পার্টসের নিখুঁত স্টক হিসাব।\n\n"
            "স্পেশাল অফারে মাত্র **৳৪৯৯/মাস**-এ পাচ্ছেন সম্পূর্ণ সফটওয়্যার। ফ্রি ১-অন-১ লাইভ ডেমো দেখতে ভিজিট করুন https://app.stockwhisk.com অথবা আমাদের জানাতে পারেন স্যার!"
        )
    },
    "Battery Shop": {
        "aliases": ["battery shop", "ips battery", "car battery dealer", "solar battery", "hamko battery", "lucas battery", "battery store"],
        "queries": [
            "{city} battery ips shop contact phone",
            "{city} car automobile battery dealer whatsapp",
            "{city} ips solar battery store facebook",
            "{city} hamko rimso lucas battery dealer"
        ],
        "key_features": "ব্যাটারির মডেল ও সিরিয়াল ট্র্যাকিং, ওয়ারেন্টি ম্যানেজমেন্ট, পাইকারি ও খুচরা ইনভয়েস এবং স্টক লেজার",
        "pitch_template": (
            "আসসালামু আলাইকুম স্যার/ম্যাম!\n\n"
            "আপনার প্রতিষ্ঠান **{shop_name}**-এর ব্যাটারি ও আইপিএস ব্যবসার বিক্রয় ও হিসাব পরিচালনার জন্য StockWhisk ERP নিয়ে এসেছে বিশেষ সুবিধা:\n\n"
            "• **ব্যাটারি সিরিয়াল ও ওয়ারেন্টি ট্র্যাকিং:** প্রতিটি ব্যাটারির ইউনিক সিরিয়াল নম্বর দিয়ে ওয়ারেন্টি কার্ড প্রিন্ট ও ক্লেইম ট্র্যাকিং।\n"
            "• **ডিজিটাল ক্যাশ মেমো ও সিরিয়াল ট্র্যাকিং:** ব্যাটারির মডেল ও সিরিয়াল নম্বর দিয়ে দ্রুত ক্যাশ মেমো ও ওয়ারেন্টি ট্র্যাকিং।\n"
            "• **ডিলার ও পাইকারি চালান:** কার্টন ও পিসের দ্রুত পাইকারি চালান ও সরাসরি হোয়াটসঅ্যাপে বাকি খাতার রিমাইন্ডার।\n\n"
            "স্পেশাল অফারে মাত্র **৳৪৯৯/মাস**-এ সফটওয়্যারটি চালু করতে ভিজিট করুন https://app.stockwhisk.com অথবা লাইভ ডেমোর জন্য আমাদের জানাতে পারেন স্যার!"
        )
    },
    "Electronics": {
        "aliases": ["electronics", "gadget", "mobile showroom", "refrigerator tv", "home appliance", "electronics store"],
        "queries": [
            "{city} electronics showroom contact phone",
            "{city} mobile gadget shop whatsapp",
            "{city} home appliance refrigerator tv store facebook",
            "{city} electronics dealer store"
        ],
        "key_features": "৩-লেয়ার IMEI ও সিরিয়াল ট্র্যাকিং, ওয়ারেন্টি মেমো প্রিন্ট ও কিস্তি (EMI) সেলস",
        "pitch_template": (
            "আসসালামু আলাইকুম স্যার/ম্যাম!\n\n"
            "আপনার প্রতিষ্ঠান **{shop_name}**-এর ইলেকট্রনিক্স ও গ্যাজেট শপের জন্য StockWhisk ERP-তে রয়েছে আধুনিক সব ফিচার:\n\n"
            "• **IMEI ও সিরিয়াল ট্র্যাকিং:** প্রতিটি মোবাইল, ল্যাপটপ বা ডিভাইসের ইউনিক IMEI দিয়ে স্টক ও বিলিং।\n"
            "• **ওয়ারেন্টি কার্ড ও সার্ভিস ট্র্যাকিং:** মেমোতে স্বয়ংক্রিয় ওয়ারেন্টি প্রিন্ট ও মেয়াদ ট্র্যাকিং।\n"
            "• **কিস্তি বা ইএমআই (EMI) সেলস:** ডাউন পেমেন্ট, মাসিক কিস্তির শিডিউল ও সরাসরি হোয়াটসঅ্যাপে রিমাইন্ডার ও মেমো ডেলিভারি।\n\n"
            "আমাদের Opening Offer-এ মাত্র **৳৪৯৯/মাস**-এ সম্পূর্ণ সিস্টেম চালু করতে ভিজিট করুন https://app.stockwhisk.com অথবা একটি ফ্রি ১-অন-১ লাইভ ডেমো নিতে পারেন স্যার!"
        )
    },
    "Chemical": {
        "aliases": ["chemical", "industrial chemical", "paint chemical", "textile chemical", "chemical supplier", "chemical store"],
        "queries": [
            "{city} industrial chemical store contact phone",
            "{city} textile chemical supplier whatsapp",
            "{city} raw material chemical dealer facebook",
            "{city} chemical trading company"
        ],
        "key_features": "ড্রাম/কেজি/লিটার ইউনিট কনভার্সন, ব্যাচ নম্বর ট্র্যাকিং ও বড় পাইকারি চালান মেমো",
        "pitch_template": (
            "আসসালামু আলাইকুম স্যার/ম্যাম!\n\n"
            "আপনার প্রতিষ্ঠান **{shop_name}**-এর কেমিক্যাল ও ইন্ডাস্ট্রিয়াল সাপ্লাই ব্যবসার নিখুঁত ইনভেন্টরির জন্য StockWhisk ERP সম্পূর্ণ প্রস্তুত:\n\n"
            "• **মাল্টি-ইউনিট ও কনভার্সন:** ড্রাম, কেজি, লিটার ও কন্টেইনারের স্বয়ংক্রিয় কনভার্সন ও স্টক ট্র্যাকিং।\n"
            "• **ব্যাচ ও লট ট্র্যাকিং:** কেমিক্যালের ব্যাচ নম্বর, গ্রেড ও আমদানির চালান ট্র্যাকিং।\n"
            "• **পাইকারি চালান ও লেজার:** বড় বড় কারখানা ও পার্টির বাকি খাতা, ডেবিট-ক্রেডিট লেজার ও চালান প্রিন্ট।\n\n"
            "স্পেশাল অফারে মাত্র **৳৪৯৯/মাস**-এ সিস্টেমটি চালিয়ে দেখতে ভিজিট করুন https://app.stockwhisk.com অথবা ফ্রি ডেমোর জন্য আমাদের জানাতে পারেন স্যার!"
        )
    },
    "Clothing & Fashion": {
        "aliases": ["clothing", "fashion", "boutique", "garments", "fabric", "sharee", "punjabi", "dress"],
        "queries": [
            "{city} clothing fashion boutique showroom contact whatsapp",
            "{city} garments fabrics dress shop phone",
            "{city} brand wear fashion house store facebook",
            "{city} cloth store market wholesale"
        ],
        "key_features": "সাইজ ও কালার ভ্যারিয়েন্ট স্টক, বারকোড স্ক্যানিং, লো-স্টক ওয়ার্নিং ও হোয়াটসঅ্যাপ বকেয়া রিমাইন্ডার",
        "pitch_template": (
            "আসসালামু আলাইকুম স্যার/ম্যাম!\n\n"
            "আপনার পোশাক প্রতিষ্ঠান **{shop_name}**-এর বিক্রি ও স্টক আধুনিক করতে StockWhisk ERP-তে রয়েছে ক্লাউড সুবিধা:\n\n"
            "• **সাইজ ও রঙ ভ্যারিয়েন্ট ট্র্যাকিং:** কোন ডিজাইনের কোন সাইজ বা কালারের কয়টি পোশাক স্টকে আছে এক ক্লিকে দেখা।\n"
            "• **বারকোড POS ও দ্রুত মেমো:** বারকোড স্ক্যান করে চোখের পলকে ডিজিটাল ক্যাশ মেমো প্রিন্ট।\n"
            "• **বকেয়া রিমাইন্ডার:** সরাসরি কাস্টমারের হোয়াটসঅ্যাপে ডিজিটাল বাকির নোটিফিকেশন পাঠানোর সুবিধা।\n\n"
            "স্পেশাল অফারে মাত্র **৳৪৯৯/মাস**-এ সফটওয়্যারটি চালু করতে ভিজিট করুন https://app.stockwhisk.com অথবা আমাদের জানাতে পারেন স্যার!"
        )
    },
    "Computer & IT": {
        "aliases": ["computer", "laptop", "it accessories", "pc builder", "printer servicing", "cctv camera"],
        "queries": [
            "{city} computer laptop shop contact phone",
            "{city} it solution pc builder store whatsapp",
            "{city} cctv camera security store facebook",
            "{city} computer accessories showroom"
        ],
        "key_features": "সিরিয়াল ও পার্টস ট্র্যাকিং, কোটেশন তৈরি, ওয়ারেন্টি ক্লেইম ও টেকনিশিয়ান কমিশন",
        "pitch_template": (
            "আসসালামু আলাইকুম স্যার/ম্যাম!\n\n"
            "আপনার আইটি প্রতিষ্ঠান **{shop_name}**-এর কম্পিউটার, ল্যাপটপ ও এক্সেসরিজ বিক্রির জন্য StockWhisk ERP-তে রয়েছে ডেডিকেটেড ফিচার:\n\n"
            "• **সিরিয়াল নম্বর ও ওয়ারেন্টি ট্র্যাকিং:** মাদারবোর্ড, র্যাম, গ্রাফিক্স কার্ডের সিরিয়াল ট্র্যাকিং ও ওয়ারেন্টি প্রিন্ট।\n"
            "• **কাস্টম পিসি বিল্ডার ও কোটেশন:** গ্রাহকদের জন্য প্রফেশনাল পিসি বিল্ড কোটেশন ও ইনভয়েস তৈরি।\n"
            "• **সার্ভিসিং ও টেকনিশিয়ান জব শিট:** ডেস্কটপ/ল্যাপটপ মেরামত ট্র্যাকিং ও ডেলিভারি স্ট্যাটাস।\n\n"
            "স্পেশাল অফারে মাত্র **৳৪৯৯/মাস**-এ সফটওয়্যারটি চালু করতে ভিজিট করুন https://app.stockwhisk.com অথবা আমাদের জানাতে পারেন স্যার!"
        )
    },
    "Grocery & Superstore": {
        "aliases": ["grocery", "supershop", "departmental store", "mudir dokan", "confectionery", "food store"],
        "queries": [
            "{city} grocery supershop departmental store contact whatsapp",
            "{city} daily bazaar food store phone",
            "{city} supermarket superstore contact facebook",
            "{city} wholesale grocery trader"
        ],
        "key_features": "বারকোড পিওএস, এক্সপায়ারি ডেট ট্র্যাকিং, মাল্টি-ইউনিট কেজি/লিটার ও দ্রুত ক্যাশ মেমো",
        "pitch_template": (
            "আসসালামু আলাইকুম স্যার/ম্যাম!\n\n"
            "আপনার সুপারশপ বা ডিপার্টমেন্টাল স্টোর **{shop_name}**-এর জন্য StockWhisk ERP নিয়ে এসেছে আল্ট্রা-ফাস্ট পিওএস:\n\n"
            "• **হাই-স্পিড বারকোড বিলিং:** লম্বা লাইন ছাড়াই চোখের পলকে বারকোড স্ক্যান ও মেমো প্রিন্ট।\n"
            "• **এক্সপায়ারি ডেট ও লো-স্টক অ্যালার্ট:** মেয়াদোত্তীর্ণ হওয়ার আগেই পণ্যের ওয়ার্নিং নোটিফিকেশন।\n"
            "• **কেজি, গ্রাম ও পিস কনভার্সন:** ওজন স্কেল ইন্টিগ্রেশন ও ফ্র্যাকশনাল হিসাবের সুবিধা।\n\n"
            "মাত্র **৳৪৯৯/মাস** অফারে সম্পূর্ণ সিস্টেম চালু করতে ভিজিট করুন https://app.stockwhisk.com অথবা আমাদের জানাতে পারেন স্যার!"
        )
    },
    "Pharmacy": {
        "aliases": ["pharmacy", "medicine store", "drug house", "chemist", "pharma"],
        "queries": [
            "{city} pharmacy medicine drug house contact phone",
            "{city} chemist drug store whatsapp",
            "{city} pharmaceutical retailer distributor facebook",
            "{city} medicine corner surgical store"
        ],
        "key_features": "জেনেরিক নাম ও ব্র্যান্ড সার্চ, ব্যাচ/লট এক্সপায়ারি ট্র্যাকিং, পাতা/বক্স ও স্ট্রিপ বিলিং",
        "pitch_template": (
            "আসসালামু আলাইকুম স্যার/ম্যাম!\n\n"
            "আপনার ফার্মেসি **{shop_name}**-এর ওষুধ বিক্রয় ও স্টক ব্যবস্থাপনার জন্য StockWhisk ERP সম্পূর্ণ প্রস্তুত:\n\n"
            "• **বক্স ও পাতা ফ্র্যাকশন সেলস:** পুরো বক্সের সাথে সাথে পাতা ও পিস বিক্রির নিখুঁত স্টক হিসাব।\n"
            "• **ব্যাচ ও এক্সপায়ারি ডেট অ্যালার্ট:** কোন ব্যাচের ওষুধ কবে মেয়াদ শেষ হবে তার আগাম নোটিফিকেশন।\n"
            "• **কোম্পানি পারচেজ লেজার:** স্কয়ার, বেক্সিমকো, রেনেটাসহ সকল কোম্পানির ইনভয়েস ও বাকি খাতা।\n\n"
            "স্পেশাল অফারে মাত্র **৳৪৯৯/মাস**-এ সফটওয়্যারটি চালু করতে ভিজিট করুন https://app.stockwhisk.com অথবা আমাদের জানাতে পারেন স্যার!"
        )
    },
    "Hardware & Sanitary": {
        "aliases": ["hardware", "sanitary", "pipe fittings", "paint store", "electric hardware", "tiles sanitary"],
        "queries": [
            "{city} hardware sanitary pipe store contact whatsapp",
            "{city} electric paint hardware shop phone",
            "{city} tiles sanitary fittings showroom facebook",
            "{city} hardware tools supplier"
        ],
        "key_features": "ফিট, মিটার, কেজি ও পিস হিসাব, বড় ঠিকাদারদের লেজার ও সরাসরি চালান",
        "pitch_template": (
            "আসসালামু আলাইকুম স্যার/ম্যাম!\n\n"
            "আপনার প্রতিষ্ঠান **{shop_name}**-এর হার্ডওয়্যার ও স্যানিটারি ব্যবসার বড় বড় চালান ও হিসাব এখন হবে সহজ:\n\n"
            "• **মাল্টি-ইউনিট মেজারমেন্ট:** ফুট, মিটার, কেজি, বস্তা ও কার্টনের নিখুঁত কনভার্সন হিসাব।\n"
            "• **কন্ট্রাক্টর ও পার্টির বড় বাকি খাতা:** ঠিকাদার ও নিয়মিত গ্রাহকদের ডেবিট-ক্রেডিট হিসাব ও স্টেটমেন্ট।\n"
            "• **সরাসরি হোয়াটসঅ্যাপ রিমাইন্ডার:** গ্রাহকের বকেয়া মেমো হোয়াটসঅ্যাপে সরাসরি সেন্ড।\n\n"
            "স্পেশাল অফারে মাত্র **৳৪৯৯/মাস**-এ চালু করতে ভিজিট করুন https://app.stockwhisk.com অথবা আমাদের জানাতে পারেন স্যার!"
        )
    },
    "Cosmetics & Beauty": {
        "aliases": ["cosmetics", "beauty store", "makeup parlor", "skin care", "perfume shop"],
        "queries": [
            "{city} cosmetics beauty parlour shop contact whatsapp",
            "{city} makeup skin care product showroom phone",
            "{city} authentic cosmetics store facebook",
            "{city} beauty collection outlet"
        ],
        "key_features": "শেড ও ব্র্যান্ড ভ্যারিয়েন্ট ট্র্যাকিং, এক্সপায়ারি অ্যালার্ট ও কাস্টমার ডিসকাউন্ট",
        "pitch_template": (
            "আসসালামু আলাইকুম স্যার/ম্যাম!\n\n"
            "আপনার কসমেটিক্স শপ **{shop_name}**-এর জন্য StockWhisk ERP-তে রয়েছে প্রিমিয়াম রিটেইল ফিচার:\n\n"
            "• **শেড, কালার ও ব্র্যান্ড ট্র্যাকিং:** লিপস্টিক, ফাউন্ডেশনের শেড নম্বর অনুযায়ী নিখুঁত স্টক রাখা।\n"
            "• **বারকোড স্ক্যানিং ও ক্যাশ মেমো:** কসমেটিক্স পণ্যের বারকোড স্ক্যান করে দ্রুত ডিজিটাল ক্যাশ মেমো।\n"
            "• **মেয়াদ ও অরিজিন ট্র্যাকিং:** এক্সপায়ারি ডেট ম্যানেজমেন্ট ও লো-স্টক নোটিফিকেশন।\n\n"
            "স্পেশাল অফারে মাত্র **৳৪৯৯/মাস**-এ সফটওয়্যারটি চালু করতে ভিজিট করুন https://app.stockwhisk.com অথবা আমাদের জানাতে পারেন স্যার!"
        )
    },
    "Wholesale & Distribution": {
        "aliases": ["wholesale", "distributor", "importer", "dealership", "agency"],
        "queries": [
            "{city} wholesale dealer distributor merchant whatsapp",
            "{city} commercial wholesale agency phone",
            "{city} wholesale godown trading company facebook",
            "{city} distribution warehouse supplier"
        ],
        "key_features": "কার্টন ও বস্তা ট্র্যাকিং, সেলস রিপ্রেজেন্টেটিভ অর্ডার বুকিং ও পার্টি লেজার",
        "pitch_template": (
            "আসসালামু আলাইকুম স্যার/ম্যাম!\n\n"
            "আপনার পাইকারি প্রতিষ্ঠান **{shop_name}**-এর জন্য StockWhisk ERP নিয়ে এসেছে পাওয়ারফুল হোলসেল ম্যানেজমেন্ট:\n\n"
            "• **কার্টন, বস্তা ও মাস্টার প্যাক ট্র্যাকিং:** বড় পাইকারি চালান ও প্যাকিং ইউনিট হিসাব।\n"
            "• **পার্টি লেজার ও ক্রেডিট লিমিট:** খুচরা দোকানদারদের বাকির খাতা ও পেমেন্ট হিস্ট্রি।\n"
            "• **গোডাউন স্টক ট্রান্সফার:** একাধিক গোডাউন ও শোরুমের মধ্যে স্টক মুভমেন্ট।\n\n"
            "মাত্র **৳৪৯৯/মাস**-এ সফটওয়্যারটি চালু করতে ভিজিট করুন https://app.stockwhisk.com অথবা আমাদের জানাতে পারেন স্যার!"
        )
    },
    "General Retail": {
        "aliases": ["general store", "retail shop", "departmental", "outlet", "variety store"],
        "queries": [
            "{city} retail store shop showroom contact whatsapp",
            "{city} variety store outlet phone",
            "{city} commercial market retail shop facebook",
            "{city} general trading dealer"
        ],
        "key_features": "অল-ইন-ওয়ান পিওএস, দৈনিক লাভ-ক্ষতি, বাকির খাতা ও ক্লাউড ব্রাউজার এক্সেস",
        "pitch_template": (
            "আসসালামু আলাইকুম স্যার/ম্যাম!\n\n"
            "আপনার প্রতিষ্ঠান **{shop_name}**-এর ব্যবসার দৈনিক বিক্রি, গোডাউন স্টক ও লাভ-ক্ষতি একসাথে আধুনিক উপায়ে পরিচালনা করতে StockWhisk ERP সম্পূর্ণ প্রস্তুত:\n\n"
            "• **বারকোড পিওএস ও ডিজিটাল মেমো:** চোখের পলকে দ্রুত মেমো ও ইনভেন্টরি আপডেট।\n"
            "• **দৈনিক লাভ-ক্ষতি ও স্টক অ্যালার্ট:** কোন পণ্যে কত লাভ হচ্ছে এবং কোন পণ্যের স্টক কম তার স্পষ্ট হিসাব।\n"
            "• **ডিজিটাল বাকির খাতা ও হোয়াটসঅ্যাপ রিমাইন্ডার:** সরাসরি কাস্টমারের হোয়াটসঅ্যাপে বকেয়া রিমাইন্ডার পাঠানোর সুবিধা।\n\n"
            "স্পেশাল অফারে মাত্র **৳৪৯৯/মাস**-এ সিস্টেমটি চালু করতে ভিজিট করুন https://app.stockwhisk.com অথবা আমাদের জানাতে পারেন স্যার!"
        )
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

    def generate_worldwide_search_queries(self, base_query: str, country: str, category: Optional[str] = None) -> List[str]:
        queries = []
        country_info = COUNTRY_METADATA.get(country, COUNTRY_METADATA['GLOBAL'])
        country_name = country_info['name']

        # Check if matching special target profile
        cat_key = category or ""
        if not cat_key:
            for k, v in TARGET_CATEGORY_PROFILES.items():
                if any(alias in base_query.lower() for alias in v["aliases"]):
                    cat_key = k
                    break

        if cat_key in TARGET_CATEGORY_PROFILES:
            profile = TARGET_CATEGORY_PROFILES[cat_key]
            cities = country_info.get('cities', ['Dhaka', 'Chittagong', 'Sylhet'])
            for q_tpl in profile["queries"]:
                for city in cities[:3]:
                    queries.append(q_tpl.format(city=city))
            queries.append(f"{base_query} contact phone")
            queries.append(f"{base_query} whatsapp")
            queries.append(f"{base_query} site:facebook.com")
            return list(dict.fromkeys(queries))
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

        search_queries = self.generate_worldwide_search_queries(query, country, lead_category)
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

                # Determine profile match and suggested pitch
                matched_profile = TARGET_CATEGORY_PROFILES.get(lead_category)
                if not matched_profile:
                    for k, v in TARGET_CATEGORY_PROFILES.items():
                        if any(alias in shop_name.lower() or alias in combined_text.lower() for alias in v["aliases"]):
                            matched_profile = v
                            lead_category = k
                            break

                pitch_tpl = matched_profile["pitch_template"] if matched_profile else (
                    "আসসালামু আলাইকুম স্যার/ম্যাম!\n\n"
                    f"আপনার প্রতিষ্ঠান **{shop_name}**-এর বিক্রয়, ইনভেন্টরি ও বাকির নিখুঁত ডিজিটাল হিসাবের জন্য StockWhisk ERP এখন মাত্র ৪৯৯ টাকায়!\n"
                    "ফ্রি লাইভ ডেমো দেখতে ভিজিট করুন: https://app.stockwhisk.com"
                )
                suggested_pitch = pitch_tpl.format(
                    shop_name=shop_name,
                    owner_or_sir="স্যার"
                )

                # Quality Score
                score = 3
                if is_on_wa:
                    score += 1
                if wa_pic or (emails and len(emails) > 0):
                    score += 1
                quality_tier = "⭐⭐⭐⭐⭐ High Priority" if score >= 5 else ("⭐⭐⭐⭐ Qualified" if score == 4 else "⭐⭐⭐ Standard")

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
                    'quality_score': score,
                    'quality_tier': quality_tier,
                    'suggested_pitch': suggested_pitch,
                    'key_features': matched_profile.get("key_features", "") if matched_profile else "",
                    'scraped_source': 'Concurrent Multi-Engine Search',
                })

                if len(leads) >= limit:
                    break

            return leads
