# budgetApp/src/budgeting/categories.py
from supabase_client import supabase
from typing import List, Dict
import pandas as pd


def get_user_categories(user_id: str) -> List[str]:
    """Get all category names for a user."""
    res = supabase.table("categories").select("name").eq("user_id", user_id).execute()
    return [row["name"] for row in (res.data or [])]


def add_category(user_id: str, category_name: str, color: str = "#3b82f6"):
    """Add a new category for user."""
    supabase.table("categories").insert({
        "user_id": user_id,
        "name": category_name,
        "color": color
    }).execute()


def delete_category(user_id: str, category_name: str):
    """Delete category and its budget target."""
    supabase.table("categories").delete().eq("user_id", user_id).eq("name", category_name).execute()
    supabase.table("budget_targets").delete().eq("user_id", user_id).eq("category_name", category_name).execute()


def get_budget_targets(user_id: str) -> pd.DataFrame:
    """Get all budget targets as DataFrame."""
    res = supabase.table("budget_targets") \
        .select("category_name,monthly_target") \
        .eq("user_id", user_id) \
        .execute()
    return pd.DataFrame(res.data or [])


def set_budget_target(user_id: str, category_name: str, monthly_target: float):
    """Set or update monthly budget target."""
    supabase.table("budget_targets").upsert({
        "user_id": user_id,
        "category_name": category_name,
        "monthly_target": monthly_target
    }).execute()


def get_category_spending(df: pd.DataFrame, latest_month) -> pd.DataFrame:
    """Calculate spending by category for latest month."""
    month_df = df[df["Date"].dt.to_period("M") == latest_month]
    spending = month_df[month_df["Amount"] < 0].groupby("Category")["Amount"].sum() * -1
    return spending.reset_index().rename(columns={"Amount": "spent"})
