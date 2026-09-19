import os
import json
import logging
import uuid
from typing import List, Dict, Any, Optional

logger = logging.getLogger("qa_rules_manager")

QA_RULES_FILE = "/app/data/ai_qa_rules.json"

DEFAULT_QA_RULES = [
    {
        "id": "rule_pricing",
        "question": "সফটওয়্যারের দাম কত বা প্যাকেজ কী কী আছে?",
        "keywords": ["দাম", "প্রাইস", "price", "খরচ", "প্যাকেজ", "package", "টাকা", "অফার", "রেট", "cost"],
        "answer": "আমাদের বর্তমান স্পেশাল ওপেনিং অফার মাত্র ৳৪৯৯/মাস (৬ মাসের সাবস্ক্রিপশনে বা বাৎসরিক ৳৬,০০০)। এতে পাচ্ছেন ১টি ব্রাঞ্চ, ২ জন ইউজার ও ফুল পিওএস ফিচার। এছাড়া বড় ব্যবসা ও আনলিমিটেড ব্রাঞ্চের জন্য এন্টারপ্রাইজ প্ল্যান মাত্র ৳৯৯৯/মাস। সম্পূর্ণ ফ্রিতে ডেমো দেখার সুবিধাও রয়েছে।",
        "category": "Pricing",
        "is_active": True
    },
    {
        "id": "rule_scale",
        "question": "ডিজিটাল ওজন স্কেল ও বারকোড প্রিন্টার সাপোর্ট করে কি না?",
        "keywords": ["ওজন স্কেল", "পাল্লা", "স্কেল", "বারকোড", "ডিজিটাল স্কেল", "weight scale", "barcode", "scale"],
        "answer": "জি ভাই, একশো ভাগ সাপোর্ট করে! গ্রোসারি, সুপারশপ ও মিষ্টির দোকানের জন্য আমাদের সফটওয়্যারে ডিজিটাল ওজন স্কেল বারকোড (20[PLU][Weight]C) সরাসরি ইন্টিগ্রেটেড। স্কেল থেকে প্রিন্ট হওয়া বারকোড স্ক্যান করলেই পণ্যের সঠিক ওজন ও দাম স্বয়ংক্রিয়ভাবে ক্যাশ মেমোতে চলে আসে।",
        "category": "Hardware & POS",
        "is_active": True
    },
    {
        "id": "rule_offline",
        "question": "ইন্টারনেট না থাকলে কি সেল করা যাবে (অফলাইন মোড)?",
        "keywords": ["ইন্টারনেট না থাকলে", "অফলাইন", "নেট ছাড়া", "offline", "net chara", "internet bondho", "কারেন্ট গেলে"],
        "answer": "জি ভাই, ইন্টারনেট না থাকলেও আপনার দোকানের ক্যাশ কাউন্টার ও বিক্রি বন্ধ থাকবে না! StockWhisk-এ রয়েছে লোকাল ব্রাউজার অফলাইন পিওএস সুবিধা। নেট চলে গেলেও নিয়মিত বিল ও রসিদ প্রিন্ট করতে পারবেন, আবার নেট কানেকশন আসলে সব ডাটা স্বয়ংক্রিয়ভাবে সেন্ট্রাল সার্ভারে সিঙ্ক হয়ে যাবে।",
        "category": "Features",
        "is_active": True
    },
    {
        "id": "rule_mobile_electronics",
        "question": "মোবাইল ও ইলেকট্রনিক্স শপের জন্য কী কী ফিচার আছে?",
        "keywords": ["মোবাইল", "ইলেকট্রনিক্স", "imei", "আইএমইআই", "ওয়ারেন্টি", "সার্ভিসিং", "mobile", "electronics", "warranty"],
        "answer": "মোবাইল ও ইলেকট্রনিক্স ব্যবসার জন্য রয়েছে স্পেশাল ৩-লেভেল আইএমইআই (IMEI) ট্র্যাকিং, কাস্টমার সার্ভিসিং ও রিপেয়ারিং টিকেটিং, মেকানিক কমিশন এবং পার্টস ও প্রোডাক্ট ওয়ারেন্টি ম্যানেজমেন্টের সম্পূর্ণ সুবিধা।",
        "category": "Features",
        "is_active": True
    },
    {
        "id": "rule_demo",
        "question": "সফটওয়্যারটি কীভাবে দেখব বা ফ্রি ডেমো টেস্ট করার উপায় কী?",
        "keywords": ["ডেমো", "ট্রায়াল", "টেস্ট", "demo", "trial", "check", "kivabe dekhbo", "কিভাবে দেখব", "ফ্রি"],
        "answer": "জি ভাই, আপনি চাইলে সম্পূর্ণ ফ্রিতে আমাদের সফটওয়্যারটি টেস্ট করে দেখতে পারেন! আমাদের ওয়েবসাইট stockwhisk.com-এ গিয়ে সরাসরি লাইভ ডেমো দেখে নিতে পারেন, অথবা আপনি চাইলে আমরা আপনাকে একটি ফ্রি ট্রায়াল অ্যাকাউন্ট তৈরি করে দিতে পারি।",
        "category": "Demo & Trial",
        "is_active": True
    },
    {
        "id": "rule_pharmacy",
        "question": "ফার্মেসি বা ওষুধের মেয়াদ (Expiry Date) ট্র্যাকিং সুবিধা আছে?",
        "keywords": ["ফার্মেসি", "ওষুধ", "মেয়াদ", "ডেট", "expiry", "date", "medicine", "pharmacy", "ব্যাচ"],
        "answer": "জি ভাই! ব্যাচ অনুযায়ী ওষুধের ম্যানুফ্যাকচারিং ও এক্সপায়ারি ডেট ট্র্যাক করা যায়। কোনো পণ্যের মেয়াদ শেষ হওয়ার আগেই সফটওয়্যার আপনাকে স্বয়ংক্রিয় লাল সতর্কবার্তা (Alert) দেবে যাতে মেয়াদোত্তীর্ণ পণ্য বিক্রি না হয়।",
        "category": "Features",
        "is_active": True
    },
    {
        "id": "rule_due_emi",
        "question": "বাকির খাতা ও কিস্তিতে (EMI) বিক্রির সুবিধা আছে কি না?",
        "keywords": ["বাকি", "বাকি খাতা", "কিস্তি", "ইএমআই", "emi", "installment", "baki", "due", "দেনা", "পাওনা"],
        "answer": "জি ভাই! কাস্টমারের বাকির হিসাব, স্বয়ংক্রিয় এসএমএস রিমাইন্ডার এবং কিস্তি বা ইএমআই (EMI) বিক্রির সম্পূর্ণ ব্যবস্থা রয়েছে। ডাউন পেমেন্ট, প্রতি কিস্তির তারিখ ও বকেয়া হিসাব সফটওয়্যারে পরিষ্কারভাবে লিপিবদ্ধ থাকে।",
        "category": "Features",
        "is_active": True
    },
    {
        "id": "rule_multibranch",
        "question": "আমার একাধিক দোকান বা ব্রাঞ্চ থাকলে কীভাবে পরিচালনা করব?",
        "keywords": ["একাধিক ব্রাঞ্চ", "ব্রাঞ্চ", "শাখা", "একাধিক দোকান", "multi branch", "warehouse", "গোডাউন", "ওয়্যারহাউজ"],
        "answer": "জি ভাই! আপনার একাধিক ব্রাঞ্চ বা ওয়্যারহাউজ থাকলে একটি সেন্ট্রাল অ্যাডমিন ড্যাশবোর্ড থেকেই সব ব্রাঞ্চের লাইভ সেলস, ইনভেন্টরি ও ক্যাশ হিসাব দেখতে পারবেন এবং এক ব্রাঞ্চ থেকে অন্য ব্রাঞ্চে নিমেষেই স্টক ট্রান্সফার করতে পারবেন।",
        "category": "Features",
        "is_active": True
    }
]

