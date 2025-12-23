# api/routes/transactions.py
from fastapi import APIRouter, Depends, HTTPException
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from src.supabase_client import supabase_admin
from api.auth import get_current_user

router = APIRouter()


@router.get("/transactions")
async def get_transactions(user_id: str = Depends(get_current_user)):
    """Fetch all transactions for authenticated user"""
    try:
        print(f"[TRANSACTIONS] Fetching from database for user {user_id}")

        # Use admin client to bypass RLS (user already authenticated via JWT)
        result = supabase_admin.table("transactions") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("date", desc=True) \
            .execute()

        transactions = result.data or []
        print(f"[TRANSACTIONS] Found {len(transactions)} transactions")

        # Transform for frontend
        formatted_transactions = []
        for t in transactions:
            formatted_transactions.append({
                "Date": t["date"],
                "Description": t["description"],
                "Amount": t["amount"],
                "Category": t["category"]
            })

        uncategorized_count = sum(1 for t in transactions if t["category"] == "Uncategorized")

        return {
            "transactions": formatted_transactions,
            "total": len(transactions),
            "uncategorized_count": uncategorized_count
        }

    except Exception as e:
        print(f"[TRANSACTIONS] Error: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/transactions/category")
async def update_transaction_category(
        description: str,
        category: str,
        user_id: str = Depends(get_current_user)
):
    """Update category for a transaction"""
    try:
        result = supabase_admin.table("transactions") \
            .update({"category": category}) \
            .eq("user_id", user_id) \
            .eq("description", description) \
            .execute()

        return {"success": True, "updated": len(result.data or [])}
    except Exception as e:
        print(f"[TRANSACTIONS] Category update error: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))
