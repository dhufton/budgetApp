# api/routes/transactions.py
from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from src.supabase_client import supabase
from api.auth import get_current_user

router = APIRouter()


@router.get("/transactions")
async def get_transactions(
        user_id: str = Depends(get_current_user),
        limit: int = Query(1000, le=5000),
):
    try:
        print(f"[TRANSACTIONS] Fetching from database for user {user_id}")

        # Fetch from database instead of parsing files
        result = supabase.table("transactions") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("date", desc=True) \
            .limit(limit) \
            .execute()

        transactions = result.data or []

        print(f"[TRANSACTIONS] Found {len(transactions)} transactions")

        if not transactions:
            return {
                "total": 0,
                "transactions": [],
                "latest_date": None,
                "uncategorized_count": 0
            }

        # Format for frontend
        formatted = []
        for t in transactions:
            formatted.append({
                "Date": t["date"],
                "Description": t["description"],
                "Amount": float(t["amount"]),
                "Category": t["category"]
            })

        uncategorized_count = sum(1 for t in formatted if t.get("Category") == "Uncategorized")

        return {
            "total": len(formatted),
            "transactions": formatted,
            "latest_date": formatted[0]["Date"] if formatted else None,
            "uncategorized_count": uncategorized_count
        }
    except Exception as e:
        print(f"[TRANSACTIONS] Error: {repr(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/transactions")
async def delete_all_transactions(user_id: str = Depends(get_current_user)):
    """Delete all transactions (useful for re-importing)"""
    try:
        supabase.table("transactions").delete().eq("user_id", user_id).execute()
        return {"success": True, "message": "All transactions deleted"}
    except Exception as e:
        print(f"[TRANSACTIONS] Delete error: {repr(e)}")
        raise HTTPException(status_code=500, detail=str(e))
