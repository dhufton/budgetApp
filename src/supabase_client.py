# budgetApp/src/supabase_client.py
import streamlit as st
from supabase import create_client, Client

def get_supabase_client() -> Client:
    url = st.secrets["SUPABASE_URL"]
    key = st.secrets["SUPABASE_KEY"]
    print("DEBUG URL:", url)
    print("DEBUG KEY prefix:", key[:8] if key else None)
    return create_client(url, key)

# Single shared client
supabase: Client = get_supabase_client()
