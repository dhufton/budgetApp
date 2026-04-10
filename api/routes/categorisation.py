from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.auth import get_current_user
from api.dependencies import get_groq_service
from api.groq_service import GroqService
from api.routes.categories import apply_user_keywords
from api.transfer_rules import apply_transfer_classification
from src.config import BUILTIN_CATEGORIES, CATEGORY_RULES
from src.supabase_client import supabase_admin

router = APIRouter()
logger = logging.getLogger(__name__)

DEFAULT_THRESHOLD = 85.0
AUTO_APPLY_CAP = 200
SENSITIVE_CATEGORY_NAMES = {"Transfer", "Rent", "Mortgage", "Taxes"}
SENSITIVE_KEYWORDS = ("rent", "mortgage", "tax", "hmrc", "council tax")


class SuggestRequest(BaseModel):
    account_id: str = "all"
    threshold: float = Field(default=DEFAULT_THRESHOLD, ge=0, le=100)


class ApproveRequest(BaseModel):
    suggestion_ids: List[str]


class OverrideRequest(BaseModel):
    suggestion_id: str
    final_category: str


class RejectRequest(BaseModel):
    suggestion_ids: List[str]


class AcceptHighConfidenceRequest(BaseModel):
    account_id: str = "all"
    threshold: float = Field(default=DEFAULT_THRESHOLD, ge=0, le=100)


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


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _is_sensitive(description: str, category: str) -> bool:
    if category in SENSITIVE_CATEGORY_NAMES:
        return True
    description_l = (description or "").lower()
    return any(keyword in description_l for keyword in SENSITIVE_KEYWORDS)


def _log_event(user_id: str, account_id: str | None, run_id: str | None, event_type: str, payload: Dict[str, Any]) -> None:
    try:
        supabase_admin.table("categorisation_events").insert(
            {
                "user_id": user_id,
                "account_id": account_id,
                "run_id": run_id,
                "event_type": event_type,
                "payload": payload,
            }
        ).execute()
    except Exception as e:
        logger.warning("categorisation_events insert failed: %r", e)


def _get_available_categories(user_id: str) -> List[str]:
    custom_result = (
        supabase_admin.table("categories")
        .select("category")
        .eq("user_id", user_id)
        .execute()
    )

    categories = set(BUILTIN_CATEGORIES)
    categories.add("Transfer")
    categories.add("Uncategorized")

    for row in (custom_result.data or []):
        category = row.get("category")
        if category:
            categories.add(category)

    return sorted(categories)


def _fetch_uncategorised_transactions(user_id: str, account_scope: str) -> List[Dict[str, Any]]:
    query = (
        supabase_admin.table("transactions")
        .select("id, account_id, date, description, amount, category")
        .eq("user_id", user_id)
        .eq("category", "Uncategorized")
        .order("date", desc=True)
    )
    if account_scope != "all":
        query = query.eq("account_id", account_scope)
    result = query.execute()
    return result.data or []


def _save_learning_if_eligible(user_id: str, description: str, category: str, confidence: float) -> None:
    if not description or not category or category == "Uncategorized":
        return
    if confidence < 70:
        return
    try:
        supabase_admin.table("learned_rules").upsert(
            {
                "user_id": user_id,
                "description": description,
                "category": category,
                "updated_at": _now_iso(),
            },
            on_conflict="user_id,description",
        ).execute()
        supabase_admin.table("vendor_categories").upsert(
            {
                "vendor_name": description,
                "category": category,
                "updated_at": _now_iso(),
            },
            on_conflict="vendor_name",
        ).execute()
    except Exception as e:
        logger.warning("learning upsert failed for description=%s: %r", description, e)


