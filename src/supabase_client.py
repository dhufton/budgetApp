# budgetApp/src/supabase_client.py
import streamlit as st
from st_supabase_connection import SupabaseConnection

@st.cache_resource
def get_supabase_connection():
    return st.connection(
        "supabase",
        type=SupabaseConnection,
    )

supabase_conn = get_supabase_connection()

supabase = supabase_conn.client
