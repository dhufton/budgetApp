# api/routes/budget.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from datetime import date, datetime
from typing import Optional
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
    threshold_percent: float = Field(default=80, ge=1, le=100)


class CategoryRequest(BaseModel):
    category: str


class UpdateBudgetTargetRequest(BaseModel):
    target_amount: Optional[float] = None
    threshold_percent: Optional[float] = Field(default=None, ge=1, le=100)


def _month_start(month: Optional[str] = None) -> date:
    if month is None:
        today = date.today()
        return date(today.year, today.month, 1)
    try:
        parsed = datetime.strptime(month, "%Y-%m")
        return date(parsed.year, parsed.month, 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM")


def _add_months(month_start: date, offset: int) -> date:
    new_month = month_start.month - 1 + offset
    year = month_start.year + (new_month // 12)
    month = (new_month % 12) + 1
    return date(year, month, 1)


def _coerce_threshold(value) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return 80.0
    if parsed <= 0 or parsed > 100:
        return 80.0
    return parsed


def _budget_status(actual: float, target: float, threshold_percent: float) -> str:
    if target <= 0:
        return "no_target"
    percent = (actual / target) * 100
    if percent >= 100:
        return "over_budget"
    if percent >= threshold_percent:
        return "at_risk"
    return "on_track"


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
            "target_amount": request.target_amount,
            "threshold_percent": request.threshold_percent,
        }).execute()

        return {"success": True, "data": result.data}
    except Exception as e:
        print(f"[BUDGET] Error setting target: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/budget-targets/{category}")
async def update_budget_target(
        category: str,
        request: UpdateBudgetTargetRequest,
        user_id: str = Depends(get_current_user)
):
    """Update budget target amount and/or threshold for a category"""
    if request.target_amount is None and request.threshold_percent is None:
        raise HTTPException(status_code=400, detail="Provide target_amount and/or threshold_percent")

    updates = {}
    if request.target_amount is not None:
        updates["target_amount"] = request.target_amount
    if request.threshold_percent is not None:
        updates["threshold_percent"] = request.threshold_percent

    try:
        result = supabase_admin.table("budget_targets") \
            .update(updates) \
            .eq("user_id", user_id) \
            .eq("category", category) \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Budget target not found")
        return {"success": True, "data": result.data}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[BUDGET] Error updating target: {repr(e)}")
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
async def get_budget_comparison(account_id: str = "all", user_id: str = Depends(get_current_user)):
    """Compare actual spending vs budget targets"""
    try:
        # Get budget targets
        targets_result = supabase_admin.table("budget_targets") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()

        targets = {t["category"]: float(t["target_amount"]) for t in (targets_result.data or [])}
        thresholds = {
            t["category"]: _coerce_threshold(t.get("threshold_percent"))
            for t in (targets_result.data or [])
        }

        # Get actual spending by category (current month)
        month_start = _month_start()
        next_month_start = _add_months(month_start, 1)

        tx_query = supabase_admin.table("transactions") \
            .select("category, amount") \
            .eq("user_id", user_id) \
            .gte("date", f"{current_month}-01") \
            .lt("amount", 0)
        if account_id != "all":
            tx_query = tx_query.eq("account_id", account_id)
        transactions_result = tx_query.execute()

        # Calculate spending by category
        spending = {}
        for t in (transactions_result.data or []):
            cat = t["category"]
            if cat == "Transfer":
                continue
            spending[cat] = spending.get(cat, 0) + abs(float(t["amount"]))

        # Build comparison
        comparison = []
        all_categories = set(targets.keys()) | set(spending.keys())

        for category in all_categories:
            target = targets.get(category, 0.0)
            actual = spending.get(category, 0.0)
            threshold = thresholds.get(category, 80.0)
            percent = (actual / target * 100) if target > 0 else 0
            comparison.append({
                "category": category,
                "target": target,
                "actual": actual,
                "remaining": target - actual,
                "percentage": percent,
                "threshold_percent": threshold,
                "status": _budget_status(actual, target, threshold),
            })

        return {"comparison": comparison}
    except Exception as e:
        print(f"[BUDGET] Error in comparison: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/budget-health")
