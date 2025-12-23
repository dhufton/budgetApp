# src/supabase_client.py
import os
from supabase import create_client, Client

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_ANON_KEY")

if not url or not key:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_ANON_KEY")

supabase: Client = create_client(url, key)