def _apply_builtin_keyword_rules(transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deterministic pass using built-in keyword rules before AI suggestions."""
    for txn in transactions:
        if txn.get("category") != "Uncategorized":
            continue
        description = str(txn.get("description", "")).upper()
        for category, keywords in CATEGORY_RULES.items():
            if category == "Transfer":
                continue
            for keyword in keywords:
                if str(keyword).upper() in description:
                    txn["category"] = category
                    break
            if txn.get("category") != "Uncategorized":
                break
    return transactions


def _apply_transaction_category(user_id: str, transaction_id: str, category: str) -> None:
    supabase_admin.table("transactions").update({"category": category}).eq("id", transaction_id).eq("user_id", user_id).execute()


def _insert_suggestions(rows: List[Dict[str, Any]]) -> None:
    if not rows:
        return
    supabase_admin.table("categorisation_suggestions").insert(rows).execute()


def _fetch_pending_suggestions(user_id: str, account_scope: str, limit: int = 200) -> List[Dict[str, Any]]:
    query = (
        supabase_admin.table("categorisation_suggestions")
        .select("id,run_id,transaction_id,suggested_category,confidence,reason,status,model_name,created_at,account_id")
        .eq("user_id", user_id)
        .eq("status", "pending")
        .order("created_at", desc=True)
        .limit(max(1, min(limit, 500)))
    )
    if account_scope != "all":
        query = query.eq("account_id", account_scope)
    suggestions = query.execute().data or []
    if not suggestions:
        return []

    transaction_ids = [row["transaction_id"] for row in suggestions if row.get("transaction_id")]
    tx_result = (
        supabase_admin.table("transactions")
        .select("id,description,amount,date,category,account_id")
        .in_("id", transaction_ids)
        .eq("user_id", user_id)
        .execute()
    )
    tx_map = {row["id"]: row for row in (tx_result.data or [])}

    merged = []
    for suggestion in suggestions:
        tx = tx_map.get(suggestion.get("transaction_id"), {})
        merged.append(
            {
                **suggestion,
                "transaction": tx,
            }
        )
    return merged


@router.post("/categorise/suggest")
async def suggest_categories(
    request: SuggestRequest,
    user_id: str = Depends(get_current_user),
    groq: GroqService = Depends(get_groq_service),
):
    account_scope = _validate_account_scope(user_id, request.account_id)
    threshold = float(request.threshold)
    run_id = str(uuid4())
    started_at = datetime.utcnow()

    uncategorised = _fetch_uncategorised_transactions(user_id, account_scope)
    if not uncategorised:
        return {
            "run_id": run_id,
            "uncategorised_total": 0,
            "suggested_total": 0,
            "auto_applied": 0,
            "needs_review": 0,
            "failed": 0,
            "needs_review_items": [],
        }

    # Pre-pass with deterministic rules.
    uncategorised = apply_user_keywords(uncategorised, user_id)
    uncategorised = _apply_builtin_keyword_rules(uncategorised)
    uncategorised = apply_transfer_classification(uncategorised)

    available_categories = _get_available_categories(user_id)

    auto_applied = 0
    failed = 0
    suggestion_rows: List[Dict[str, Any]] = []
    needs_review_items: List[Dict[str, Any]] = []
    tx_by_id = {t["id"]: t for t in uncategorised}

    for txn in uncategorised:
        if txn.get("category") != "Uncategorized":
            # Rule-based direct resolution: treat as high-confidence auto apply.
            try:
                _apply_transaction_category(user_id, txn["id"], txn["category"])
                auto_applied += 1
                _save_learning_if_eligible(user_id, txn.get("description", ""), txn["category"], 100)
                suggestion_rows.append(
                    {
                        "run_id": run_id,
                        "user_id": user_id,
                        "account_id": txn.get("account_id"),
                        "transaction_id": txn["id"],
                        "suggested_category": txn["category"],
                        "final_category": txn["category"],
                        "confidence": 100,
                        "reason": "Matched user keyword/transfer rule",
                        "status": "auto_applied",
                        "model_name": "rules",
                        "updated_at": _now_iso(),
                    }
                )
            except Exception as e:
                failed += 1
                logger.warning("rule auto-apply failed for txn=%s: %r", txn.get("id"), e)

    to_model = [t for t in uncategorised if t.get("category") == "Uncategorized"]
    ai_suggestions: List[Dict[str, Any]] = []
    if to_model:
        ai_suggestions = groq.suggest_transaction_categories(to_model, available_categories)

    auto_apply_remaining = AUTO_APPLY_CAP
    for suggestion in ai_suggestions:
        tx_id = suggestion.get("transaction_id")
        txn = tx_by_id.get(tx_id)
        if not txn:
            continue

        suggested_category = suggestion.get("suggested_category") or "Uncategorized"
        confidence = float(suggestion.get("confidence") or 0)
        reason = suggestion.get("reason") or ""

        should_auto_apply = (
            suggested_category != "Uncategorized"
            and confidence >= threshold
            and not _is_sensitive(txn.get("description", ""), suggested_category)
            and auto_apply_remaining > 0
        )

        status = "pending"
        final_category = None

        if should_auto_apply:
            try:
                _apply_transaction_category(user_id, tx_id, suggested_category)
                _save_learning_if_eligible(user_id, txn.get("description", ""), suggested_category, confidence)
                auto_applied += 1
                auto_apply_remaining -= 1
                status = "auto_applied"
                final_category = suggested_category
            except Exception as e:
                failed += 1
                logger.warning("ai auto-apply failed for txn=%s: %r", tx_id, e)

        row = {
            "run_id": run_id,
            "user_id": user_id,
            "account_id": txn.get("account_id"),
            "transaction_id": tx_id,
            "suggested_category": suggested_category,
            "final_category": final_category,
            "confidence": max(0.0, min(100.0, confidence)),
            "reason": reason,
            "status": status,
            "model_name": suggestion.get("model_name") or "groq",
            "updated_at": _now_iso(),
        }
        suggestion_rows.append(row)

        if status == "pending":
            needs_review_items.append(
                {
                    "suggestion": row,
                    "transaction": {
                        "id": txn.get("id"),
                        "description": txn.get("description"),
                        "amount": txn.get("amount"),
                        "date": txn.get("date"),
                        "account_id": txn.get("account_id"),
                    },
                }
            )

    _insert_suggestions(suggestion_rows)

    duration_ms = int((datetime.utcnow() - started_at).total_seconds() * 1000)
    payload = {
        "uncategorised_total": len(uncategorised),
        "suggested_total": len(suggestion_rows),
        "auto_applied": auto_applied,
        "needs_review": len(needs_review_items),
        "failed": failed,
        "threshold": threshold,
        "duration_ms": duration_ms,
    }
    _log_event(user_id, None if account_scope == "all" else account_scope, run_id, "categorise_suggest", payload)

    logger.info(
        "categorise_suggest_complete user_id=%s account_scope=%s run_id=%s uncategorised_total=%s suggested_total=%s auto_applied=%s needs_review=%s failed=%s duration_ms=%s",
        user_id,
        account_scope,
        run_id,
        len(uncategorised),
        len(suggestion_rows),
        auto_applied,
        len(needs_review_items),
        failed,
        duration_ms,
    )

    return {
        "run_id": run_id,
        **payload,
        "needs_review_items": needs_review_items,
    }


@router.get("/categorise/review-queue")
async def get_review_queue(
    account_id: str = "all",
    limit: int = 100,
    user_id: str = Depends(get_current_user),
):
    account_scope = _validate_account_scope(user_id, account_id)
    items = _fetch_pending_suggestions(user_id, account_scope, limit=limit)
    return {"items": items, "count": len(items)}


@router.post("/categorise/approve")
async def approve_suggestions(request: ApproveRequest, user_id: str = Depends(get_current_user)):
    suggestion_ids = [sid for sid in request.suggestion_ids if sid]
    if not suggestion_ids:
        raise HTTPException(status_code=400, detail="No suggestion_ids provided")

    suggestions = (
        supabase_admin.table("categorisation_suggestions")
        .select("id,transaction_id,suggested_category,confidence,reason,status")
        .eq("user_id", user_id)
        .in_("id", suggestion_ids)
        .execute()
    ).data or []

    changed = 0
    for suggestion in suggestions:
        if suggestion.get("status") != "pending":
            continue
        tx_result = (
            supabase_admin.table("transactions")
            .select("id,description")
            .eq("id", suggestion["transaction_id"])
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not tx_result.data:
            continue
        tx = tx_result.data[0]
        final_category = suggestion.get("suggested_category") or "Uncategorized"
        _apply_transaction_category(user_id, tx["id"], final_category)
        _save_learning_if_eligible(user_id, tx.get("description", ""), final_category, float(suggestion.get("confidence") or 0))
        (
            supabase_admin.table("categorisation_suggestions")
            .update({
                "status": "approved",
                "final_category": final_category,
                "updated_at": _now_iso(),
            })
            .eq("id", suggestion["id"])
            .eq("user_id", user_id)
            .execute()
        )
        changed += 1

    _log_event(user_id, None, None, "categorise_approve", {"requested": len(suggestion_ids), "changed": changed})
    return {"success": True, "requested": len(suggestion_ids), "changed": changed}


@router.post("/categorise/override")
async def override_suggestion(request: OverrideRequest, user_id: str = Depends(get_current_user)):
    suggestion_result = (
        supabase_admin.table("categorisation_suggestions")
        .select("id,transaction_id,status")
        .eq("id", request.suggestion_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not suggestion_result.data:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    suggestion = suggestion_result.data[0]

    tx_result = (
        supabase_admin.table("transactions")
        .select("id,description")
        .eq("id", suggestion["transaction_id"])
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not tx_result.data:
        raise HTTPException(status_code=404, detail="Transaction not found")

    tx = tx_result.data[0]
    _apply_transaction_category(user_id, tx["id"], request.final_category)
    _save_learning_if_eligible(user_id, tx.get("description", ""), request.final_category, 90)

    (
        supabase_admin.table("categorisation_suggestions")
        .update({
            "status": "overridden",
            "final_category": request.final_category,
            "updated_at": _now_iso(),
        })
        .eq("id", request.suggestion_id)
        .eq("user_id", user_id)
        .execute()
    )

    _log_event(user_id, None, None, "categorise_override", {"suggestion_id": request.suggestion_id})
    return {"success": True}


@router.post("/categorise/reject")
async def reject_suggestions(request: RejectRequest, user_id: str = Depends(get_current_user)):
    suggestion_ids = [sid for sid in request.suggestion_ids if sid]
    if not suggestion_ids:
        raise HTTPException(status_code=400, detail="No suggestion_ids provided")

    result = (
        supabase_admin.table("categorisation_suggestions")
        .update({"status": "rejected", "updated_at": _now_iso()})
        .eq("user_id", user_id)
        .eq("status", "pending")
        .in_("id", suggestion_ids)
        .execute()
    )

    changed = len(result.data or [])
    _log_event(user_id, None, None, "categorise_reject", {"requested": len(suggestion_ids), "changed": changed})
    return {"success": True, "requested": len(suggestion_ids), "changed": changed}


@router.post("/categorise/accept-high-confidence")
async def accept_high_confidence(
    request: AcceptHighConfidenceRequest,
    user_id: str = Depends(get_current_user),
):
    account_scope = _validate_account_scope(user_id, request.account_id)
    threshold = float(request.threshold)

    query = (
        supabase_admin.table("categorisation_suggestions")
        .select("id,transaction_id,suggested_category,confidence,status")
        .eq("user_id", user_id)
        .eq("status", "pending")
        .gte("confidence", threshold)
        .order("created_at", desc=False)
        .limit(AUTO_APPLY_CAP)
    )
    if account_scope != "all":
        query = query.eq("account_id", account_scope)
    candidates = query.execute().data or []

    changed = 0
    for suggestion in candidates:
        tx_result = (
            supabase_admin.table("transactions")
            .select("id,description")
            .eq("id", suggestion["transaction_id"])
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not tx_result.data:
            continue
        tx = tx_result.data[0]
        if _is_sensitive(tx.get("description", ""), suggestion.get("suggested_category", "")):
            continue

        final_category = suggestion.get("suggested_category") or "Uncategorized"
        _apply_transaction_category(user_id, tx["id"], final_category)
        _save_learning_if_eligible(user_id, tx.get("description", ""), final_category, float(suggestion.get("confidence") or 0))
        (
            supabase_admin.table("categorisation_suggestions")
            .update({
                "status": "approved",
                "final_category": final_category,
                "updated_at": _now_iso(),
            })
            .eq("id", suggestion["id"])
            .eq("user_id", user_id)
            .execute()
        )
        changed += 1

    _log_event(
        user_id,
        None if account_scope == "all" else account_scope,
        None,
        "categorise_accept_high_confidence",
        {"threshold": threshold, "candidate_count": len(candidates), "changed": changed},
    )

    return {
        "success": True,
        "threshold": threshold,
        "candidate_count": len(candidates),
        "changed": changed,
    }
