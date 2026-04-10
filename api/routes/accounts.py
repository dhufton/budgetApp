from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.auth import get_current_user
from src.supabase_client import supabase_admin

router = APIRouter()
_ACCOUNT_TYPES = {"current", "credit", "savings", "other"}


class AccountCreateRequest(BaseModel):
    name: str
    account_type: Literal["current", "credit", "savings", "other"]


class AccountUpdateRequest(BaseModel):
    name: Optional[str] = None
    account_type: Optional[Literal["current", "credit", "savings", "other"]] = None
    is_default: Optional[bool] = None


def ensure_default_account(user_id: str) -> None:
    existing = (
        supabase_admin.table("accounts")
        .select("id")
        .eq("user_id", user_id)
        .eq("is_default", True)
        .execute()
    )
    if existing.data:
        return

    # create one if no accounts at all
    all_accounts = (
        supabase_admin.table("accounts")
        .select("id")
        .eq("user_id", user_id)
        .execute()
    )
    if all_accounts.data:
        first_id = all_accounts.data[0]["id"]
        (
            supabase_admin.table("accounts")
            .update({"is_default": True})
            .eq("id", first_id)
            .eq("user_id", user_id)
            .execute()
        )
        return

    supabase_admin.table("accounts").insert(
        {
            "user_id": user_id,
            "name": "Primary Account",
            "account_type": "current",
            "is_default": True,
        }
    ).execute()


@router.get("/accounts")
async def list_accounts(user_id: str = Depends(get_current_user)):
    try:
        ensure_default_account(user_id)
        result = (
            supabase_admin.table("accounts")
            .select("*")
            .eq("user_id", user_id)
            .order("is_default", desc=True)
            .order("created_at", desc=False)
            .execute()
        )
        return {"accounts": result.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/accounts")
async def create_account(request: AccountCreateRequest, user_id: str = Depends(get_current_user)):
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Account name required")
    if request.account_type not in _ACCOUNT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid account type")

    try:
        ensure_default_account(user_id)
        result = (
            supabase_admin.table("accounts")
            .insert(
                {
                    "user_id": user_id,
                    "name": name,
                    "account_type": request.account_type,
                    "is_default": False,
                }
            )
            .execute()
        )
        return {"success": True, "account": (result.data or [None])[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/accounts/{account_id}")
async def update_account(account_id: str, request: AccountUpdateRequest, user_id: str = Depends(get_current_user)):
    try:
        existing = (
            supabase_admin.table("accounts")
            .select("*")
            .eq("id", account_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not existing.data:
            raise HTTPException(status_code=404, detail="Account not found")

        account = existing.data[0]
        updates = {}

        if request.name is not None:
            trimmed = request.name.strip()
            if not trimmed:
                raise HTTPException(status_code=400, detail="Account name required")
            updates["name"] = trimmed

        if request.account_type is not None:
            if request.account_type not in _ACCOUNT_TYPES:
                raise HTTPException(status_code=400, detail="Invalid account type")
            updates["account_type"] = request.account_type

        if request.is_default is not None:
            if request.is_default is False and account.get("is_default"):
                raise HTTPException(status_code=400, detail="Default account cannot be unset directly")
            if request.is_default:
                (
                    supabase_admin.table("accounts")
                    .update({"is_default": False})
                    .eq("user_id", user_id)
                    .execute()
                )
                updates["is_default"] = True

        if not updates:
            return {"success": True, "account": account}

        updated = (
            supabase_admin.table("accounts")
            .update(updates)
            .eq("id", account_id)
            .eq("user_id", user_id)
            .execute()
        )
        return {"success": True, "account": (updated.data or [None])[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/accounts/{account_id}")
async def delete_account(account_id: str, user_id: str = Depends(get_current_user)):
    try:
        existing = (
            supabase_admin.table("accounts")
            .select("*")
            .eq("id", account_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not existing.data:
            raise HTTPException(status_code=404, detail="Account not found")

        account = existing.data[0]
        if account.get("is_default"):
            raise HTTPException(status_code=400, detail="Default account cannot be deleted")

        has_statement = (
            supabase_admin.table("statements")
            .select("id")
            .eq("user_id", user_id)
            .eq("account_id", account_id)
            .limit(1)
            .execute()
        )
        has_transactions = (
            supabase_admin.table("transactions")
            .select("id")
            .eq("user_id", user_id)
            .eq("account_id", account_id)
            .limit(1)
            .execute()
        )
        if has_statement.data or has_transactions.data:
            raise HTTPException(status_code=400, detail="Only empty accounts can be deleted")

        (
            supabase_admin.table("accounts")
            .delete()
            .eq("id", account_id)
            .eq("user_id", user_id)
            .execute()
        )
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
