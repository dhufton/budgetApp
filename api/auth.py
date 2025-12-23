# api/auth.py
from fastapi import Header, HTTPException
from typing import Optional
import os

from src.supabase_client import supabase


async def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    """Extract user_id from Supabase JWT token."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        token = authorization.replace("Bearer ", "")
        user = supabase.auth.get_user(token)

        if not user or not user.user:
            raise HTTPException(status_code=401, detail="Invalid token")

        return user.user.id
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth error: {str(e)}")
