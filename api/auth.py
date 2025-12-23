# api/auth.py
from fastapi import Header, HTTPException
from typing import Optional
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.supabase_client import supabase


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
        print(f"[AUTH] Authenticated user: {user_id}")
        return user_id

    except HTTPException:
        raise
    except Exception as e:
        print(f"[AUTH] Exception: {repr(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=401, detail="Authentication failed")
