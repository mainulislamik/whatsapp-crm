import os
import json
import logging
import uuid
import re
from datetime import datetime
from typing import List, Dict, Any, Optional

from asgiref.sync import sync_to_async

logger = logging.getLogger("learning_engine")

LEARNED_SUGGESTIONS_FILE = "/app/data/ai_learned_suggestions.json"
CUSTOMER_MEMORIES_FILE = "/app/data/customer_memories.json"

# -------------------------------------------------------------
# 1. Storage Helpers
# -------------------------------------------------------------

def _load_json(file_path: str, default_val: Any) -> Any:
    if not os.path.exists(file_path):
        return default_val
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading {file_path}: {e}")
        return default_val

def _save_json(file_path: str, data: Any) -> bool:
    try:
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"Error saving {file_path}: {e}")
        return False

# -------------------------------------------------------------
# 2. Customer Long-Term Memory
# -------------------------------------------------------------

def get_customer_memory(phone: str) -> Dict[str, Any]:
    data = _load_json(CUSTOMER_MEMORIES_FILE, {})
    return data.get(str(phone), {})

def save_customer_memory(phone: str, memory_dict: Dict[str, Any]) -> bool:
    data = _load_json(CUSTOMER_MEMORIES_FILE, {})
    phone_str = str(phone)
    existing = data.get(phone_str, {})
    existing.update(memory_dict)
    existing["updated_at"] = datetime.now().isoformat()
    data[phone_str] = existing
    return _save_json(CUSTOMER_MEMORIES_FILE, data)

def format_customer_memory_for_prompt(phone: str) -> str:
    mem = get_customer_memory(phone)
    if not mem:
        return "গ্রাহকের কোনো পূর্ববর্তী বিশেষ স্মৃতি বা প্রেফারেন্স সংরক্ষিত নেই।"
    
    parts = []
    if mem.get("shop_name"):
        parts.append(f"দোকান: {mem['shop_name']}")
    if mem.get("owner_name"):
        parts.append(f"মালিক: {mem['owner_name']}")
    if mem.get("business_type"):
        parts.append(f"ব্যবসা: {mem['business_type']}")
    if mem.get("location"):
        parts.append(f"এলাকা: {mem['location']}")
    if mem.get("key_interests"):
        parts.append(f"আগ্রহী বিষয়: {mem['key_interests']}")
    if mem.get("last_topic"):
        parts.append(f"পূর্ববর্তী আলোচনার বিষয়: {mem['last_topic']}")
    if mem.get("special_notes"):
        parts.append(f"বিশেষ নোট: {mem['special_notes']}")

    if not parts:
        return "গ্রাহকের সাধারণ প্রোফাইল ছাড়া বিশেষ কোনো স্মৃতি নেই।"
    
    return " | ".join(parts)

async def update_customer_memory_from_chat(
    phone: str,
    sender_name: str,
    user_message: str,
    ai_or_human_reply: str = ""
):
    """
    Analyzes interaction and incrementally enriches the long-term customer memory.
    """
    from crm_core.ai_bot import call_llm
    
    current_mem = get_customer_memory(phone)
    current_json = json.dumps(current_mem, ensure_ascii=False)
    
    prompt = f"""
You are a Long-Term Customer Memory Engine for StockWhisk WhatsApp CRM.
Analyze the new chat exchange and update the customer's permanent memory profile.
DO NOT remove existing facts unless contradicted. Keep values concise in Bengali or English.

Customer Phone: {phone}
Sender Name: {sender_name}
Existing Memory: {current_json}

New Customer Message: "{user_message}"
Reply Given: "{ai_or_human_reply}"

Return ONLY valid JSON with keys:
{{
  "shop_name": "detected shop name or keep existing",
  "owner_name": "detected owner name or keep existing",
  "business_type": "Grocery / Mobile / Pharmacy / Clothing / Wholesale / Dealer / etc or keep existing",
  "location": "district or city or market or keep existing",
  "key_interests": "concise summary of products/features customer asked about (e.g. scale barcode, price, multi branch)",
  "last_topic": "what was discussed in this exchange",
  "special_notes": "any special deals or specific customer requests mentioned"
}}
"""
    try:
        res = await call_llm([
            {"role": "system", "content": "You extract and maintain structured customer memory. Output JSON only."},
            {"role": "user", "content": prompt}
        ])
        clean = re.sub(r"```json|```", "", res).strip()
        parsed = json.loads(clean)
        
        # Merge with existing
        merged = dict(current_mem)
        for k, v in parsed.items():
            if v and str(v).strip():
                merged[k] = str(v).strip()
        
        save_customer_memory(phone, merged)
        logger.info(f"Updated long-term memory for customer {phone}: {merged.get('shop_name')}")
    except Exception as e:
        logger.warning(f"Error updating customer memory for {phone}: {e}")

