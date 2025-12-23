# api/auth.py
from fastapi import Header, HTTPException, Depends
from typing import Optional


async def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    """Extract user_id from Supabase JWT token."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        # Parse JWT token
        token = authorization.replace("Bearer ", "")
        from src.supabase_client import supabase

        user = supabase.auth.get_user(token)
        if not user or not user.user:
            raise HTTPException(status_code=401, detail="Invalid token")

        return user.user.id
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth error: {str(e)}")
