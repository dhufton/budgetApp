# src/supabase_client.py
import os
from supabase import create_client, Client

# Public client for auth verification
url: str = os.environ.get("SUPABASE_URL")
anon_key: str = os.environ.get("SUPABASE_ANON_KEY")

if not url or not anon_key:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_ANON_KEY")

supabase: Client = create_client(url, anon_key)

# Admin client for backend operations (bypasses RLS)
service_role_key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if service_role_key:
    supabase_admin: Client = create_client(url, service_role_key)
    print("Supabase admin client initialized")
else:
    print("WARNING: No service role key found, using anon key")
    supabase_admin = supabase
