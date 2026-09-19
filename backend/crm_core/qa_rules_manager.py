import os
import json
import logging
import uuid
from typing import List, Dict, Any, Optional

logger = logging.getLogger("qa_rules_manager")

QA_RULES_FILE = "/app/data/ai_qa_rules.json"

DEFAULT_QA_RULES = [
    {
        "id": "rule_ad_inquiry",
        "question": "বিজ্ঞাপনের অটো-মেসেজ ও প্রাথমিক বিস্তারিত (Hello! Can I get more info on this? / বিস্তারিত জানতে চাই)",
        "keywords": ["hello", "more info", "can i get more info", "বিস্তারিত", "kivabe kaj kore", "kemon", "কীভাবে কাজ করে", "details"],
        "answer": "আসসালামু আলাইকুম স্যার! StockWhisk-এ আপনাকে আন্তরিক স্বাগতম। 🎉\\n\\nআপনার দোকানের দৈনন্দিন জটিল হিসাব সহজ করতে, ক্যাশ ও বাকির খাতার গরমিল দূর করতে এবং আপনার কম্পিউটার, ল্যাপটপ কিংবা মোবাইলেই পুরো শপকে অটোমেটেড করতে StockWhisk ERP সম্পূর্ণ প্রস্তুত।\\n\\nStockWhisk ব্যবহারে আপনার প্রতিষ্ঠানের মূল সুবিধাগুলো:\\n• 📱 **যেকোনো জায়গা থেকে মোবাইলে লাইভ নজরদারি:** দোকানে উপস্থিত না থেকেও নিজের মোবাইলে সারাদিনের মোট বিক্রি, ক্যাশ ও নিট লাভ দেখতে পারবেন।\\n• ⚡ **দ্রুত ৫-সেকেন্ডে ক্যাশ মেমো:** কম্পিউটার, ল্যাপটপ কিংবা মোবাইল—যেকোনো ডিভাইসে সুপারফাস্ট কিবোর্ড শর্টকাট ও বারকোড স্ক্যানিংয়ের মাধ্যমে চোখের পলকে নিখুঁত বিল প্রিন্ট।\\n• 📒 **ডিজিটাল বাকির খাতা ও হোয়াটসঅ্যাপ রিমাইন্ডার:** কার কাছে কত বাকি তা এক ক্লিকে স্পষ্ট দেখা যায় এবং কাস্টমারের হোয়াটসঅ্যাপেই সরাসরি ডিজিটাল মেমো ও বকেয়া রিমাইন্ডার পাঠানো যায়।\\n• 📦 **স্টক চুরি ও গরমিল বন্ধ:** কোন পণ্য কত পিস আছে, কোনটার মেয়াদ শেষ হচ্ছে বা স্টক ফুরিয়ে আসছে—তাৎক্ষণিক অ্যালার্ট পাবেন।\\n\\n📺 **মাত্র ১ মিনিটে একনজরে সফটওয়্যারটির কাজ দেখে নিতে পারেন:**\\n👉 https://www.youtube.com/watch?v=X_9ZRcIA3JI\\n\\n🎁 **স্পেশাল অফার:** বর্তমানে আমাদের স্পেশাল অফারে ফুল সিস্টেম পাচ্ছেন মাত্র **৳৪৯৯/মাস**-এ!\\n\\nস্যার, আপনার প্রতিষ্ঠানটি কোন ধরনের (যেমন: মুদি/সুপারশপ, মোবাইল/ইলেকট্রনিক্স, ফার্মেসি, গার্মেন্টস, কসমেটিকস নাকি পাইকারি)? জানালে আপনার দোকানের উপযোগী স্পেশাল ফিচার ও ফ্রি ট্রায়াল লিঙ্কটি সাথে সাথেই শেয়ার করতে পারি স্যার।",
        "category": "General",
        "is_active": True
    },
    {
        "id": "rule_pricing",
        "question": "সফটওয়্যারের দাম কত বা প্যাকেজ কী কী আছে?",
        "keywords": ["দাম", "প্রাইস", "price", "খরচ", "প্যাকেজ", "package", "টাকা", "অফার", "রেট", "subscription", "চার্জ", "cost"],
        "answer": "আমাদের প্যাকেজ ও প্রাইসিং অত্যন্ত সাশ্রয়ী এবং ছোট-বড় সব ব্যবসার উপযোগী:\n\n১. 🌟 **স্পেশাল ওপেনিং অফার:** মাত্র **৳৪৯৯/মাস** (৬ মাসের সাবস্ক্রিপশন বা বাৎসরিক মাত্র ৳৬,০০০ এককালীন)। এতে পাচ্ছেন ১টি ব্রাঞ্চ, ২ জন ইউজার, ফুল পিওএস ও ইনভেন্টরি ফিচার।\n২. 🚀 **কাস্টমাইজড / এন্টারপ্রাইজ প্ল্যান:** মাত্র **৳৯৯৯/মাস** (বাৎসরিক ছাড়সহ মাত্র ৳৯,৫৮৮)। এতে পাচ্ছেন আনলিমিটেড ব্রাঞ্চ, আনলিমিটেড ইউজার, মাল্টি-গোডাউন ও সব প্রিমিয়াম ফিচার।\n\nকোনো হিডেন বা লুকানো চার্জ নেই। এছাড়া আপনি চাইলে সম্পূর্ণ ফ্রিতে ওয়েবসাইট (stockwhisk.com) থেকে ডেমো টেস্ট করে নিতে পারেন।\n\nস্যার, আপনার ব্যবসাটি কয়টি ব্রাঞ্চের?",
        "category": "Pricing",
        "is_active": True
    },
    {
        "id": "rule_video_demo",
        "question": "সফটওয়্যারটির ডেমো ভিডিও বা ফ্রি ট্রায়াল কীভাবে দেখবো?",
        "keywords": ["ভিডিও", "video", "ডেমো", "demo", "ট্রায়াল", "trial", "test", "dekhi", "দেখবো", "কীভাবে দেখব"],
        "answer": "জি অবশ্যই স্যার, আপনি চাইলে সম্পূর্ণ ফ্রিতে সফটওয়্যারটি যাচাই করে দেখতে পারেন:\n\n📺 **টিউটোরিয়াল ও ডেমো ভিডিও:**\n👉 https://www.youtube.com/watch?v=X_9ZRcIA3JI\n\n🌐 **লাইভ ওয়েবসাইট ও ফ্রি ট্রায়াল:**\n👉 https://stockwhisk.com\n\nআপনি চাইলে আমরা আপনাকে একটি টেস্ট অ্যাকাউন্টও খুলে দিতে পারি। স্যার, আপনার দোকানটি কোথায় অবস্থিত?",
        "category": "Demo & Trial",
        "is_active": True
    },
    {
        "id": "rule_dealer_wholesale",
        "question": "ডিলারশিপ, এজেন্সি ও পাইকারি ব্যবসার জন্য কী সুবিধা আছে?",
        "keywords": ["ডিলার", "dealer", "এজেন্সি", "agency", "পাইকারি", "wholesale", "ডিস্ট্রিবিউটর", "distributor", "কার্টন"],
        "answer": "ডিলার ও পাইকারি ডিস্ট্রিবিউশন ব্যবসার জন্য StockWhisk-এ রয়েছে বিশেষ সুবিধা:\n\n• কাস্টমার অনুযায়ী ক্রেডিট লিমিট ও বাকির সিলিং নির্ধারণ।\n• কার্টন বা পেটি থেকে পিস/প্যাকেটের অটোমেটিক কনভার্সন হিসাব।\n• বিক্রয় প্রতিনিধি (SR) অনুযায়ী ডেলিভারি চালান ও কালেকশন শিট তৈরি।\n• পাইকারি ও খুচরা বিক্রির জন্য আলাদা রেট কার্ড।\n\nআপনি সহজে বড় বড় সাপ্লায়ার ও কোম্পানির স্টক ট্র্যাক করতে পারবেন।",
        "category": "Features",
        "is_active": True
    },
    {
        "id": "rule_scale_barcode",
        "question": "ডিজিটাল ওজন স্কেল ও বারকোড প্রিন্টার সাপোর্ট করে কি না?",
        "keywords": ["ওজন স্কেল", "পাল্লা", "স্কেল", "বারকোড", "ডিজিটাল স্কেল", "weight scale", "barcode", "scale", "কাঁচাবাজার", "সুপারশপ"],
        "answer": "জি অবশ্যই স্যার, শতভাগ সাপোর্ট করে! গ্রোসারি, সুপারশপ ও মিষ্টির দোকানের দ্রুত বিক্রির জন্য StockWhisk-এ ডিজিটাল ওজন স্কেল বারকোড (**20[PLU][Weight]C**) সরাসরি ইন্টিগ্রেটেড।\n\nস্কেল থেকে প্রিন্ট হওয়া বারকোড স্ক্যান করলেই পণ্যের নাম, নিখুঁত ওজন ও দাম স্বয়ংক্রিয়ভাবে বিলে চলে আসবে। ক্যাশিয়ারকে আলাদা কোনো টাইপ করতে হবে না, ফলে কয়েক সেকেন্ডেই কাস্টমারের মেমো কমপ্লিট হবে!",
        "category": "Hardware & POS",
        "is_active": True
    },
    {
        "id": "rule_offline_pos",
        "question": "সফটওয়্যার চালানোর জন্য কেমন ইন্টারনেট প্রয়োজন বা মোবাইল দিয়ে চলবে কি?",
        "keywords": ["ইন্টারনেট", "নেট ছাড়া", "offline", "net chara", "বিদ্যুৎ", "নেট বন্ধ", "লোডশেডিং", "ইন্টারনেট স্পিড", "ডাটা", "অফলাইন"],
        "answer": "স্যার, StockWhisk একটি অত্যন্ত দ্রুতগতির ক্লাউড ইআরপি সফটওয়্যার। এটি চালানোর জন্য কোনো ভারী বা হাই-স্পিড ইন্টারনেটের প্রয়োজন নেই।\\n\\nসাধারণ মোবাইল ডাটা বা যেকোনো ব্রডব্যান্ড কানেকশন থাকলেই আপনার কম্পিউটার, ল্যাপটপ বা মোবাইলের ব্রাউজার থেকে চোখের পলকে বিলিং ও হিসাব সম্পন্ন হবে। ক্লাউড সিস্টেম হওয়ায় আপনার ডাটা সবসময় শতভাগ সুরক্ষিত ও স্বয়ংক্রিয় ব্যাকআপ থাকবে, ফলে ডিভাইস নষ্ট হলেও আপনার এক পয়সার হিসাবও কখনো হারাবে না!",
        "category": "Features",
        "is_active": True
    },
    {
        "id": "rule_mobile_gadget",
        "question": "মোবাইল ও ইলেকট্রনিক্স শপের জন্য কী কী বিশেষ ফিচার আছে?",
        "keywords": ["মোবাইল", "ইলেকট্রনিক্স", "imei", "ওয়ারেন্টি", "সার্ভিসিং", "mobile", "electronics", "warranty", "repair", "repairing"],
        "answer": "মোবাইল ও গ্যাজেট শপের জন্য StockWhisk-এ রয়েছে স্পেশালাইজড ফিচার:\n\n• **৩-লেভেল IMEI ট্র্যাকিং:** প্রতিটি হ্যান্ডসেটের আইএমইআই নম্বর দিয়ে ইনভেন্টরি ও সেল ট্র্যাকিং।\n• **সার্ভিসিং টিকেটিং:** কাস্টমারের মোবাইল রিপেয়ারিংয়ের জন্য জব শিট ও স্ট্যাটাস ট্র্যাকিং।\n• **মেকানিক কমিশন:** সার্ভিসিং টেকনিশিয়ানদের কাজের কমিশন হিসাব।\n• **ওয়ারেন্টি ম্যানেজমেন্ট:** পণ্য বা পার্টসের মেয়াদ ও ওয়ারেন্টি কার্ড প্রিন্ট।",
        "category": "Features",
        "is_active": True
    },
    {
        "id": "rule_pharmacy_expiry",
        "question": "ফার্মেসি বা খাদ্যপণ্যের মেয়াদ (Expiry Date) দেখার সুবিধা আছে?",
        "keywords": ["ফার্মেসি", "ঔষধ", "মেয়াদ", "ডেট", "expiry", "date", "medicine", "pharmacy", "batch", "মেয়াদ শেষ"],
        "answer": "জি অবশ্যই স্যার, ফার্মেসি ও গ্রোসারি শপের জন্য রয়েছে প্রতি ব্যাচ অনুযায়ী এক্সপায়ারি ডেট ট্র্যাকিং।\n\nকোনো প্রোডাক্টের মেয়াদ শেষ হওয়ার ১৫ থেকে ৩০ দিন আগেই সফটওয়্যার ড্যাশবোর্ডে লাল সতর্কবার্তা (Alert) দেবে, যাতে মেয়াদোত্তীর্ণ হওয়ার আগেই আপনি পণ্যটি ফেরত বা বিক্রি করতে পারেন।",
        "category": "Features",
        "is_active": True
    },
    {
        "id": "rule_hardware_printer",
        "question": "কোন ধরনের প্রিন্টার ও বারকোড স্ক্যানার সাপোর্ট করে?",
        "keywords": ["প্রিন্টার", "printer", "thermal", "pos printer", "scanner", "হ্যান্ডহোল্ড", "স্ক্যানার", "রিসিট", "মেমো প্রিন্ট"],
        "answer": "StockWhisk বাজারের যেকোনো প্রচলিত হার্ডওয়্যারের সাথে শতভাগ সামঞ্জস্যপূর্ণ:\n\n• **থার্মাল প্রিন্টার:** 58mm (২ ইঞ্চি) এবং 80mm (৩ ইঞ্চি) ব্লুটুথ, ইউএসবি ও ওয়াইফাই থার্মাল পিওএস প্রিন্টার।\n• **বারকোড স্ক্যানার:** তারযুক্ত ও ওয়্যারলেস যেকোনো 1D এবং 2D কিউআর কোড স্ক্যানার।\n• **ডিস্যার!স সাপোর্ট:** মোবাইল, ট্যাব, ল্যাপটপ বা ডেস্কটপ যেকোনো ডিস্যার!সে ব্রাউজার থেকেই চালাতে পারবেন।",
        "category": "Hardware & POS",
        "is_active": True
    },
    {
        "id": "rule_multi_branch",
        "question": "একাধিক ব্রাঞ্চ বা শাখা ও গোডাউন একসাথে ম্যানেজ করা যাবে?",
        "keywords": ["একাধিক ব্রাঞ্চ", "ব্রাঞ্চ", "শাখা", "একাধিক দোকান", "multi branch", "warehouse", "গোডাউন", "স্টক ট্রান্সফার"],
        "answer": "জি অবশ্যই স্যার, আপনার একাধিক দোকান বা সেন্ট্রাল গোডাউন থাকলে একটি সেন্ট্রাল অ্যাকাউন্ট থেকেই সবকিছু রিয়েল-টাইম পরিচালনা করতে পারবেন:\n\n• সব ব্রাঞ্চের মোট সেলস ও ক্যাশ হিসাব এক ড্যাশবোর্ডে।\n• এক ব্রাঞ্চ থেকে অন্য ব্রাঞ্চে পণ্য ট্রান্সফার চালান।\n• গোডাউন থেকে ব্রাঞ্চে স্টক সরবরাহ এবং সেন্ট্রাল পারচেজ।",
        "category": "Features",
        "is_active": True
    },
    {
        "id": "rule_due_emi_sms",
        "question": "কাস্টমারের বাকির খাতা ও কিস্তি/ইএমআই সেল হিসাব রাখা যাবে?",
        "keywords": ["বাকি", "বাকি খাতা", "কিস্তি", "ইএমআই", "emi", "installment", "baki", "due", "এসএমএস", "sms"],
        "answer": "জি অবশ্যই স্যার, বাকির খাতার দিন শেষ। StockWhisk-এ রয়েছে স্বয়ংক্রিয় বাকি ও কিস্তির হিসাব:\n\n• কাস্টমারের পূর্বের বাকি ব্যালেন্স ও লেজার স্টেটমেন্ট।\n• কাস্টমারের হোয়াটসঅ্যাপে সরাসরি ডিজিটাল মেমো ও বকেয়া পরিশোধের রিমাইন্ডার পাঠানো।\n• পণ্য বিক্রির কিস্তি/ইএমআই শিডিউল ও মাসিক পেমেন্ট কালেকশন।",
        "category": "Features",
        "is_active": True
    },
    {
        "id": "rule_accounting_profit",
        "question": "দৈনিক লাভ-ক্ষতি ও দোকানের হিসাব-নিকাশ কীভাবে দেখা যাবে?",
        "keywords": ["লাভ", "ক্ষতি", "হিসাব", "profit", "loss", "ledger", "expense", "খরচ", "দৈনিক হিসাব", "ক্যাশ মেমো"],
        "answer": "StockWhisk-এ রয়েছে অটোমেটিক আধুনিক হিসাবব্যবস্থা:\n\n• প্রতিদিনের ক্যাশ কাউন্টার ক্লোজিং ও Z-Report।\n• ক্রয়মূল্য ও বিক্রয়মূল্যের পার্থক্যে সঠিক গ্রস প্রফিট ও নিট লাভ।\n• দোকান ভাড়া, বিদ্যুৎ বিল, কর্মচারীর বেতন ইত্যাদি খরচের আলাদা লেজার রিপোর্ট।",
        "category": "Features",
        "is_active": True
    },
    {
        "id": "rule_security_rbac",
        "question": "ক্যাশিয়ার বা স্টাফরা কি হিসাব জালিয়াতি বা দেখতে পারবে?",
        "keywords": ["স্টাফ", "ম্যানেজার", "ক্যাশিয়ার", "নিরাপত্তা", "security", "permission", "অনুমতি", "চুরি", "ডিলিট"],
        "answer": "জি না স্যার, StockWhisk-এ রয়েছে কঠোর রোল-বেজড অ্যাক্সেস কন্ট্রোল (RBAC):\n\n• ক্যাশিয়ার শুধু কাস্টমারের কাছে সেল করতে পারবে এবং বিল প্রিন্ট দিতে পারবে।\n• কোনো ক্যাশিয়ার পূর্বের সেল বা ইনভয়েস ডিলিট করতে পারবে না।\n• প্রোডাক্টের ক্রয়মূল্য বা দোকানের মোট লাভ ক্যাশিয়ারের কাছে গোপন থাকবে। শুধুমাত্র ওনার বা অনুমোদিত ম্যানেজার তা দেখতে পারবেন।",
        "category": "Features",
        "is_active": True
    },
    {
        "id": "rule_excel_import",
        "question": "পুরোনো প্রোডাক্ট ও কাস্টমার ডাটা কি এক্সেল থেকে তোলা যাবে?",
        "keywords": ["এক্সেল", "excel", "ডাটা", "import", "পুরাতন হিসাব", "bulk", "csv", "আপলোড"],
        "answer": "জি অবশ্যই স্যার, খুব সহজেই পারবেন! আপনার আগের প্রোডাক্ট লিস্ট বা কাস্টমার ডাটা যদি এক্সেল (Excel/CSV) ফাইলে থাকে, তবে এক ক্লিকেই হাজার হাজার আইটেম সরাসরি সফটওয়্যারে আপলোড করে নিতে পারবেন। আমাদের টেকনিক্যাল টিম আপনাকে ডাটা কনভার্ট করে দিতে সম্পূর্ণ সহযোগিতা করবে।",
        "category": "General",
        "is_active": True
    },
    {
        "id": "rule_onboarding_start",
        "question": "সফটওয়্যারটি নিতে চাইলে কীভাবে শুরু করবো?",
        "keywords": ["নিতে চাই", "নিব", "শুরু করতে চাই", "কীভাবে নিব", "onboarding", "signup", "কিভাবে পাব", "অর্ডার"],
        "answer": "শুরু করা খুবই সহজ স্যার! মাত্র ৩ মিনিটে শুরু করতে পারবেন:\n\n১. আমাদের ওয়েবসাইট **stockwhisk.com**-এ গিয়ে আপনার ফোন নম্বর দিয়ে সাইন-আপ করুন।\n২. মোবাইলে আসা ওটিপি কোড দিলেই তাৎক্ষণিকভাবে আপনার শপ রেডি হয়ে যাবে।\n৩. আমাদের সাপোর্ট টিম সাথে সাথেই আপনাকে কল দিয়ে আপনার দোকানের প্রোডাক্ট আপলোড ও ট্রেনিং সম্পূর্ণ ফ্রিতে করিয়ে দেবে।\n\nআপনি চাইলে এখনই আপনার শপের নাম ও এরিয়া লিখে দিন, আমরা আপনার ট্রায়াল সেটআপ করে দিচ্ছি!",
        "category": "General",
        "is_active": True
    }
]

