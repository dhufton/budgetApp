# budgetApp/src/app.py
import streamlit as st
import pandas as pd
import time
from io import BytesIO
from datetime import datetime

from supabase_client import supabase
from ingestion.storage import save_uploaded_file, get_all_statement_paths, download_statement
from ingestion.learning import save_learned_rule
from ingestion.parser import ChaseStatementParser, AmexCSVParser
from analysis.charts import (
    create_spending_pie_chart,
    create_monthly_trend_line,
    create_balance_trend_line,
)
from config import CATEGORY_RULES

st.set_page_config(page_title="Budget Tracker", layout="wide")


def get_current_user():
    return st.session_state.get("user")


def set_current_user(res):
    st.session_state["user"] = res.user
    st.session_state["supabase_session"] = res.session


def logout():
    st.session_state.pop("user", None)
    st.session_state.pop("supabase_session", None)


# Initialize session state
if "upload_complete" not in st.session_state:
    st.session_state.upload_complete = False
if "cache_buster" not in st.session_state:
    st.session_state.cache_buster = 0

# Hydrate supabase session
if "supabase_session" in st.session_state:
    try:
        session = st.session_state["supabase_session"]
        supabase.auth.set_session(session.access_token, session.refresh_token)
    except Exception:
        logout()


def auth_view():
    st.title("🔐 Budget Tracker Login")
    tab_login, tab_register = st.tabs(["Login", "Register"])

    with tab_login:
        email = st.text_input("Email", key="login_email")
        password = st.text_input("Password", type="password", key="login_pw")
        if st.button("Login"):
            try:
                res = supabase.auth.sign_in_with_password({"email": email, "password": password})
                if res.session:
                    set_current_user(res)
                    st.success(f"Welcome back, {email}!")
                    time.sleep(1)
                    st.rerun()
            except Exception as e:
                st.error(f"Login error: {e}")

    with tab_register:
        email_r = st.text_input("Email", key="reg_email")
        password_r = st.text_input("Password", type="password", key="reg_pw")
        username_r = st.text_input("Display Name", key="reg_username")
        if st.button("Create account"):
            try:
                res = supabase.auth.sign_up({"email": email_r, "password": password_r})
                if res.user:
                    supabase.table("users").insert({
                        "id": res.user.id,
                        "username": username_r or email_r.split("@")[0],
                    }).execute()
                    st.success("Account created. Please confirm your email and log in.")
            except Exception as e:
                st.error(f"Registration error: {e}")


user = get_current_user()
if not user:
    auth_view()
    st.stop()

user_id = user.id
user_email = user.email

# === MAIN DASHBOARD ===
st.title("📊 Personal Finance Dashboard")
st.sidebar.markdown(f"👤 **{user_email}**")

# Sidebar
with st.sidebar:
    if st.button("🚪 Logout", use_container_width=True):
        supabase.auth.sign_out()
        logout()
        st.rerun()

    st.divider()
    st.header("📁 Upload Statements")

    # Success message
    if st.session_state.upload_complete:
        st.success("✅ Files uploaded successfully!")
        st.rerun()  # Refresh dashboard immediately

    # File uploader
    uploaded_files = st.file_uploader(
        "Upload Statements (PDF or CSV)",
        type=["pdf", "csv"],
        accept_multiple_files=True,
        key="file_uploader_unique"
    )

    # Process button (outside columns to avoid sidebar bug)
    if uploaded_files and st.button("🚀 Process Files", use_container_width=True):
        with st.spinner(f"Processing {len(uploaded_files)} file(s)..."):
            success_count = 0
            existing_files = set(get_all_statement_paths(user_id))

            for f in uploaded_files:
                filename = f"{user_id}/{f.name}"

                if filename in existing_files:
                    st.warning(f"⏭️ {f.name} already exists")
                    continue

                try:
                    # 1. Upload to B2
                    storage_path = save_uploaded_file(f, user_id=user_id)

                    # 2. Save metadata to Supabase (CRITICAL!)
                    supabase.table("statements").insert({
                        "user_id": user_id,
                        "storage_key": storage_path,
                        "file_name": f.name,
                        "uploaded_at": datetime.utcnow().isoformat()
                    }).execute()

                    success_count += 1
                    print(f"SUCCESS: {f.name} -> {storage_path}")
                except Exception as e:
                    st.error(f"❌ {f.name}: {e}")

            if success_count > 0:
                st.session_state.upload_complete = True
                st.session_state.cache_buster += 1
                st.cache_data.clear()
                st.success(f"✅ Saved {success_count} new statements!")
                st.rerun()


