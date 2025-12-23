# budgetApp/src/app.py
import time
from datetime import datetime
from io import BytesIO

import pandas as pd
import streamlit as st

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


# ---------- Auth helpers ----------

def get_current_user():
    return st.session_state.get("user")


def set_current_user(res):
    st.session_state["user"] = res.user
    st.session_state["supabase_session"] = res.session


def logout():
    st.session_state.pop("user", None)
    st.session_state.pop("supabase_session", None)


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
                else:
                    st.error("Login failed.")
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
                else:
                    st.error("Registration failed.")
            except Exception as e:
                st.error(f"Registration error: {e}")


# ---------- Auth gate ----------

user = get_current_user()
if not user:
    auth_view()
    st.stop()

user_id = user.id
user_email = user.email


# ---------- ULTRA-FAST DATA LOADERS ----------

@st.cache_data(ttl=300)
def get_dashboard_summary(user_id: str) -> dict:
    """Get metrics + recent data for dashboard (200ms)."""
    # Recent transactions (max 2000 rows)
    recent_res = supabase.table("transactions") \
        .select("date,description,amount,category") \
        .eq("user_id", user_id) \
        .order("date", desc=True) \
        .limit(2000) \
        .execute()

    df_recent = pd.DataFrame(recent_res.data or [])
    total_txns = len(df_recent)

    return {
        "total_transactions": total_txns,
        "recent_data": df_recent,
        "latest_date": pd.to_datetime(df_recent["date"]).max() if not df_recent.empty else None
    }


@st.cache_data(ttl=600)
def get_monthly_summary(user_id: str) -> pd.DataFrame:
    """Monthly summary from recent data (pre-aggregated)."""
    summary = get_dashboard_summary(user_id)
    df = summary["recent_data"].copy()

    if df.empty:
        return pd.DataFrame()

    # Fast aggregation in Python
    df["date"] = pd.to_datetime(df["date"])
    df["month"] = df["date"].dt.to_period("M").dt.to_timestamp()

    monthly = df.groupby(["month", "category"], as_index=False)["amount"].sum()
    return monthly.sort_values("month", ascending=False)


@st.cache_data(ttl=300)
def get_recent_uncategorized(user_id: str, limit: int = 50) -> pd.DataFrame:
    """Recent uncategorized transactions only."""
    res = supabase.table("transactions") \
        .select("date,description,amount,category") \
        .eq("user_id", user_id) \
        .eq("category", "Uncategorized") \
        .order("date", desc=True) \
        .limit(limit) \
        .execute()
    return pd.DataFrame(res.data or [])


# ---------- Main layout ----------

st.title("📊 Personal Finance Dashboard")
st.sidebar.markdown(f"👤 **{user_email}**")

# ---------- Sidebar: logout + upload ----------

with st.sidebar:
    if st.button("🚪 Logout", use_container_width=True):
        supabase.auth.sign_out()
        logout()
        st.rerun()

    st.divider()
    st.header("📁 Upload Statements")

    uploaded_files = st.file_uploader(
        "Upload Statements (PDF or CSV)",
        type=["pdf", "csv"],
        accept_multiple_files=True,
        key="file_uploader_unique",
    )

    if uploaded_files and st.button("🚀 Process Files", use_container_width=True, key="process_btn"):
        with st.spinner(f"Processing {len(uploaded_files)} file(s)..."):
            success_count = 0
            existing_paths = set(get_all_statement_paths(user_id))

            for f in uploaded_files:
                storage_path = f"{user_id}/{f.name}"

                if storage_path in existing_paths:
                    st.warning(f"⏭️ {f.name} already exists")
                    continue

                try:
                    # 1. Parse immediately
                    content = f.getvalue()
                    file_stream = BytesIO(content)

                    if f.name.lower().endswith(".pdf"):
                        df_transactions = ChaseStatementParser(user_id).parse(file_stream)
                    else:
                        df_transactions = AmexCSVParser(user_id).parse(file_stream)

                    if df_transactions.empty:
                        st.warning(f"⚠️ No transactions in {f.name}")
                        continue

                    # 2. Upload raw file to B2
                    saved_path = save_uploaded_file(f, user_id=user_id)

                    # 3. Ensure user exists
                    user_row = supabase.table("users").select("id").eq("id", user_id).execute()
                    if not user_row:
                        supabase.table("users").insert({
                            "id": user_id,
                            "username": user_email.split("@")[0],
                            "email": user_email,
                        }).execute()

                    # 4. Cache parsed transactions (FAST future loads)
                    df_transactions["user_id"] = user_id
                    df_transactions["statement_path"] = saved_path
                    df_transactions["parsed_at"] = datetime.utcnow().isoformat()

                    records = df_transactions.to_dict("records")
                    supabase.table("transactions").insert(records).execute()

                    # 5. Save statement metadata
                    supabase.table("statements").insert({
                        "user_id": user_id,
                        "storage_key": saved_path,
                        "file_name": f.name,
                        "uploaded_at": datetime.utcnow().isoformat(),
                    }).execute()

                    success_count += 1
                except Exception as e:
                    st.error(f"❌ {f.name}: {e}")

            if success_count > 0:
                st.success(f"✅ Cached {success_count} statement(s)!")
                st.cache_data.clear()
                st.rerun()
            else:
                st.info("No new files uploaded.")

