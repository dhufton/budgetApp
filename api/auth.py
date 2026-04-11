# api/auth.py
from fastapi import Header, HTTPException
from typing import Optional
import sys
import os
import logging

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.supabase_client import supabase, supabase_admin

logger = logging.getLogger(__name__)


def _ensure_public_user_row(user_id: str, email: Optional[str]) -> None:
    """Best-effort sync of auth user into public.users."""
    try:
        username = "user"
        if email and "@" in email:
            candidate = email.split("@")[0].strip()
            if candidate:
                username = candidate[:64]

        supabase_admin.table("users").upsert(
            {
                "id": user_id,
                "username": username,
            },
            on_conflict="id",
        ).execute()
    except Exception as e:
        logger.warning("Failed to upsert public.users for user_id=%s: %r", user_id, e)


async def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    if not authorization:
        print("[AUTH] No authorization header")
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        # Extract token
        token = authorization.replace("Bearer ", "")
        print(f"[AUTH] Token: {token[:20]}...")

        # Validate with Supabase
        user_response = supabase.auth.get_user(token)

        print(f"[AUTH] Response: {user_response}")

        if not user_response or not user_response.user:
            print("[AUTH] Invalid token - no user returned")
            raise HTTPException(status_code=401, detail="Invalid token")

        user_id = user_response.user.id
        email = getattr(user_response.user, "email", None)
        _ensure_public_user_row(user_id, email)
        print(f"[AUTH] Authenticated user: {user_id}")
        return user_id

    except HTTPException:
        raise
    except Exception as e:
        print(f"[AUTH] Exception: {repr(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=401, detail="Authentication failed")