# === DATA LOADING ===
@st.cache_data(ttl=60, show_spinner=False)
def load_and_parse_statements(_user_id, _cache_buster):
    paths = get_all_statement_paths(user_id=_user_id)
    st.write(f"🔍 Found {len(paths)} statements")  # DEBUG

    if not paths:
        return pd.DataFrame()

    all_dfs = []
    chase_parser = ChaseStatementParser(user_id=_user_id)
    amex_parser = AmexCSVParser(user_id=_user_id)

    for i, storage_path in enumerate(paths):
        content = download_statement(storage_path)
        if not content or len(content) == 0:
            print(f"Empty content: {storage_path}")
            continue

        file_name = storage_path.split("/")[-1]
        file_stream = BytesIO(content)

        try:
            if file_name.lower().endswith(".pdf"):
                df_file = chase_parser.parse(file_stream)
            elif file_name.lower().endswith(".csv"):
                df_file = amex_parser.parse(file_stream)
            else:
                continue

            if not df_file.empty:
                print(f"Parsed {len(df_file)} rows from {file_name}")
                all_dfs.append(df_file)
        except Exception as e:
            print(f"Parse error {storage_path}: {e}")

    if not all_dfs:
        return pd.DataFrame()

    df = pd.concat(all_dfs, ignore_index=True).drop_duplicates()
    return df.sort_values("Date", ascending=False)


# Load data
df = load_and_parse_statements(user_id, st.session_state.cache_buster)

if df.empty:
    st.info("👋 No statements found. Upload files in the sidebar!")
    st.stop()

st.success(f"✅ Dashboard: {len(df)} transactions loaded")

# === REVIEW QUEUE ===
uncategorized = df[df['Category'] == 'Uncategorized'].copy()
if not uncategorized.empty:
    st.warning(f"⚠️ {len(uncategorized)} uncategorized transactions")
    with st.expander("📝 Review & Categorize", expanded=True):
        options = sorted(list(CATEGORY_RULES.keys())) + ["Uncategorized", "Ignore"]
        edited_df = st.data_editor(
            uncategorized[['Date', 'Description', 'Amount', 'Category']],
            column_config={"Category": st.column_config.SelectboxColumn("Assign Category", options=options)},
            use_container_width=True
        )
        if st.button("💾 Save Rules"):
            for _, row in edited_df.iterrows():
                if row['Category'] not in ['Uncategorized', 'Ignore']:
                    save_learned_rule(row['Description'], row['Category'], user_id=user_id)
            st.cache_data.clear()
            st.rerun()

# === DASHBOARD ===
st.divider()
st.markdown("### 📈 Dashboard")

col1, col2, col3 = st.columns(3)
latest_month = df['Date'].dt.to_period('M').max()
month_df = df[df['Date'].dt.to_period('M') == latest_month]
spend = month_df[(month_df['Category'] != 'Savings') & (month_df['Amount'] < 0)]['Amount'].sum() * -1
saved = month_df[month_df['Category'] == 'Savings']['Amount'].sum() * -1

col1.metric("📅 Latest Month", str(latest_month))
col2.metric("💸 Spent", f"£{spend:,.0f}")
col3.metric("💰 Saved", f"£{saved:,.0f}")

col1, col2 = st.columns([1, 2])
with col1:
    st.plotly_chart(create_spending_pie_chart(df), use_container_width=True)
with col2:
    st.plotly_chart(create_monthly_trend_line(df), use_container_width=True)
    st.plotly_chart(create_balance_trend_line(df), use_container_width=True)

with st.expander("📋 All Transactions"):
    st.dataframe(df, use_container_width=True)
