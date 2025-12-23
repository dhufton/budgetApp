# api/routes/analytics.py
from fastapi import APIRouter, Depends
import pandas as pd
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from api.auth import get_current_user
from api.routes.transactions import _cache, load_statements

router = APIRouter()


@router.get("/analytics/dashboard")
async def get_dashboard_metrics(user_id: str = Depends(get_current_user)):
    """Get dashboard snapshot metrics."""

    # Load transactions
    if user_id not in _cache:
        df = await load_statements(user_id)
        _cache[user_id] = df
    else:
        df = _cache[user_id]

    if df.empty:
        return {"metrics": None}

    # Latest month
    latest_month = df["Date"].dt.to_period("M").max()
    month_df = df[df["Date"].dt.to_period("M") == latest_month]

    # Calculate metrics
    spend = month_df[(month_df["Category"] != "Savings") & (month_df["Amount"] < 0)]["Amount"].sum() * -1
    saved = month_df[month_df["Category"] == "Savings"]["Amount"].sum() * -1

    return {
        "metrics": {
            "latest_month": str(latest_month),
            "total_spent": float(spend),
            "net_saved": float(saved),
            "transaction_count": len(month_df)
        }
    }


@router.get("/analytics/spending-by-category")
async def get_spending_by_category(user_id: str = Depends(get_current_user)):
    """Get spending breakdown by category (for pie chart)."""

    if user_id not in _cache:
        df = await load_statements(user_id)
        _cache[user_id] = df
    else:
        df = _cache[user_id]

    if df.empty:
        return {"categories": []}

    # Group by category
    spending = df[df["Amount"] < 0].groupby("Category")["Amount"].sum().abs()

    return {
        "categories": [
            {"category": cat, "amount": float(amount)}
            for cat, amount in spending.items()
        ]
    }


@router.get("/analytics/monthly-trend")
async def get_monthly_trend(user_id: str = Depends(get_current_user)):
    """Get monthly spending trend (for line chart)."""

    if user_id not in _cache:
        df = await load_statements(user_id)
        _cache[user_id] = df
    else:
        df = _cache[user_id]

    if df.empty:
        return {"months": []}

    # Group by month
    df["Month"] = df["Date"].dt.to_period("M")
    monthly = df[df["Amount"] < 0].groupby("Month")["Amount"].sum().abs()

    return {
        "months": [
            {"month": str(month), "spending": float(amount)}
            for month, amount in monthly.items()
        ]
    }
