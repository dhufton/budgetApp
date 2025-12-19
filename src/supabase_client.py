# budgetApp/src/supabase_client.py
import streamlit as st
from st_supabase_connection import SupabaseConnection

@st.cache_resource
def get_supabase_connection() -> SupabaseConnection:
    """
    Returns the Streamlit Supabase connection wrapper.
    The URL and key are read from [connections.supabase] in Streamlit secrets.
    """
    return st.connection(
        "supabase",
        type=SupabaseConnection,
    )

# This is the Streamlit connection wrapper
supabase_conn = get_supabase_connection()

# This is the actual supabase-py client
supabase = supabase_conn.client
