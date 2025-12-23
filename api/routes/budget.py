# api/routes/budget.py
from fastapi import APIRouter, Depends
from pydantic import BaseModel
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from src.budgeting.categories import (
    get_budget_targets,
    set_budget_target,
    get_category_spending
)
from api.auth import get_current_user
from api.routes.transactions import _cache, load_statements

router = APIRouter()


class BudgetTarget(BaseModel):
    category_name: str
    monthly_target: float


@router.get("/budget-targets")
async def get_targets(user_id: str = Depends(get_current_user)):
    """Get all budget targets."""
    df = get_budget_targets(user_id)
    return df.to_dict("records") if not df.empty else []


@router.post("/budget-targets")
async def set_target(
        budget: BudgetTarget,
        user_id: str = Depends(get_current_user)
):
    """Set or update a budget target."""
    set_budget_target(user_id, budget.category_name, budget.monthly_target)
    return {"success": True}


@router.get("/budget-comparison")
async def get_budget_comparison(user_id: str = Depends(get_current_user)):
    """Get budget vs actual spending for current month."""

    # Load transactions
    if user_id not in _cache:
        df = await load_statements(user_id)
        _cache[user_id] = df
    else:
        df = _cache[user_id]

    if df.empty:
        return {"comparison": []}

    # Get latest month
    latest_month = df["Date"].dt.to_period("M").max()

    # Get targets
    targets_df = get_budget_targets(user_id)
    if targets_df.empty:
        return {"comparison": []}

    # Get spending
    spending_df = get_category_spending(df, latest_month)

    # Merge
    comparison = targets_df.merge(
        spending_df,
        left_on="category_name",
        right_on="Category",
        how="left"
    ).fillna(0)

    comparison["spent"] = comparison["spent"].abs()
    comparison["remaining"] = comparison["monthly_target"] - comparison["spent"]
    comparison["percent_used"] = (comparison["spent"] / comparison["monthly_target"] * 100).round(1)

    return {
        "month": str(latest_month),
        "comparison": comparison.to_dict("records")
    }
