# api/routes/categories.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from src.supabase_client import supabase_admin
from api.auth import get_current_user
from src.config import CATEGORY_RULES, BUILTIN_CATEGORIES

router = APIRouter()

DEFAULT_CATEGORIES = BUILTIN_CATEGORIES + ['Uncategorized']


class CategoryCreate(BaseModel):
    name: str
    keywords: List[str] = Field(default_factory=list)


class KeywordsUpdate(BaseModel):
    keywords: List[str]


class RecategoriseAllRequest(BaseModel):
    account_id: str = "all"


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


def _build_keyword_map(rows: List[dict]) -> dict:
    kw_map = {}
    for row in rows:
        category = row.get("category")
        for kw in (row.get("keywords") or []):
            trimmed = str(kw or "").strip()
            if trimmed and category:
                kw_map[trimmed.lower()] = category
    return kw_map


@router.get("/categories")
async def get_categories(user_id: str = Depends(get_current_user)):
    try:
        result = supabase_admin.table("categories") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()

        db_rows = {row["category"]: row for row in (result.data or [])}

        all_categories = []

        # Built-in categories - merge with any extra user-defined keywords
        for cat_name, builtin_kws in CATEGORY_RULES.items():
            extra_kws = db_rows.get(cat_name, {}).get("keywords") or []
            all_categories.append({
                "name": cat_name,
                "builtin_keywords": builtin_kws,
                "extra_keywords": extra_kws,
                "is_builtin": True
            })

        # Custom user categories (not in CATEGORY_RULES)
        for cat_name, row in db_rows.items():
            if cat_name not in CATEGORY_RULES and cat_name != "Uncategorized":
                all_categories.append({
                    "name": cat_name,
                    "builtin_keywords": [],
                    "extra_keywords": row.get("keywords") or [],
                    "is_builtin": False
                })

        # Flat name list for dropdowns
        custom_names = [
            r["category"] for r in (result.data or [])
            if r["category"] not in DEFAULT_CATEGORIES
        ]
        category_names = DEFAULT_CATEGORIES + custom_names

        return {"categories": category_names, "all_categories": all_categories}

    except Exception as e:
        print(f"[CATEGORIES] Error fetching: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/categories")
async def create_category(
    request: CategoryCreate,
    user_id: str = Depends(get_current_user)
):
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name required")
    try:
        supabase_admin.table("categories").upsert(
            {"user_id": user_id, "category": name, "keywords": request.keywords},
            on_conflict="user_id,category"
        ).execute()
        return {"success": True, "name": name}
    except Exception as e:
        print(f"[CATEGORIES] Error creating: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/categories/{category}/keywords")
async def update_keywords(
    category: str,
    request: KeywordsUpdate,
    user_id: str = Depends(get_current_user)
):
    try:
        # Deduplicate case-insensitively, preserve original casing
        seen = set()
        deduped = []
        for kw in request.keywords:
            kw = kw.strip()
            if kw and kw.lower() not in seen:
                seen.add(kw.lower())
                deduped.append(kw)

        supabase_admin.table("categories").upsert(
            {"user_id": user_id, "category": category, "keywords": deduped},
            on_conflict="user_id,category"
        ).execute()
        return {"success": True, "keywords": deduped}
    except Exception as e:
        print(f"[CATEGORIES] Error updating keywords: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/categories/recategorise-all")
async def recategorise_all_transactions(
    request: RecategoriseAllRequest,
    user_id: str = Depends(get_current_user)
):
    try:
        account_scope = _validate_account_scope(user_id, request.account_id)

        categories_result = (
            supabase_admin.table("categories")
            .select("category, keywords")
            .eq("user_id", user_id)
            .execute()
        )
        kw_map = _build_keyword_map(categories_result.data or [])
        if not kw_map:
            return {"success": True, "scanned": 0, "matched": 0, "changed": 0, "message": "No keywords configured"}

        tx_query = (
            supabase_admin.table("transactions")
            .select("id, description, category")
            .eq("user_id", user_id)
        )
        if account_scope != "all":
            tx_query = tx_query.eq("account_id", account_scope)
        tx_rows = tx_query.execute().data or []

        # Prefer longer keywords first to reduce partial-match misclassification.
        ordered_keywords = sorted(kw_map.items(), key=lambda kv: len(kv[0]), reverse=True)

        scanned = len(tx_rows)
        matched = 0
        changed = 0

        for txn in tx_rows:
            description = str(txn.get("description") or "").lower()
            target_category = None
            for keyword, category in ordered_keywords:
                if keyword in description:
                    target_category = category
                    break
            if not target_category:
                continue

            matched += 1
            if txn.get("category") == target_category:
                continue

            (
                supabase_admin.table("transactions")
                .update({"category": target_category})
                .eq("id", txn["id"])
                .eq("user_id", user_id)
                .execute()
            )
            changed += 1

        return {
            "success": True,
            "scanned": scanned,
            "matched": matched,
            "changed": changed,
            "message": f"Recategorised {changed} transaction(s) from keyword rules",
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[CATEGORIES] Error recategorising all: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/categories/{category}")
async def delete_category(
    category: str,
    user_id: str = Depends(get_current_user)
):
    if category in DEFAULT_CATEGORIES:
        raise HTTPException(status_code=400, detail="Cannot delete built-in categories")
    try:
        supabase_admin.table("categories") \
            .delete() \
            .eq("user_id", user_id) \
            .eq("category", category) \
            .execute()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[CATEGORIES] Error deleting: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))


def apply_user_keywords(transactions: list, user_id: str) -> list:
    """
    Apply user-defined category keywords to Uncategorized transactions.
    Called before Groq during upload and manual categorise.
    """
    try:
        result = supabase_admin.table("categories") \
            .select("category, keywords") \
            .eq("user_id", user_id) \
            .execute()

        kw_map = _build_keyword_map(result.data or [])

        if not kw_map:
            return transactions

        ordered_keywords = sorted(kw_map.items(), key=lambda kv: len(kv[0]), reverse=True)
        for txn in transactions:
            if txn.get("category", "Uncategorized") == "Uncategorized":
                desc_lower = str(txn.get("description", "")).lower()
                for kw_lower, cat in ordered_keywords:
                    if kw_lower in desc_lower:
                        txn["category"] = cat
                        break

        return transactions

    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("apply_user_keywords failed: %r", e)
        return transactions
