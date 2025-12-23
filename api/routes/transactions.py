# api/routes/transactions.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from src.supabase_client import supabase_admin
from api.auth import get_current_user

router = APIRouter()


class UpdateCategoryRequest(BaseModel):
    category: str


@router.patch("/transactions/{transaction_id}/category")
async def update_transaction_category(
    transaction_id: str,
    request: UpdateCategoryRequest,
    user_id: str = Depends(get_current_user)
):
    """Update the category of a transaction"""
    try:
        # Verify transaction belongs to user and update
        result = supabase_admin.table("transactions") \
            .update({"category": request.category}) \
            .eq("id", transaction_id) \
            .eq("user_id", user_id) \
            .execute()

        if not result:
            raise HTTPException(status_code=404, detail="Transaction not found")

        return {"success": True, "data": result.data}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[TRANSACTIONS] Error updating category: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))