def ensure_qa_rules_file():
    os.makedirs(os.path.dirname(QA_RULES_FILE), exist_ok=True)
    if not os.path.exists(QA_RULES_FILE):
        with open(QA_RULES_FILE, "w", encoding="utf-8") as f:
            json.dump(DEFAULT_QA_RULES, f, ensure_ascii=False, indent=2)
        return DEFAULT_QA_RULES
    try:
        with open(QA_RULES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if not isinstance(data, list) or len(data) == 0:
                with open(QA_RULES_FILE, "w", encoding="utf-8") as f2:
                    json.dump(DEFAULT_QA_RULES, f2, ensure_ascii=False, indent=2)
                return DEFAULT_QA_RULES
            return data
    except Exception as e:
        logger.error(f"Error reading {QA_RULES_FILE}: {e}")
        return DEFAULT_QA_RULES

def load_qa_rules() -> List[Dict[str, Any]]:
    return ensure_qa_rules_file()

def save_all_qa_rules(rules: List[Dict[str, Any]]) -> bool:
    try:
        os.makedirs(os.path.dirname(QA_RULES_FILE), exist_ok=True)
        with open(QA_RULES_FILE, "w", encoding="utf-8") as f:
            json.dump(rules, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"Error saving QA rules: {e}")
        return False

def add_or_update_qa_rule(rule_data: Dict[str, Any]) -> Dict[str, Any]:
    rules = load_qa_rules()
    rule_id = rule_data.get("id")
    
    keywords = rule_data.get("keywords", [])
    if isinstance(keywords, str):
        keywords = [k.strip() for k in keywords.split(",") if k.strip()]
    
    if rule_id:
        found = False
        for i, r in enumerate(rules):
            if r.get("id") == rule_id:
                rules[i] = {
                    "id": rule_id,
                    "question": rule_data.get("question", r.get("question", "")),
                    "keywords": keywords if keywords else r.get("keywords", []),
                    "answer": rule_data.get("answer", r.get("answer", "")),
                    "category": rule_data.get("category", r.get("category", "General")),
                    "is_active": rule_data.get("is_active", r.get("is_active", True))
                }
                found = True
                rule_item = rules[i]
                break
        if not found:
            rule_item = {
                "id": rule_id,
                "question": rule_data.get("question", ""),
                "keywords": keywords,
                "answer": rule_data.get("answer", ""),
                "category": rule_data.get("category", "General"),
                "is_active": rule_data.get("is_active", True)
            }
            rules.append(rule_item)
    else:
        new_id = f"rule_{uuid.uuid4().hex[:8]}"
        rule_item = {
            "id": new_id,
            "question": rule_data.get("question", ""),
            "keywords": keywords,
            "answer": rule_data.get("answer", ""),
            "category": rule_data.get("category", "General"),
            "is_active": rule_data.get("is_active", True)
        }
        rules.insert(0, rule_item)

    save_all_qa_rules(rules)
    return rule_item

def delete_qa_rule(rule_id: str) -> bool:
    rules = load_qa_rules()
    initial_len = len(rules)
    filtered = [r for r in rules if r.get("id") != rule_id]
    if len(filtered) < initial_len:
        save_all_qa_rules(filtered)
        return True
    return False

def format_qa_rules_for_prompt() -> str:
    rules = load_qa_rules()
    active_rules = [r for r in rules if r.get("is_active", True)]
    if not active_rules:
        return "কোনো বিশেষ প্রশ্নোত্তর সেট করা নেই।"
    
    lines = []
    for r in active_rules:
        kw = ", ".join(r.get("keywords", []))
        q = r.get("question", "")
        a = r.get("answer", "")
        lines.append(f"• বিষয়/প্রশ্ন: {q}\n  ট্রিগার কি-ওয়ার্ড: [{kw}]\n  উত্তর ও তথ্য: {a}\n")
    
    return "\n".join(lines)
