# api/routes/categories.py
from fastapi import APIRouter, Depends
from pydantic import BaseModel
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from src.supabase_client import supabase
from api.auth import get_current_user

router = APIRouter()

class Category(BaseModel):
    name: str
    color: str = "#3b82f6"

@router.get("/categories")
async def get_categories(user_id: str = Depends(get_current_user)):
    res = supabase.table("categories").select("*").eq("user_id", user_id).execute()
    return res.data or []

@router.post("/categories")
async def create_category(
    category: Category,
    user_id: str = Depends(get_current_user)
):
    supabase.table("categories").insert({
        "user_id": user_id,
        "name": category.name,
        "color": category.color
    }).execute()
    return {"success": True}

@router.delete("/categories/{category_name}")
async def delete_category(
    category_name: str,
    user_id: str = Depends(get_current_user)
):
    supabase.table("categories").delete().eq("user_id", user_id).eq("name", category_name).execute()
    return {"success": True}
