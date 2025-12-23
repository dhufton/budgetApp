# src/supabase_client.py
"""
Supabase client singleton for FastAPI application.
No session management here - JWT tokens handled by FastAPI middleware.
"""
import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables from .env file (local dev)
load_dotenv()

# Get credentials
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

# Validation
if not SUPABASE_URL:
    raise ValueError("SUPABASE_URL environment variable is required")
if not SUPABASE_KEY:
    raise ValueError("SUPABASE_KEY environment variable is required")

# Create singleton client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Export for use in other modules
__all__ = ["supabase", "SUPABASE_URL", "SUPABASE_KEY"]