def load_qa_rules() -> List[Dict[str, Any]]:
    if not os.path.exists(QA_RULES_FILE):
        save_qa_rules(DEFAULT_QA_RULES)
        return DEFAULT_QA_RULES
    try:
        with open(QA_RULES_FILE, "r", encoding="utf-8") as f:
            rules = json.load(f)
            if not isinstance(rules, list) or len(rules) == 0:
                save_qa_rules(DEFAULT_QA_RULES)
                return DEFAULT_QA_RULES
            return rules
    except Exception as e:
        logger.error(f"Error reading QA rules: {e}")
        return DEFAULT_QA_RULES

def save_qa_rules(rules: List[Dict[str, Any]]):
    try:
        os.makedirs(os.path.dirname(QA_RULES_FILE), exist_ok=True)
        tmp = f"{QA_RULES_FILE}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(rules, f, ensure_ascii=False, indent=2)
        os.replace(tmp, QA_RULES_FILE)
    except Exception as e:
        logger.error(f"Error saving QA rules: {e}")

def add_or_update_qa_rule(rule_data: Dict[str, Any]) -> Dict[str, Any]:
    rules = load_qa_rules()
    rule_id = rule_data.get("id")
    if not rule_id:
        rule_id = f"rule_{uuid.uuid4().hex[:8]}"
        rule_data["id"] = rule_id

    # normalize keywords
    raw_kw = rule_data.get("keywords", [])
    if isinstance(raw_kw, str):
        keywords = [k.strip() for k in raw_kw.split(",") if k.strip()]
    else:
        keywords = [str(k).strip() for k in raw_kw if str(k).strip()]
    rule_data["keywords"] = keywords

    updated = False
    for i, r in enumerate(rules):
        if r.get("id") == rule_id:
            rules[i] = {**r, **rule_data}
            updated = True
            break

    if not updated:
        rules.insert(0, rule_data)

    save_qa_rules(rules)
    return rule_data

def delete_qa_rule(rule_id: str) -> bool:
    rules = load_qa_rules()
    initial_len = len(rules)
    rules = [r for r in rules if r.get("id") != rule_id]
    if len(rules) < initial_len:
        save_qa_rules(rules)
        return True
    return False

def format_qa_rules_for_prompt() -> str:
    rules = load_qa_rules()
    active_rules = [r for r in rules if r.get("is_active", True)]
    if not active_rules:
        return ""
    
    lines = []
    for idx, r in enumerate(active_rules, 1):
        q = r.get("question", "")
        kw = ", ".join(r.get("keywords", []))
        a = r.get("answer", "")
        lines.append(f"{idx}. প্রশ্ন/টপিক: {q}\n   কি-ওয়ার্ড: [{kw}]\n   নির্ধারিত উত্তর/তথ্য: {a}")
    return "\n\n".join(lines)
