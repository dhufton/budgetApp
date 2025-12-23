# api/routes/budget.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from src.supabase_client import supabase_admin  # Changed to admin client
from api.auth import get_current_user

router = APIRouter()


# Pydantic models for request bodies
class BudgetTargetRequest(BaseModel):
    category: str
    target_amount: float


class CategoryRequest(BaseModel):
    category: str


@router.get("/budget-targets")
async def get_budget_targets(user_id: str = Depends(get_current_user)):
    """Get budget targets for categories"""
    try:
        result = supabase_admin.table("budget_targets") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()

        return {"targets": result.data or []}
    except Exception as e:
        print(f"[BUDGET] Error fetching targets: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/budget-targets")
async def set_budget_target(
        request: BudgetTargetRequest,
        user_id: str = Depends(get_current_user)
):
    """Set or update budget target for a category"""
    try:
        # Upsert budget target
        result = supabase_admin.table("budget_targets").upsert({
            "user_id": user_id,
            "category": request.category,
            "target_amount": request.target_amount
        }).execute()

        return {"success": True, "data": result.data}
    except Exception as e:
        print(f"[BUDGET] Error setting target: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/budget-targets/{category}")
async def delete_budget_target(
        category: str,
        user_id: str = Depends(get_current_user)
):
    """Delete budget target for a category"""
    try:
        result = supabase_admin.table("budget_targets") \
            .delete() \
            .eq("user_id", user_id) \
            .eq("category", category) \
            .execute()

        return {"success": True}
    except Exception as e:
        print(f"[BUDGET] Error deleting target: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/budget-comparison")
async def get_budget_comparison(user_id: str = Depends(get_current_user)):
    """Compare actual spending vs budget targets"""
    try:
        # Get budget targets
        targets_result = supabase_admin.table("budget_targets") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()

        targets = {t["category"]: t["target_amount"] for t in (targets_result.data or [])}

        # Get actual spending by category (current month)
        from datetime import datetime
        current_month = datetime.now().strftime('%Y-%m')

        transactions_result = supabase_admin.table("transactions") \
            .select("category, amount") \
            .eq("user_id", user_id) \
            .gte("date", f"{current_month}-01") \
            .lt("amount", 0) \
            .execute()

        # Calculate spending by category
        spending = {}
        for t in (transactions_result.data or []):
            cat = t["category"]
            spending[cat] = spending.get(cat, 0) + abs(float(t["amount"]))

        # Build comparison
        comparison = []
        all_categories = set(targets.keys()) | set(spending.keys())

        for category in all_categories:
            target = targets.get(category, 0)
            actual = spending.get(category, 0)
            comparison.append({
                "category": category,
                "target": target,
                "actual": actual,
                "remaining": target - actual,
                "percentage": (actual / target * 100) if target > 0 else 0
            })

        return {"comparison": comparison}
    except Exception as e:
        print(f"[BUDGET] Error in comparison: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))
