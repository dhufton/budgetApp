# budgetApp/src/supabase_client.py
import streamlit as st
from st_supabase_connection import SupabaseConnection

@st.cache_resource
def get_supabase_client():
    return st.connection(
        "supabase",
        type=SupabaseConnection,
        url=st.secrets["SUPABASE_URL"],
        key=st.secrets["SUPABASE_KEY"],
    )

supabase = get_supabase_client()
