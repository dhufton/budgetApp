# budgetApp/src/supabase_client.py
import streamlit as st
from st_supabase_connection import SupabaseConnection

@st.cache_resource
def get_supabase_connection() -> SupabaseConnection:
    """
    Returns the Streamlit Supabase connection wrapper.
    URL and key come from [connections.supabase] in secrets.
    """
    return st.connection("supabase", type=SupabaseConnection)

supabase_conn = get_supabase_connection()
supabase = supabase_conn.client  # This is the supabase-py Client
