import os
import json
import logging
import psycopg2
from datetime import datetime
from typing import Dict, Any, List, Optional

logger = logging.getLogger("reg_db_manager")

CUSTOM_REG_FILE = "/app/data/reg_custom_info.json"
STOCKWHISK_DB_URL = os.environ.get(
    "STOCKWHISK_DB_URL",
    "postgresql://stockwhisk:stockwhisk_password@stockwhisk_updated-db-1:5432/stockwhisk"
)

def load_custom_reg_data() -> Dict[str, Any]:
    if not os.path.exists(CUSTOM_REG_FILE):
        return {"by_shop_id": {}, "by_phone": {}, "manual_entries": []}
    try:
        with open(CUSTOM_REG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading custom reg file: {e}")
        return {"by_shop_id": {}, "by_phone": {}, "manual_entries": []}

def save_custom_reg_data(data: Dict[str, Any]):
    os.makedirs(os.path.dirname(CUSTOM_REG_FILE), exist_ok=True)
    temp_file = f"{CUSTOM_REG_FILE}.tmp"
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(temp_file, CUSTOM_REG_FILE)

def get_all_shops_with_custom(search: str = "", plan_filter: str = "", status_filter: str = "") -> Dict[str, Any]:
    custom_data = load_custom_reg_data()
    by_shop_id = custom_data.get("by_shop_id", {})
    manual_entries = custom_data.get("manual_entries", [])

    db_shops = []
    try:
        conn = psycopg2.connect(STOCKWHISK_DB_URL, connect_timeout=3)
        cur = conn.cursor()
        cur.execute("""
            SELECT s.id, s.name, s.slug, s.business_type, s.phone, s.email, s.address, 
                   s.is_active, s.created_at, s.trial_ends_at,
                   p.name as plan_name, p.tier as plan_tier
            FROM tenants_shop s
            LEFT JOIN tenants_subscriptionplan p ON s.plan_id = p.id
            ORDER BY s.id DESC;
        """)
        rows = cur.fetchall()
        for r in rows:
            shop_id = str(r[0])
            c_info = by_shop_id.get(shop_id, {})
            db_shops.append({
                "id": r[0],
                "name": r[1] or "",
                "slug": r[2] or "",
                "business_type": r[3] or "",
                "phone": r[4] or "",
                "email": r[5] or "",
                "address": r[6] or "",
                "is_active": bool(r[7]),
                "created_at": r[8].isoformat() if r[8] else None,
                "trial_ends_at": r[9].isoformat() if r[9] else None,
                "plan_name": r[10] or "Standard",
                "plan_tier": r[11] or "active",
                "is_manual": False,
                "custom_notes": c_info.get("custom_notes", ""),
                "ai_instructions": c_info.get("ai_instructions", ""),
                "custom_whatsapp_phone": c_info.get("custom_whatsapp_phone", ""),
                "tags": c_info.get("tags", []),
                "customized": bool(c_info.get("custom_notes") or c_info.get("ai_instructions") or c_info.get("custom_whatsapp_phone"))
            })
        conn.close()
    except Exception as e:
        logger.error(f"Error querying tenants_shop: {e}")

    # Add manual entries
    all_shops = []
    for m in manual_entries:
        all_shops.append({
            "id": m.get("id"),
            "name": m.get("name") or m.get("shop_name", ""),
            "slug": m.get("slug", ""),
            "business_type": m.get("business_type", ""),
            "phone": m.get("phone", ""),
            "email": m.get("email", ""),
            "address": m.get("address", ""),
            "is_active": m.get("is_active", True),
            "created_at": m.get("created_at"),
            "trial_ends_at": m.get("trial_ends_at"),
            "plan_name": m.get("plan_name", "Customized"),
            "plan_tier": m.get("plan_tier", "enterprise"),
            "is_manual": True,
            "custom_notes": m.get("custom_notes", ""),
            "ai_instructions": m.get("ai_instructions", ""),
            "custom_whatsapp_phone": m.get("custom_whatsapp_phone", ""),
            "tags": m.get("tags", ["Manual Entry"]),
            "customized": True
        })

    all_shops.extend(db_shops)

    # Filter
    filtered = []
    s_term = search.lower().strip()
    for s in all_shops:
        if s_term:
            match = (
                s_term in s["name"].lower() or
                s_term in (s["phone"] or "").lower() or
                s_term in (s["custom_whatsapp_phone"] or "").lower() or
                s_term in (s["email"] or "").lower() or
                s_term in (s["business_type"] or "").lower() or
                s_term in (s["custom_notes"] or "").lower()
            )
            if not match:
                continue

        if plan_filter and plan_filter.lower() != "all":
            if plan_filter.lower() not in (s["plan_name"] or "").lower():
                continue

        if status_filter and status_filter.lower() != "all":
            if status_filter == "active" and not s["is_active"]:
                continue
            if status_filter == "inactive" and s["is_active"]:
                continue
            if status_filter == "manual" and not s["is_manual"]:
                continue

        filtered.append(s)

    stats = {
        "total_shops": len(all_shops),
        "active_shops": sum(1 for s in all_shops if s["is_active"]),
        "db_shops": len(db_shops),
        "manual_shops": len(manual_entries),
        "customized_count": sum(1 for s in all_shops if s.get("customized"))
    }

    return {"shops": filtered, "stats": stats}

def get_all_pending_with_custom() -> List[Dict[str, Any]]:
    pending = []
    try:
        conn = psycopg2.connect(STOCKWHISK_DB_URL, connect_timeout=3)
        cur = conn.cursor()
        cur.execute("""
            SELECT id, shop_name, owner_name, email, phone, business_type, created_at
            FROM accounts_pendingregistration
            ORDER BY id DESC;
        """)
        for r in cur.fetchall():
            pending.append({
                "id": r[0],
                "shop_name": r[1] or "",
                "owner_name": r[2] or "",
                "email": r[3] or "",
                "phone": r[4] or "",
                "business_type": r[5] or "",
                "created_at": r[6].isoformat() if r[6] else None
            })
        conn.close()
    except Exception as e:
        logger.error(f"Error querying accounts_pendingregistration: {e}")
    return pending

def update_shop_custom_info(shop_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    custom_data = load_custom_reg_data()
    by_shop_id = custom_data.setdefault("by_shop_id", {})
    by_phone = custom_data.setdefault("by_phone", {})

    entry = by_shop_id.setdefault(str(shop_id), {})
    entry["custom_notes"] = data.get("custom_notes", "")
    entry["ai_instructions"] = data.get("ai_instructions", "")
    entry["custom_whatsapp_phone"] = data.get("custom_whatsapp_phone", "")
    entry["tags"] = data.get("tags", [])
    entry["updated_at"] = datetime.utcnow().isoformat()

    phone = data.get("custom_whatsapp_phone") or data.get("phone")
    if phone:
        import re
        clean_p = re.sub(r'\D', '', phone)
        if clean_p:
            by_phone[clean_p] = str(shop_id)

    save_custom_reg_data(custom_data)
    return {"success": True, "shop_id": shop_id, "data": entry}

def add_or_update_manual_shop(data: Dict[str, Any]) -> Dict[str, Any]:
    custom_data = load_custom_reg_data()
    manual_entries = custom_data.setdefault("manual_entries", [])
    by_phone = custom_data.setdefault("by_phone", {})

    manual_id = data.get("id")
    if not manual_id:
        import uuid
        manual_id = f"manual_{int(datetime.utcnow().timestamp())}"
        data["id"] = manual_id
        data["created_at"] = datetime.utcnow().isoformat()
        manual_entries.append(data)
    else:
        for i, m in enumerate(manual_entries):
            if m.get("id") == manual_id:
                data["updated_at"] = datetime.utcnow().isoformat()
                manual_entries[i] = data
                break
        else:
            manual_entries.append(data)

    phone = data.get("phone") or data.get("custom_whatsapp_phone")
    if phone:
        import re
        clean_p = re.sub(r'\D', '', phone)
        if clean_p:
            by_phone[clean_p] = manual_id

    save_custom_reg_data(custom_data)
    return {"success": True, "manual_id": manual_id, "data": data}

def delete_manual_shop(manual_id: str) -> bool:
    custom_data = load_custom_reg_data()
    manual_entries = custom_data.setdefault("manual_entries", [])
    initial_len = len(manual_entries)
    custom_data["manual_entries"] = [m for m in manual_entries if m.get("id") != manual_id]
    if len(custom_data["manual_entries"]) < initial_len:
        save_custom_reg_data(custom_data)
        return True
    return False
