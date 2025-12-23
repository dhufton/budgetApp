# api/routes/categories.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from src.budgeting.categories import (
    get_user_categories,
    add_category,
    delete_category
)
from api.auth import get_current_user

router = APIRouter()


class CategoryCreate(BaseModel):
    name: str


@router.get("/categories")
async def get_categories(user_id: str = Depends(get_current_user)):
    """Get all user categories."""
    categories = get_user_categories(user_id)
    return {"categories": sorted(categories)}


@router.post("/categories")
async def create_category(
        category: CategoryCreate,
        user_id: str = Depends(get_current_user)
):
    """Add a new category."""
    existing = get_user_categories(user_id)
    if category.name in existing:
        raise HTTPException(400, "Category already exists")

    add_category(user_id, category.name)
    return {"success": True, "message": f"Added '{category.name}'"}


@router.delete("/categories/{category_name}")
async def remove_category(
        category_name: str,
        user_id: str = Depends(get_current_user)
):
    """Delete a category."""
    delete_category(user_id, category_name)
    return {"success": True, "message": f"Deleted '{category_name}'"}
