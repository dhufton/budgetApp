from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.auth import get_current_user
from api.review_service import (
    generate_monthly_closeout_for_previous_month,
    get_or_create_review,
)
from src.supabase_client import supabase_admin

router = APIRouter()


class GenerateReviewRequest(BaseModel):
    review_type: Literal["monthly_closeout", "upload_snapshot"]
    period_start: date
    period_end: date
    account_id: str = "all"
    statement_id: Optional[str] = None


def _validate_account_scope(user_id: str, account_id: str) -> str:
    scope = account_id or "all"
    if scope == "all":
        return scope
    account_result = (
        supabase_admin.table("accounts")
        .select("id")
        .eq("id", scope)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not account_result.data:
        raise HTTPException(status_code=400, detail="Invalid account")
    return scope


@router.post("/reviews/generate")
async def generate_review(request: GenerateReviewRequest, user_id: str = Depends(get_current_user)):
    try:
        account_scope = _validate_account_scope(user_id, request.account_id)
        created = get_or_create_review(
            user_id=user_id,
            review_type=request.review_type,
            triggered_by="manual",
            period_start=request.period_start,
            period_end=request.period_end,
            account_id=account_scope,
            statement_id=request.statement_id,
        )
        return {"review": created}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reviews/generate-monthly")
async def generate_monthly(account_id: str = "all", user_id: str = Depends(get_current_user)):
    try:
        account_scope = _validate_account_scope(user_id, account_id)
        review = generate_monthly_closeout_for_previous_month(user_id, account_id=account_scope)
        return {"review": review}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reviews/latest")
async def get_latest_review(
    review_type: Optional[str] = None,
    account_id: str = "all",
    user_id: str = Depends(get_current_user),
):
    try:
        account_scope = _validate_account_scope(user_id, account_id)
        query = (
            supabase_admin.table("monthly_reviews")
            .select("*")
            .eq("user_id", user_id)
            .eq("account_scope", account_scope)
            .order("created_at", desc=True)
            .limit(1)
        )
        if review_type:
            query = query.eq("review_type", review_type)
        result = query.execute()
        return {"review": (result.data or [None])[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reviews/history")
async def get_review_history(
    review_type: Optional[str] = None,
    account_id: str = "all",
    limit: int = 20,
    user_id: str = Depends(get_current_user),
):
    try:
        account_scope = _validate_account_scope(user_id, account_id)
        query = (
            supabase_admin.table("monthly_reviews")
            .select("id,review_type,triggered_by,period_start,period_end,account_scope,created_at,statement_id,summary")
            .eq("user_id", user_id)
            .eq("account_scope", account_scope)
            .order("created_at", desc=True)
            .limit(max(1, min(limit, 100)))
        )
        if review_type:
            query = query.eq("review_type", review_type)
        result = query.execute()
        return {"reviews": result.data or []}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reviews/{review_id}")
async def get_review(review_id: str, user_id: str = Depends(get_current_user)):
    try:
        result = (
            supabase_admin.table("monthly_reviews")
            .select("*")
            .eq("id", review_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Review not found")
        return {"review": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
