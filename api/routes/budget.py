# api/routes/budget.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from datetime import date, datetime
from typing import Optional
from collections import defaultdict
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


class GoalRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    goal_type: str
    target_amount: float = Field(gt=0)
    current_saved: float = Field(default=0, ge=0)
    target_date: date
    account_scope: str = "all"
    notes: Optional[str] = None


class UpdateGoalRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    goal_type: Optional[str] = None
    target_amount: Optional[float] = Field(default=None, gt=0)
    current_saved: Optional[float] = Field(default=None, ge=0)
    target_date: Optional[date] = None
    account_scope: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


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


def _validate_goal_type(goal_type: str) -> str:
    value = str(goal_type or "").strip().lower()
    if value not in {"savings_target", "planned_purchase"}:
        raise HTTPException(status_code=400, detail="Invalid goal_type")
    return value


def _validate_goal_status(status: str) -> str:
    value = str(status or "").strip().lower()
    if value not in {"active", "completed", "archived"}:
        raise HTTPException(status_code=400, detail="Invalid status")
    return value


def _validate_account_scope(user_id: str, account_scope: str) -> str:
    scope = account_scope or "all"
    if scope == "all":
        return "all"
    account = (
        supabase_admin.table("accounts")
        .select("id")
        .eq("id", scope)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not account.data:
        raise HTTPException(status_code=400, detail="Invalid account scope")
    return scope


def _goal_months_remaining(today: date, target_date: date) -> int:
    if target_date <= today:
        return 1
    months = (target_date.year - today.year) * 12 + (target_date.month - today.month)
    if target_date.day > today.day:
        months += 1
    return max(1, months)


def _get_average_net_monthly_saving(user_id: str, account_scope: str) -> float:
    today = date.today()
    start_date = date(today.year, today.month, 1)
    start_date = _add_months(start_date, -3)

    query = (
        supabase_admin.table("transactions")
        .select("date,amount,category")
        .eq("user_id", user_id)
        .gte("date", start_date.isoformat())
        .lt("date", today.isoformat())
    )
    if account_scope != "all":
        query = query.eq("account_id", account_scope)
    rows = query.execute().data or []

    monthly = defaultdict(lambda: {"income": 0.0, "spend": 0.0})
    for row in rows:
        month_key = str(row.get("date", ""))[:7]
        amount = float(row.get("amount") or 0)
        category = row.get("category")
        if amount > 0:
            monthly[month_key]["income"] += amount
        elif amount < 0 and category != "Transfer":
            monthly[month_key]["spend"] += abs(amount)

    if not monthly:
        return 0.0

    net_values = [(vals["income"] - vals["spend"]) for vals in monthly.values()]
    return round(sum(net_values) / len(net_values), 2)


def _build_affordability(goal: dict, avg_net_monthly: float) -> dict:
    today = date.today()
    target_date = datetime.strptime(goal["target_date"], "%Y-%m-%d").date() if isinstance(goal["target_date"], str) else goal["target_date"]
    target_amount = float(goal.get("target_amount") or 0)
    current_saved = float(goal.get("current_saved") or 0)
    remaining = max(0.0, target_amount - current_saved)
    months_remaining = _goal_months_remaining(today, target_date)
    required_monthly = round(remaining / months_remaining, 2) if months_remaining > 0 else remaining

    safe_monthly = round(max(0.0, avg_net_monthly * 0.8), 2)
    projected_by_date = round(current_saved + max(0.0, avg_net_monthly) * months_remaining, 2)

    if current_saved >= target_amount:
        verdict = "can_afford_now"
    elif projected_by_date >= target_amount:
        verdict = "can_afford_by_date"
    else:
        verdict = "not_yet"

    return {
        "goal_id": goal["id"],
        "months_remaining": months_remaining,
        "remaining_amount": round(remaining, 2),
        "required_monthly_saving": required_monthly,
        "avg_net_monthly_saving": avg_net_monthly,
        "safe_monthly_saving": safe_monthly,
        "projected_saved_by_date": projected_by_date,
        "verdict": verdict,
    }


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


@router.get("/goals")
async def get_goals(
        status: str = "active",
        account_scope: str = "all",
        user_id: str = Depends(get_current_user)
):
    try:
        scope = _validate_account_scope(user_id, account_scope)
        query = supabase_admin.table("financial_goals") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("target_date", desc=False)
        if status != "all":
            query = query.eq("status", _validate_goal_status(status))
        if scope != "all":
            query = query.eq("account_scope", scope)
        result = query.execute()
        return {"goals": result.data or []}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[GOALS] Error fetching goals: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/goals")
async def create_goal(
        request: GoalRequest,
        user_id: str = Depends(get_current_user)
):
    try:
        scope = _validate_account_scope(user_id, request.account_scope)
        goal_type = _validate_goal_type(request.goal_type)
        if request.target_date < date.today():
            raise HTTPException(status_code=400, detail="target_date must be today or later")

        row = {
            "user_id": user_id,
            "account_scope": scope,
            "name": request.name.strip(),
            "goal_type": goal_type,
            "target_amount": round(float(request.target_amount), 2),
            "current_saved": round(float(request.current_saved), 2),
            "target_date": request.target_date.isoformat(),
            "status": "active",
            "notes": request.notes,
            "updated_at": datetime.utcnow().isoformat(),
        }
        result = supabase_admin.table("financial_goals").insert(row).execute()
        return {"success": True, "goal": (result.data or [row])[0]}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[GOALS] Error creating goal: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/goals/{goal_id}")
async def update_goal(
        goal_id: str,
        request: UpdateGoalRequest,
        user_id: str = Depends(get_current_user)
):
    updates = {}
    if request.name is not None:
        updates["name"] = request.name.strip()
    if request.goal_type is not None:
        updates["goal_type"] = _validate_goal_type(request.goal_type)
    if request.target_amount is not None:
        updates["target_amount"] = round(float(request.target_amount), 2)
    if request.current_saved is not None:
        updates["current_saved"] = round(float(request.current_saved), 2)
    if request.target_date is not None:
        updates["target_date"] = request.target_date.isoformat()
    if request.account_scope is not None:
        updates["account_scope"] = _validate_account_scope(user_id, request.account_scope)
    if request.status is not None:
        updates["status"] = _validate_goal_status(request.status)
    if request.notes is not None:
        updates["notes"] = request.notes

    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    updates["updated_at"] = datetime.utcnow().isoformat()

    try:
        result = supabase_admin.table("financial_goals") \
            .update(updates) \
            .eq("id", goal_id) \
            .eq("user_id", user_id) \
            .execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Goal not found")
        return {"success": True, "goal": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[GOALS] Error updating goal: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/goals/{goal_id}")
async def archive_goal(
        goal_id: str,
        user_id: str = Depends(get_current_user)
):
    try:
        result = supabase_admin.table("financial_goals") \
            .update({"status": "archived", "updated_at": datetime.utcnow().isoformat()}) \
            .eq("id", goal_id) \
            .eq("user_id", user_id) \
            .execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Goal not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[GOALS] Error archiving goal: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/goals/{goal_id}/affordability")
async def get_goal_affordability(
        goal_id: str,
        user_id: str = Depends(get_current_user)
):
    try:
        result = supabase_admin.table("financial_goals") \
            .select("*") \
            .eq("id", goal_id) \
            .eq("user_id", user_id) \
            .limit(1) \
            .execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Goal not found")
        goal = result.data[0]
        avg_net = _get_average_net_monthly_saving(user_id, goal.get("account_scope") or "all")
        return {"goal": goal, "affordability": _build_affordability(goal, avg_net)}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[GOALS] Error in affordability: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/goals-affordability")
async def get_goals_affordability(
        status: str = "active",
        user_id: str = Depends(get_current_user)
):
    try:
        query = supabase_admin.table("financial_goals") \
            .select("*") \
            .eq("user_id", user_id)
        if status != "all":
            query = query.eq("status", _validate_goal_status(status))
        goals = query.execute().data or []

        affordability = []
        for goal in goals:
            scope = goal.get("account_scope") or "all"
            avg_net = _get_average_net_monthly_saving(user_id, scope)
            affordability.append({
                "goal": goal,
                "affordability": _build_affordability(goal, avg_net),
            })
        return {"items": affordability}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[GOALS] Error fetching affordability list: {repr(e)}")
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
            .gte("date", month_start.isoformat()) \
            .lt("date", next_month_start.isoformat()) \
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
        account_id: str = "all",
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

        tx_query = supabase_admin.table("transactions") \
            .select("category, amount") \
            .eq("user_id", user_id) \
            .gte("date", month_start.isoformat()) \
            .lt("date", next_month_start.isoformat()) \
            .lt("amount", 0)
        if account_id != "all":
            tx_query = tx_query.eq("account_id", account_id)
        tx_result = tx_query.execute()

        spending = {}
        for txn in (tx_result.data or []):
            category = txn["category"]
            if category == "Transfer":
                continue
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
        account_id: str = "all",
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

        tx_query = supabase_admin.table("transactions") \
            .select("date, category, amount") \
            .eq("user_id", user_id) \
            .gte("date", range_start.isoformat()) \
            .lt("date", range_end_exclusive.isoformat()) \
            .lt("amount", 0)
        if account_id != "all":
            tx_query = tx_query.eq("account_id", account_id)
        tx_result = tx_query.execute()

        monthly_spend = {}
        for txn in (tx_result.data or []):
            month_key = str(txn["date"])[:7]
            category = txn["category"]
            if category == "Transfer":
                continue
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
