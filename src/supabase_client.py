# budgetApp/src/supabase_client.py
import streamlit as st
from supabase import create_client, Client

def get_supabase_client() -> Client:
    url = st.secrets["SUPABASE_URL"]
    key = st.secrets["SUPABASE_KEY"]
    return create_client(url, key)

# Initialize a base client
supabase = get_supabase_client()
