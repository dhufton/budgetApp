# api/dependencies.py
import logging
from functools import lru_cache
from supabase import Client
from api.groq_service import GroqService
from src.supabase_client import supabase, supabase_admin

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    logger.info("Using Supabase client from src.supabase_client")
    return supabase


@lru_cache(maxsize=1)
def get_groq_service() -> GroqService:
    import os
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY environment variable must be set")
    logger.info("Initialising Groq service")
    return GroqService(api_key=api_key, supabase_client=supabase_admin)