# ---------- ULTRA-FAST DASHBOARD ----------

# Load data (~200ms)
summary = get_dashboard_summary(user_id)

if summary["total_transactions"] == 0:
    st.info("👋 No transactions yet. Upload statements to get started!")
    st.stop()

df_recent = summary["recent_data"]
st.success(f"✅ {summary['total_transactions']:,} transactions loaded")

# ---------- Review queue (50 recent only) ----------
uncategorized = get_recent_uncategorized(user_id)
if not uncategorized.empty:
    st.warning(f"⚠️ {len(uncategorized)} recent uncategorized transactions")
    with st.expander("📝 Quick Review", expanded=True):
        options = sorted(list(CATEGORY_RULES.keys())) + ["Uncategorized", "Ignore"]
        edited_df = st.data_editor(
            uncategorized[["date", "description", "amount", "category"]],
            column_config={
                "category": st.column_config.SelectboxColumn("Assign Category", options=options)
            },
            hide_index=True,
            use_container_width=True,
            key="editor",
        )
        if st.button("💾 Apply Rules", use_container_width=True):
            for _, row in edited_df.iterrows():
                if row["category"] not in ["Uncategorized", "Ignore"]:
                    save_learned_rule(row["description"], row["category"], user_id=user_id)
            st.success("✅ Rules saved!")
            st.cache_data.clear()
            st.rerun()

# ---------- Metrics ----------
st.divider()
st.markdown("### 📈 Quick Stats")

col1, col2, col3 = st.columns(3)
latest_date = summary["latest_date"]
if latest_date:
    col1.metric("📅 Latest Activity", latest_date.strftime("%b %d"))
col2.metric("💳 Total Transactions", f"{summary['total_transactions']:,}")
col3.metric("📊 Chart Data", f"{len(df_recent):,} rows")

# ---------- Charts ----------
monthly_summary = get_monthly_summary(user_id)

col_chart1, col_chart2 = st.columns([1, 2])
with col_chart1:
    # Pie chart (sampled recent data)
    df_pie = df_recent.sample(min(1000, len(df_recent)), random_state=42)
    st.plotly_chart(create_spending_pie_chart(df_pie), use_container_width=True)
with col_chart2:
    # Monthly trends
    if not monthly_summary.empty:
        st.plotly_chart(create_monthly_trend_line(monthly_summary), use_container_width=True)
    # Balance trend (sampled)
    df_balance = df_recent.sample(min(500, len(df_recent)), random_state=42)
    st.plotly_chart(create_balance_trend_line(df_balance), use_container_width=True)

# ---------- Paginated table ----------
with st.expander("📋 All Transactions", expanded=False):
    page_size = 100
    total_pages = (summary["total_transactions"] + page_size - 1) // page_size
    page = st.number_input("Page", min_value=1, max_value=total_pages or 1, value=1)

    offset = (page - 1) * page_size
    res = supabase.table("transactions") \
        .select("date,description,amount,category") \
        .eq("user_id", user_id) \
        .order("date", desc=True) \
        .range(offset, offset + page_size - 1) \
        .execute()

    df_page = pd.DataFrame(res.data or [])
    st.dataframe(df_page, use_container_width=True)
    st.caption(f"Page {page} of {total_pages} • {summary['total_transactions']:,} total")
