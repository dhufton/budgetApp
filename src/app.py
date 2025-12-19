# budgetApp/src/app.py
import streamlit as st
import pandas as pd
import time
from io import BytesIO

# Supabase and app modules
from supabase_client import supabase
from ingestion.learning import save_learned_rule, load_learned_rules
from ingestion.storage import save_uploaded_file, get_all_statement_paths, download_statement
from ingestion.parser import ChaseStatementParser, AmexCSVParser
from analysis.charts import (
    create_spending_pie_chart,
    create_monthly_trend_line,
    create_balance_trend_line,
)
from config import CATEGORY_RULES

# --- Page and Session Setup ---
st.set_page_config(page_title="Budget Tracker", layout="wide")


def get_current_user():
    return st.session_state.get("user")


def set_current_user(user):
    st.session_state["user"] = user


def logout():
    st.session_state.pop("user", None)


if "supabase_session" in st.session_state:
    try:
        # Restore the session so the client is authenticated for this rerun
        session = st.session_state["supabase_session"]
        supabase.auth.set_session(session.access_token, session.refresh_token)
    except Exception:
        # If session is invalid/expired, clear it
        st.session_state.pop("supabase_session", None)
        st.session_state.pop("user", None)

def set_current_user(res):
    """Stores both user and session data."""
    st.session_state["user"] = res.user
    st.session_state["supabase_session"] = res.session

# --- Authentication UI ---
def auth_view():
    st.title("🔐 Budget Tracker Login")
    st.write("Log in to access your dashboard or register for a new account.")

    tab_login, tab_register = st.tabs(["Login", "Register"])

    with tab_login:
        email = st.text_input("Email", key="login_email")
        password = st.text_input("Password", type="password", key="login_password")
        if st.button("Login"):
            res = supabase.auth.sign_in_with_password({"email": email, "password": password})
            if res.session:
                set_current_user(res)
                st.success("Logged in!")
                st.rerun()

    with tab_register:
        email_r = st.text_input("Email", key="reg_email")
        password_r = st.text_input("Password", type="password", key="reg_password")
        username_r = st.text_input("Display Name", key="reg_username", placeholder="Optional")
        if st.button("Create Account"):
            try:
                res = supabase.auth.sign_up({"email": email_r, "password": password_r})
                if res.user:
                    supabase.table("users").insert({
                        "id": res.user.id,
                        "username": username_r or email_r.split('@')[0],
                    }).execute()
                    st.success("Account created! Please check your email for a confirmation link, then log in.")
                else:
                    st.error("Registration failed.")
            except Exception as e:
                st.error(f"An error occurred during registration: {e}")


# --- Main App Logic ---
user = get_current_user()

if not user:
    auth_view()
    st.stop()

# If we are here, user is logged in
user_id = user.id
user_email = user.email

# --- Sidebar ---
with st.sidebar:
    st.write(f"👤 **{user_email}**")
    if st.button("Logout"):
        supabase.auth.sign_out()
        logout()
        st.rerun()
    st.divider()

    st.header("Upload Statements")
    uploaded_files = st.file_uploader(
        "Upload Statements (PDF or CSV)",
        type=["pdf", "csv"],
        accept_multiple_files=True
    )
    if uploaded_files:
        with st.spinner("Uploading and processing files..."):
            for f in uploaded_files:
                save_uploaded_file(f, user_id=user_id)
            st.success(f"Saved {len(uploaded_files)} new statements!")
            st.cache_data.clear()

# --- Dashboard ---
st.title("📊 Personal Finance Dashboard")

# Load data from Supabase
all_paths = get_all_statement_paths(user_id=user_id)

if not all_paths:
    st.info(f"Welcome, {user_email}! You have no statements yet. Upload them in the sidebar.")
else:
    all_dfs = []
    chase_parser = ChaseStatementParser(user_id=user_id)
    amex_parser = AmexCSVParser(user_id=user_id)

    with st.spinner("Parsing historical data from the cloud..."):
        for storage_path in all_paths:
            content_bytes = download_statement(storage_path)
            if not content_bytes:
                continue

            file_name = storage_path.split("/")[-1]
            file_stream = BytesIO(content_bytes)

            try:
                if file_name.lower().endswith(".pdf"):
                    df_file = chase_parser.parse(file_stream)
                elif file_name.lower().endswith(".csv"):
                    df_file = amex_parser.parse(file_stream)
                else:
                    continue

                if not df_file.empty:
                    all_dfs.append(df_file)
            except Exception as e:
                st.error(f"Failed to parse {file_name}: {e}")

    # Combine dataframes and display UI
    if not all_dfs:
        st.warning("Statements found, but no transactions could be parsed.")
    else:
        df = pd.concat(all_dfs, ignore_index=True).drop_duplicates()
        df = df.sort_values(by="Date", ascending=False)

        # --- Review Queue ---
        uncategorized = df[df['Category'] == 'Uncategorized'].copy()
        if not uncategorized.empty:
            st.warning(f"⚠️ You have {len(uncategorized)} uncategorized transactions to review.")
            with st.expander("📝 Review Queue", expanded=True):
                options = sorted(list(CATEGORY_RULES.keys())) + ["Uncategorized", "Ignore"]
                edited_df = st.data_editor(
                    uncategorized[['Date', 'Description', 'Amount', 'Category']],
                    column_config={"Category": st.column_config.SelectboxColumn("Assign Category", options=options)},
                    hide_index=True, use_container_width=True, key="editor"
                )
                if st.button("Update Categories", key="btn_update"):
                    for _, row in edited_df.iterrows():
                        if row['Category'] not in ['Uncategorized', 'Ignore']:
                            save_learned_rule(row['Description'], row['Category'], user_id=user_id)
                    st.success("Rules saved!")
                    st.rerun()

        # --- Metrics & Charts ---
        st.divider()
        st.markdown("### Dashboard Snapshot")
        col1, col2, col3 = st.columns(3)
        latest_month = df['Date'].dt.to_period('M').max()
        month_df = df[df['Date'].dt.to_period('M') == latest_month]
        spend = month_df[(month_df['Category'] != 'Savings') & (month_df['Amount'] < 0)]['Amount'].sum() * -1
        saved = (month_df[month_df['Category'] == 'Savings']['Amount'] * -1).sum()
        col1.metric("Latest Month", str(latest_month))
        col2.metric("Total Spent", f"£{spend:,.2f}")
        col3.metric("Net Saved", f"£{saved:,.2f}")

        st.plotly_chart(create_balance_trend_line(df), use_container_width=True, key="balance_chart")
        c1, c2 = st.columns([1, 2])
        c1.plotly_chart(create_spending_pie_chart(df), use_container_width=True, key="pie_chart")
        c2.plotly_chart(create_monthly_trend_line(df), use_container_width=True, key="trend_chart")

        with st.expander("View All Transaction Data"):
            st.dataframe(df)