async def get_budget_health(
        month: Optional[str] = None,
        user_id: str = Depends(get_current_user)
):
    """Monthly budget health with on-track/at-risk/over-budget status per category."""
    try:
        month_start = _month_start(month)
        next_month_start = _add_months(month_start, 1)

        targets_result = supabase_admin.table("budget_targets") \
            .select("category, target_amount, threshold_percent") \
            .eq("user_id", user_id) \
            .execute()

        targets = {
            row["category"]: {
                "target": float(row["target_amount"]),
                "threshold_percent": _coerce_threshold(row.get("threshold_percent")),
            }
            for row in (targets_result.data or [])
        }

        tx_result = supabase_admin.table("transactions") \
            .select("category, amount") \
            .eq("user_id", user_id) \
            .gte("date", month_start.isoformat()) \
            .lt("date", next_month_start.isoformat()) \
            .lt("amount", 0) \
            .execute()

        spending = {}
        for txn in (tx_result.data or []):
            category = txn["category"]
            spending[category] = spending.get(category, 0.0) + abs(float(txn["amount"]))

        categories = []
        all_categories = sorted(set(targets.keys()) | set(spending.keys()))
        for category in all_categories:
            target = targets.get(category, {}).get("target", 0.0)
            threshold = targets.get(category, {}).get("threshold_percent", 80.0)
            actual = spending.get(category, 0.0)
            percent_used = (actual / target * 100) if target > 0 else 0
            categories.append({
                "category": category,
                "target": round(target, 2),
                "actual": round(actual, 2),
                "remaining": round(target - actual, 2),
                "percent_used": round(percent_used, 2),
                "threshold_percent": threshold,
                "status": _budget_status(actual, target, threshold),
            })

        summary = {
            "target_total": round(sum(v["target"] for v in targets.values()), 2),
            "actual_total": round(sum(spending.values()), 2),
        }

        return {
            "month": month_start.strftime("%Y-%m"),
            "summary": summary,
            "categories": categories,
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[BUDGET] Error in health: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/budget-trend")
async def get_budget_trend(
        months: int = 6,
        user_id: str = Depends(get_current_user)
):
    """Budget trend for recent months: target vs actual by category."""
    if months < 1 or months > 24:
        raise HTTPException(status_code=400, detail="months must be between 1 and 24")

    try:
        current_month = _month_start()
        month_starts = [_add_months(current_month, -offset) for offset in range(months - 1, -1, -1)]
        range_start = month_starts[0]
        range_end_exclusive = _add_months(current_month, 1)

        targets_result = supabase_admin.table("budget_targets") \
            .select("category, target_amount, threshold_percent") \
            .eq("user_id", user_id) \
            .execute()
        targets = {
            row["category"]: {
                "target": float(row["target_amount"]),
                "threshold_percent": _coerce_threshold(row.get("threshold_percent")),
            }
            for row in (targets_result.data or [])
        }

        tx_result = supabase_admin.table("transactions") \
            .select("date, category, amount") \
            .eq("user_id", user_id) \
            .gte("date", range_start.isoformat()) \
            .lt("date", range_end_exclusive.isoformat()) \
            .lt("amount", 0) \
            .execute()

        monthly_spend = {}
        for txn in (tx_result.data or []):
            month_key = str(txn["date"])[:7]
            category = txn["category"]
            if month_key not in monthly_spend:
                monthly_spend[month_key] = {}
            monthly_spend[month_key][category] = monthly_spend[month_key].get(category, 0.0) + abs(float(txn["amount"]))

        series = []
        categories = sorted(set(targets.keys()) | {
            category
            for by_cat in monthly_spend.values()
            for category in by_cat.keys()
        })

        for month_start in month_starts:
            month_key = month_start.strftime("%Y-%m")
            month_values = monthly_spend.get(month_key, {})
            all_month_categories = sorted(set(categories) | set(month_values.keys()))
            for category in all_month_categories:
                target = targets.get(category, {}).get("target", 0.0)
                threshold = targets.get(category, {}).get("threshold_percent", 80.0)
                actual = month_values.get(category, 0.0)
                series.append({
                    "month": month_key,
                    "category": category,
                    "target": round(target, 2),
                    "actual": round(actual, 2),
                    "threshold_percent": threshold,
                    "status": _budget_status(actual, target, threshold),
                })

        return {
            "months": [m.strftime("%Y-%m") for m in month_starts],
            "categories": categories,
            "series": series,
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[BUDGET] Error in trend: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))
