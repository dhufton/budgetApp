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


# Hydrate supabase session on rerun if we have it
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


# ---------- OPTIMIZED DATA LOADING ----------

@st.cache_data(ttl=1800)  # 30 minutes
def get_cached_transactions(_user_id: str) -> pd.DataFrame:
    """Load cached transactions from Supabase (FAST) or parse files (SLOW, cached)."""
    # 1. Try cached transactions first
    res = supabase.table("transactions") \
        .select("*") \
        .eq("user_id", _user_id) \
        .order("date", desc=True) \
        .execute()

    if res:
        df = pd.DataFrame(res.data)
        if not df.empty:
            print(f"✅ Loaded {len(df):,} cached transactions")
            return df

    # 2. Fallback: parse from files (will cache next time)
    print("⚠️ No cached transactions, parsing from files...")
    return load_and_parse_from_files(_user_id)


@st.cache_data(ttl=1800)
def load_and_parse_from_files(_user_id: str) -> pd.DataFrame:
    """Parse raw files (used as fallback, results cached in transactions table)."""
    paths = get_all_statement_paths(user_id=_user_id)
    if not paths:
        return pd.DataFrame()

    all_dfs = []
    chase_parser = ChaseStatementParser(user_id=_user_id)
    amex_parser = AmexCSVParser(user_id=_user_id)

    for storage_path in paths[-10:]:  # Only last 10 files for speed
        content = download_statement(storage_path)
        if not content:
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
                all_dfs.append(df_file)
        except Exception as e:
            print(f"Parse error {file_name}: {e}")

    if not all_dfs:
        return pd.DataFrame()

    df = pd.concat(all_dfs, ignore_index=True).drop_duplicates()
    return df.sort_values("Date", ascending=False)


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
                    # 1. Upload to B2
                    saved_path = save_uploaded_file(f, user_id=user_id)

                    # 2. Ensure user row exists
                    user_row = supabase.table("users").select("id").eq("id", user_id).execute()
                    if not user_row:
                        supabase.table("users").insert({
                            "id": user_id,
                            "username": user_email.split("@")[0],
                            "email": user_email,
                        }).execute()

                    # 3. Parse and cache transactions
                    content = f.getvalue()
                    file_stream = BytesIO(content)

                    if f.name.lower().endswith(".pdf"):
                        df_transactions = ChaseStatementParser(user_id).parse(file_stream)
                    else:  # csv
                        df_transactions = AmexCSVParser(user_id).parse(file_stream)

                    if not df_transactions.empty:
                        # Add metadata and save to transactions table (FAST queries)
                        df_transactions["user_id"] = user_id
                        df_transactions["statement_path"] = saved_path
                        df_transactions["parsed_at"] = datetime.utcnow().isoformat()

                        # Batch insert
                        records = df_transactions.to_dict("records")
                        supabase.table("transactions").insert(records).execute()
                        print(f"✅ Cached {len(df_transactions)} transactions")

                    # 4. Save statement metadata
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
                st.success(f"✅ Saved {success_count} new statement(s)!")
                st.cache_data.clear()
                st.rerun()
            else:
                st.info("No new files uploaded.")

# ---------- Load data ----------

df = get_cached_transactions(user_id)

if df.empty:
    st.info("👋 No transactions found yet. Upload statements using the sidebar!")
    st.stop()

st.success(f"✅ Loaded {len(df):,} transactions")

# ---------- Review queue ----------

uncategorized = df[df["Category"] == "Uncategorized"].copy()
if not uncategorized.empty:
    st.warning(f"⚠️ {len(uncategorized)} uncategorized transactions to review.")
    with st.expander("📝 Review & Categorize", expanded=True):
        options = sorted(list(CATEGORY_RULES.keys())) + ["Uncategorized", "Ignore"]
        edited_df = st.data_editor(
            uncategorized[["Date", "Description", "Amount", "Category"]],
            column_config={
                "Category": st.column_config.SelectboxColumn("Assign Category", options=options)
            },
            hide_index=True,
            use_container_width=True,
            key="editor",
        )
        if st.button("💾 Save Rules", use_container_width=True):
            for _, row in edited_df.iterrows():
                if row["Category"] not in ["Uncategorized", "Ignore"]:
                    save_learned_rule(row["Description"], row["Category"], user_id=user_id)
            st.success("✅ Rules updated!")
            st.cache_data.clear()
            st.rerun()

# ---------- Dashboard ----------

st.divider()
st.markdown("### 📈 Dashboard Snapshot")

col1, col2, col3 = st.columns(3)
latest_month = df["Date"].dt.to_period("M").max()
month_df = df[df["Date"].dt.to_period("M") == latest_month]

spend = month_df[(month_df["Category"] != "Savings") & (month_df["Amount"] < 0)]["Amount"].sum() * -1
saved = month_df[month_df["Category"] == "Savings"]["Amount"].sum() * -1

col1.metric("📅 Latest Month", str(latest_month))
col2.metric("💸 Total Spent", f"£{spend:,.0f}")
col3.metric("💰 Net Saved", f"£{saved:,.0f}")

# Charts (use sampled data for speed)
df_chart = df.sample(min(1000, len(df))) if len(df) > 1000 else df
col_chart1, col_chart2 = st.columns([1, 2])
with col_chart1:
    st.plotly_chart(create_spending_pie_chart(df_chart), use_container_width=True)
with col_chart2:
    st.plotly_chart(create_monthly_trend_line(df_chart), use_container_width=True)
    st.plotly_chart(create_balance_trend_line(df_chart), use_container_width=True)

with st.expander("📋 View All Transactions", expanded=False):
    st.dataframe(df, use_container_width=True)
