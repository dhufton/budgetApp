# api/dependencies.py
import os
import logging
from functools import lru_cache
from supabase import create_client, Client
from api.groq_service import GroqService

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY environment variables must be set")
    logger.info("Initialising Supabase client")
    return create_client(url, key)


@lru_cache(maxsize=1)
def get_groq_service() -> GroqService:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY environment variable must be set")
    logger.info("Initialising Groq service")
    return GroqService(api_key=api_key, supabase_client=get_supabase())
