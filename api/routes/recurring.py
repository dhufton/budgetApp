from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from statistics import mean, pstdev
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.auth import get_current_user
from src.supabase_client import supabase_admin

router = APIRouter()

_CADENCE_DAYS = {
    "weekly": 7,
    "biweekly": 14,
    "monthly": 30,
}


class RecomputeRequest(BaseModel):
    lookback_months: int = Field(default=12, ge=1, le=36)
    min_occurrences: int = Field(default=3, ge=2, le=24)
    account_id: str = "all"


class UpdateRecurringRequest(BaseModel):
    status: Optional[str] = None
    category: Optional[str] = None


def _validate_account_scope(user_id: str, account_id: str) -> str:
    scope = account_id or "all"
    if scope == "all":
        return scope
    account = (
        supabase_admin.table("accounts")
        .select("id")
        .eq("id", scope)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not account.data:
        raise HTTPException(status_code=400, detail="Invalid account")
    return scope


def _parse_date(value: str | date) -> date:
    if isinstance(value, date):
        return value
    return datetime.strptime(str(value), "%Y-%m-%d").date()


def _clean_display_name(description: str) -> str:
    if not description:
        return "Unknown"
    text = str(description).replace("\r", "\n")
    first_line = next((line.strip() for line in text.split("\n") if line.strip()), "")
    cleaned = first_line or text.strip()
    cleaned = re.sub(r"\s*\|\s*.*$", "", cleaned)
    cleaned = re.sub(
        r"\b(Purchase|Payment|Direct Debit|Standing Order|Card Purchase|Card Payment)\b",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -")
    return cleaned or first_line or "Unknown"


def _merchant_key(display_name: str) -> str:
    key = re.sub(r"[^a-zA-Z0-9 ]", "", display_name.lower())
    key = re.sub(r"\s+", " ", key).strip()
    return key[:120] or "unknown"


def _classify_cadence(sorted_dates: List[date]) -> Tuple[str, Optional[int]]:
    if len(sorted_dates) < 2:
        return "irregular", None

    intervals = [
        (sorted_dates[idx] - sorted_dates[idx - 1]).days
        for idx in range(1, len(sorted_dates))
    ]
    median = sorted(intervals)[len(intervals) // 2]

    if 6 <= median <= 8:
        return "weekly", _CADENCE_DAYS["weekly"]
    if 13 <= median <= 16:
        return "biweekly", _CADENCE_DAYS["biweekly"]
    if 26 <= median <= 35:
        return "monthly", _CADENCE_DAYS["monthly"]
    return "irregular", None


def _confidence_score(dates: List[date], amounts: List[float], cadence_days: Optional[int]) -> float:
    occ = len(dates)
    if occ == 0:
        return 0.0

    occ_score = min(35.0, occ * 4.5)

    intervals = []
    if len(dates) >= 2:
        intervals = [(dates[idx] - dates[idx - 1]).days for idx in range(1, len(dates))]

    if cadence_days and intervals:
        mean_dev = mean(abs(i - cadence_days) for i in intervals)
        interval_score = max(0.0, 35.0 - mean_dev * 3.0)
    elif intervals:
        interval_score = max(0.0, 18.0 - pstdev(intervals) * 2.5)
    else:
        interval_score = 5.0

    abs_amounts = [abs(a) for a in amounts if a is not None]
    if len(abs_amounts) >= 2 and mean(abs_amounts) > 0:
        cv = pstdev(abs_amounts) / mean(abs_amounts)
        if cv <= 0.15:
            amount_score = 25.0
        elif cv <= 0.35:
            amount_score = 15.0
        else:
            amount_score = 8.0
    else:
        amount_score = 10.0

    score = occ_score + interval_score + amount_score
    return round(max(5.0, min(99.0, score)), 1)


def _fetch_transactions_for_recurrence(user_id: str, account_scope: str, lookback_months: int) -> List[dict]:
    today = date.today()
    lookback_start = today - timedelta(days=lookback_months * 31)

    query = (
        supabase_admin.table("transactions")
        .select("id,account_id,date,description,amount,category")
        .eq("user_id", user_id)
        .lt("amount", 0)
        .gte("date", lookback_start.isoformat())
        .order("date", desc=False)
    )
    if account_scope != "all":
        query = query.eq("account_id", account_scope)
    result = query.execute()
    return result.data or []


@router.post("/recurring/recompute")
async def recompute_recurring(request: RecomputeRequest, user_id: str = Depends(get_current_user)):
    account_scope = _validate_account_scope(user_id, request.account_id)

    txns = _fetch_transactions_for_recurrence(user_id, account_scope, request.lookback_months)
    txns = [t for t in txns if t.get("account_id") and t.get("category") != "Transfer"]

    grouped: Dict[Tuple[str, str], List[dict]] = defaultdict(list)
    for txn in txns:
        display_name = _clean_display_name(txn.get("description", ""))
        key = _merchant_key(display_name)
        grouped[(txn["account_id"], key)].append({**txn, "_display_name": display_name})

    existing_result = (
        supabase_admin.table("recurring_rules")
        .select("id,account_id,merchant_key,status")
        .eq("user_id", user_id)
        .execute()
    )
    existing_map = {
        (row.get("account_id"), row.get("merchant_key")): row
        for row in (existing_result.data or [])
    }

    upsert_rows = []
    rules_created = 0
    rules_updated = 0

    for (account_id, merchant_key), items in grouped.items():
        if len(items) < request.min_occurrences:
            continue

        dates = sorted(_parse_date(item["date"]) for item in items)
        amounts = [float(item.get("amount") or 0) for item in items]
        categories = [item.get("category") or "Uncategorized" for item in items]
        display_names = [item.get("_display_name") or "Unknown" for item in items]

        cadence, cadence_days = _classify_cadence(dates)
        confidence = _confidence_score(dates, amounts, cadence_days)

        next_expected = None
        if cadence_days:
            next_expected = dates[-1] + timedelta(days=cadence_days)

        most_common_display = Counter(display_names).most_common(1)[0][0]
        non_uncategorized = [c for c in categories if c != "Uncategorized"]
        dominant_category = Counter(non_uncategorized or categories).most_common(1)[0][0]

        average_amount = round(abs(mean(amounts)), 2)
        existing = existing_map.get((account_id, merchant_key))
        status = existing.get("status") if existing else "active"

        upsert_rows.append(
            {
                "user_id": user_id,
                "account_id": account_id,
                "merchant_key": merchant_key,
                "display_name": most_common_display,
                "category": dominant_category,
                "cadence": cadence,
                "average_amount": average_amount,
                "confidence": confidence,
                "occurrence_count": len(items),
                "last_seen_date": dates[-1].isoformat(),
                "next_expected_date": next_expected.isoformat() if next_expected else None,
                "status": status,
                "updated_at": datetime.utcnow().isoformat(),
            }
        )
        if existing:
            rules_updated += 1
        else:
            rules_created += 1

    if upsert_rows:
        supabase_admin.table("recurring_rules").upsert(
            upsert_rows,
            on_conflict="user_id,account_id,merchant_key",
        ).execute()

    return {
        "rules_created": rules_created,
        "rules_updated": rules_updated,
        "scanned_transactions": len(txns),
    }


@router.get("/recurring")
async def list_recurring(
    status: str = "active",
    include_upcoming: bool = True,
    account_id: str = "all",
    user_id: str = Depends(get_current_user),
):
    account_scope = _validate_account_scope(user_id, account_id)

    query = (
        supabase_admin.table("recurring_rules")
        .select("id,merchant_key,display_name,category,cadence,average_amount,confidence,last_seen_date,next_expected_date,status,account_id,occurrence_count")
        .eq("user_id", user_id)
        .order("next_expected_date", desc=False)
        .order("confidence", desc=True)
    )
    if status in {"active", "ignored"}:
        query = query.eq("status", status)
    if account_scope != "all":
        query = query.eq("account_id", account_scope)

    result = query.execute()
    rules = result.data or []

    if include_upcoming:
        today = date.today()
        for row in rules:
            next_date = row.get("next_expected_date")
            if next_date:
                try:
                    due_in = (_parse_date(next_date) - today).days
                except Exception:
                    due_in = None
                row["due_in_days"] = due_in

    return {"rules": rules}


@router.patch("/recurring/{rule_id}")
async def update_recurring_rule(rule_id: str, request: UpdateRecurringRequest, user_id: str = Depends(get_current_user)):
    updates = {}
    if request.status is not None:
        if request.status not in {"active", "ignored"}:
            raise HTTPException(status_code=400, detail="status must be active or ignored")
        updates["status"] = request.status
    if request.category is not None:
        updates["category"] = request.category

    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    updates["updated_at"] = datetime.utcnow().isoformat()

    result = (
        supabase_admin.table("recurring_rules")
        .update(updates)
        .eq("id", rule_id)
        .eq("user_id", user_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Recurring rule not found")

    return {"success": True, "rule": result.data[0]}


@router.get("/recurring/upcoming")
async def upcoming_recurring(
    days: int = 30,
    account_id: str = "all",
    user_id: str = Depends(get_current_user),
):
    days = max(1, min(days, 180))
    account_scope = _validate_account_scope(user_id, account_id)

    start = date.today()
    end = start + timedelta(days=days)

    query = (
        supabase_admin.table("recurring_rules")
        .select("id,display_name,next_expected_date,average_amount,category,confidence,account_id")
        .eq("user_id", user_id)
        .eq("status", "active")
        .gte("next_expected_date", start.isoformat())
        .lte("next_expected_date", end.isoformat())
        .order("next_expected_date", desc=False)
    )
    if account_scope != "all":
        query = query.eq("account_id", account_scope)

    result = query.execute()
    rows = result.data or []

    items = [
        {
            "rule_id": row["id"],
            "display_name": row.get("display_name"),
            "expected_date": row.get("next_expected_date"),
            "expected_amount": row.get("average_amount"),
            "category": row.get("category"),
            "confidence": row.get("confidence"),
            "account_id": row.get("account_id"),
        }
        for row in rows
    ]
    return {"items": items}
