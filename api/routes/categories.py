# api/routes/categories.py
from fastapi import APIRouter, Depends, HTTPException
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from src.supabase_client import supabase_admin
from api.auth import get_current_user

router = APIRouter()


@router.get("/categories")
async def get_categories(user_id: str = Depends(get_current_user)):
    """Get all unique categories from user's transactions"""
    try:
        result = supabase_admin.table("transactions") \
            .select("category") \
            .eq("user_id", user_id) \
            .execute()

        categories = list(set(t["category"] for t in (result.data or [])))

        return {"categories": sorted(categories)}
    except Exception as e:
        print(f"[CATEGORIES] Error: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/transactions/{transaction_id}/category")
async def update_category(
        transaction_id: str,
        new_category: str,
        user_id: str = Depends(get_current_user)
):
    """Update category for a specific transaction"""
    try:
        result = supabase_admin.table("transactions") \
            .update({"category": new_category}) \
            .eq("id", transaction_id) \
            .eq("user_id", user_id) \
            .execute()

        if not result:
            raise HTTPException(status_code=404, detail="Transaction not found")

        return {"success": True, "data": result.data}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[CATEGORIES] Error updating: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))
