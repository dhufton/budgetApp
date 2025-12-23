# api/routes/budget.py
from fastapi import APIRouter, Depends
from pydantic import BaseModel
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from src.supabase_client import supabase
from api.auth import get_current_user

router = APIRouter()

class BudgetTarget(BaseModel):
    category_name: str
    monthly_target: float

@router.get("/budget-targets")
async def get_budget_targets(user_id: str = Depends(get_current_user)):
    res = supabase.table("budget_targets").select("*").eq("user_id", user_id).execute()
    return res.data or []

@router.post("/budget-targets")
async def set_budget_target(
    budget: BudgetTarget,
    user_id: str = Depends(get_current_user)
):
    supabase.table("budget_targets").upsert({
        "user_id": user_id,
        "category_name": budget.category_name,
        "monthly_target": budget.monthly_target
    }).execute()
    return {"success": True}