# -------------------------------------------------------------
# 3. AI Learned Suggestions (Continuous Learning Engine)
# -------------------------------------------------------------

def get_learned_suggestions() -> List[Dict[str, Any]]:
    return _load_json(LEARNED_SUGGESTIONS_FILE, [])

def save_learned_suggestions(suggestions: List[Dict[str, Any]]) -> bool:
    return _save_json(LEARNED_SUGGESTIONS_FILE, suggestions)

def add_learned_suggestion(suggestion: Dict[str, Any]) -> Dict[str, Any]:
    items = get_learned_suggestions()
    
    # Check if a very similar question already exists in suggestions
    q_new = suggestion.get("question", "").strip().lower()
    for item in items:
        if item.get("question", "").strip().lower() == q_new:
            # Update existing
            item.update(suggestion)
            item["updated_at"] = datetime.now().isoformat()
            save_learned_suggestions(items)
            return item
    
    new_id = f"sug_{uuid.uuid4().hex[:8]}"
    item = {
        "id": new_id,
        "question": suggestion.get("question", ""),
        "keywords": suggestion.get("keywords", []),
        "answer": suggestion.get("answer", ""),
        "category": suggestion.get("category", "General"),
        "source": suggestion.get("source", "auto_learned"),
        "confidence": suggestion.get("confidence", 0.9),
        "customer_query_sample": suggestion.get("customer_query_sample", ""),
        "created_at": datetime.now().isoformat()
    }
    items.insert(0, item)
    save_learned_suggestions(items)
    return item

def dismiss_suggestion(suggestion_id: str) -> bool:
    items = get_learned_suggestions()
    initial_len = len(items)
    filtered = [i for i in items if i.get("id") != suggestion_id]
    if len(filtered) < initial_len:
        save_learned_suggestions(filtered)
        return True
    return False

def approve_suggestion(suggestion_id: str) -> Optional[Dict[str, Any]]:
    from crm_core.qa_rules_manager import add_or_update_qa_rule
    
    items = get_learned_suggestions()
    found = None
    remaining = []
    for i in items:
        if i.get("id") == suggestion_id:
            found = i
        else:
            remaining.append(i)
            
    if not found:
        return None
    
    # Add to active QA rules
    rule_data = {
        "question": found.get("question", ""),
        "keywords": found.get("keywords", []),
        "answer": found.get("answer", ""),
        "category": found.get("category", "General"),
        "is_active": True
    }
    created_rule = add_or_update_qa_rule(rule_data)
    save_learned_suggestions(remaining)
    logger.info(f"Approved suggestion {suggestion_id} into QA rule {created_rule.get('id')}")
    return created_rule

# -------------------------------------------------------------
# 4. Learning from Future Human Agent Takeover Replies
# -------------------------------------------------------------

