# budgetApp/src/supabase_client.py
import os
import streamlit as st
from supabase import create_client, Client  # pip install supabase

@st.cache_resource
def get_supabase_client() -> Client:
    url = st.secrets["SUPABASE_URL"]
    key = st.secrets["SUPABASE_KEY"]
    return create_client(url, key)

supabase = get_supabase_client()
