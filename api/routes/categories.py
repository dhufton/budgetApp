# api/routes/categories.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from src.supabase_client import supabase_admin
from api.auth import get_current_user

router = APIRouter()


class CategoryRequest(BaseModel):
    category: str


@router.get("/categories")
async def get_categories(user_id: str = Depends(get_current_user)):
    """Get all categories (default + custom)"""
    try:
        # Default categories
        default_categories = [
            "Food", "Transport", "Shopping", "Entertainment",
            "Bills", "Savings", "Uncategorized"
        ]

        # Get custom categories for this user
        result = supabase_admin.table("categories") \
            .select("category") \
            .eq("user_id", user_id) \
            .execute()

        custom_categories = [c["category"] for c in (result.data or [])]

        # Combine and remove duplicates
        all_categories = list(set(default_categories + custom_categories))
        all_categories.sort()

        return {"categories": all_categories}
    except Exception as e:
        print(f"[CATEGORIES] Error fetching: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/categories")
async def add_category(
        request: CategoryRequest,
        user_id: str = Depends(get_current_user)
):
    """Add a custom category"""
    try:
        result = supabase_admin.table("categories").insert({
            "user_id": user_id,
            "category": request.category
        }).execute()

        return {"success": True, "data": result.data}
    except Exception as e:
        print(f"[CATEGORIES] Error adding: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/categories/{category}")
async def delete_category(
        category: str,
        user_id: str = Depends(get_current_user)
):
    """Delete a custom category"""
    try:
        # Only allow deleting custom categories (not defaults)
        default_categories = [
            "Food", "Transport", "Shopping", "Entertainment",
            "Bills", "Savings", "Uncategorized"
        ]

        if category in default_categories:
            raise HTTPException(status_code=400, detail="Cannot delete default categories")

        result = supabase_admin.table("categories") \
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