async def observe_human_reply(
    phone: str,
    human_reply_text: str,
    previous_customer_text: str
):
    """
    Called whenever an operator/human agent sends a message.
    Extracts high-value Q&A patterns that the AI can learn from.
    """
    if not human_reply_text or len(human_reply_text.strip()) < 10:
        return
    if not previous_customer_text or len(previous_customer_text.strip()) < 3:
        return

    from crm_core.ai_bot import call_llm
    from crm_core.qa_rules_manager import load_qa_rules

    existing_rules = load_qa_rules()
    existing_questions = [r.get("question") for r in existing_rules]

    prompt = f"""
An operator just replied to a WhatsApp customer inquiry for StockWhisk ERP.
Determine if this interaction contains a valuable Question & Answer pattern that the AI should learn.

Customer Query: "{previous_customer_text}"
Operator's Reply: "{human_reply_text}"

Existing Q&A Questions already covered:
{json.dumps(existing_questions, ensure_ascii=False, indent=2)}

If the operator's reply provides useful factual information, pricing, feature explanation, or handling of a customer question NOT already fully answered by existing rules, extract a clean Q&A suggestion.
If it is just a casual greeting (like "ok", "আসছি", "ধন্যবাদ") or personal chat, set "should_learn": false.

Return valid JSON ONLY:
{{
  "should_learn": true/false,
  "question": "Clear, general formulation of the customer question in Bengali",
  "keywords": ["3 to 6 triggering keywords in Bengali and English"],
  "answer": "Polite, complete, professional answer in Bengali incorporating the operator's explanation",
  "category": "Pricing / Features / Hardware & POS / Demo & Trial / General"
}}
"""
    try:
        res = await call_llm([
            {"role": "system", "content": "You analyze customer service replies and create reusable Q&A knowledge rules."},
            {"role": "user", "content": prompt}
        ])
        clean = re.sub(r"```json|```", "", res).strip()
        data = json.loads(clean)
        
        if data.get("should_learn"):
            suggestion = add_learned_suggestion({
                "question": data.get("question"),
                "keywords": data.get("keywords", []),
                "answer": data.get("answer"),
                "category": data.get("category", "General"),
                "source": "live_human_reply",
                "customer_query_sample": previous_customer_text,
                "confidence": 0.95
            })
            logger.info(f"Auto-learned new suggestion from human reply: {suggestion.get('id')}")
    except Exception as e:
        logger.warning(f"Error in observe_human_reply: {e}")

# -------------------------------------------------------------
# 5. Historical Chat Mining Pass
# -------------------------------------------------------------

async def mine_historical_chats(sample_limit: int = 40) -> Dict[str, Any]:
    """
    Scans past ChatMessage database entries to find recurring customer questions and draft learned suggestions.
    """
    from crm_core.models import ChatMessage
    from crm_core.ai_bot import call_llm
    from crm_core.qa_rules_manager import load_qa_rules

    def _fetch_messages():
        qs = ChatMessage.objects.filter(is_from_me=False).order_by("-timestamp")[:sample_limit]
        return [m.message_text.strip() for m in qs if m.message_text and len(m.message_text.strip()) > 4]

    messages = await sync_to_async(_fetch_messages)()
    if not messages:
        return {"mined_count": 0, "suggestions": []}

    # Deduplicate
    unique_msgs = list(set(messages))
    
    existing_rules = load_qa_rules()
    existing_summary = [{"q": r.get("question"), "kw": r.get("keywords")} for r in existing_rules]

    prompt = f"""
Analyze the following list of real WhatsApp messages received from prospective and current customers of StockWhisk ERP.
Identify real customer questions, objections, or feature requests that are NOT already adequately addressed by the existing Q&A rules.

Existing Q&A Rules:
{json.dumps(existing_summary, ensure_ascii=False, indent=2)}

Real Customer Messages:
{json.dumps(unique_msgs[:30], ensure_ascii=False, indent=2)}

Synthesize up to 3 high-value, realistic, new Q&A rules that would help the AI answer similar inquiries in the future.
Return valid JSON ONLY in this format:
{{
  "suggestions": [
    {{
      "question": "Concise Bengali title of the question",
      "keywords": ["keyword1", "keyword2", "keyword3"],
      "answer": "Accurate, polite, professional Bengali answer representing StockWhisk ERP capabilities",
      "category": "Pricing / Features / Hardware & POS / Demo & Trial / General",
      "customer_query_sample": "Exact quote or close variation from customer messages"
    }}
  ]
}}
"""
    try:
        res = await call_llm([
            {"role": "system", "content": "You are an AI Knowledge Miner extracting reusable FAQ rules from customer chat logs."},
            {"role": "user", "content": prompt}
        ])
        clean = re.sub(r"```json|```", "", res).strip()
        data = json.loads(clean)
        created = []
        for s in data.get("suggestions", []):
            s["source"] = "historical_chat_mining"
            s["confidence"] = 0.90
            new_sug = add_learned_suggestion(s)
            created.append(new_sug)
        
        return {"mined_count": len(created), "suggestions": created}
    except Exception as e:
        logger.error(f"Error in mine_historical_chats: {e}")
        return {"error": str(e), "mined_count": 0, "suggestions": []}
