# budgetApp/src/app.py
import streamlit as st
import pandas as pd
import time
from io import BytesIO

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


user = get_current_user()
if not user:
    auth_view()
    st.stop()

user_id = user.id
user_email = user.email

# === UPLOAD STATE MANAGEMENT ===
if "upload_complete" not in st.session_state:
    st.session_state.upload_complete = False

# === MAIN DASHBOARD ===
st.title("📊 Personal Finance Dashboard")
st.sidebar.markdown(f"👤 **{user_email}**")

# Sidebar: Logout + Upload
with st.sidebar:
    if st.button("🚪 Logout", use_container_width=True):
        supabase.auth.sign_out()
        logout()
        st.rerun()

    st.divider()
    st.header("📁 Upload Statements")

    # Show upload success message
    if st.session_state.upload_complete:
        st.success("✅ Files uploaded successfully!")
        st.info("Dashboard refreshed with new data.")
        st.session_state.upload_complete = False  # Reset flag

    uploaded_files = st.file_uploader(
        "Upload Statements (PDF or CSV)",
        type=["pdf", "csv"],
        accept_multiple_files=True,
        key="file_uploader",  # Unique key prevents re-trigger
    )

    # Handle uploads ONLY when files change AND not already processing
    if uploaded_files and not st.session_state.upload_complete:
        if st.button("🚀 Process Files", use_container_width=True, key="process_btn"):
            with st.spinner(f"Processing {len(uploaded_files)} file(s)..."):
                success_count = 0
                existing_files = set(get_all_statement_paths(user_id))

                for f in uploaded_files:
                    filename = f"{user_id}/{f.name}"

                    # Skip duplicates
                    if filename in existing_files:
                        st.sidebar.warning(f"⏭️ {f.name} already exists")
                        continue

                    try:
                        save_uploaded_file(f, user_id=user_id)
                        success_count += 1
                        existing_files.add(filename)
                    except Exception as e:
                        st.sidebar.error(f"❌ {f.name}: {e}")

                if success_count > 0:
                    st.session_state.upload_complete = True
                    st.cache_data.clear()
                    st.rerun()
                else:
                    st.sidebar.warning("No new files to upload.")


# === DATA LOADING & PARSING ===
@st.cache_data(ttl=300, show_spinner=False)
def load_and_parse_statements(_user_id):
    """Load and parse all user statements from B2 storage."""
    paths = get_all_statement_paths(user_id=_user_id)
    if not paths:
        return pd.DataFrame()

    all_dfs = []
    chase_parser = ChaseStatementParser(user_id=_user_id)
    amex_parser = AmexCSVParser(user_id=_user_id)

    for storage_path in paths:
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
            print(f"Failed to parse {file_name}: {e}")

    if not all_dfs:
        return pd.DataFrame()

    df = pd.concat(all_dfs, ignore_index=True).drop_duplicates()
    return df.sort_values("Date", ascending=False)


# Load data
df = load_and_parse_statements(user_id)

if df.empty:
    st.info("👋 No statements found yet. Upload some using the sidebar to see your dashboard!")
    st.stop()

# === REVIEW QUEUE ===
uncategorized = df[df['Category'] == 'Uncategorized'].copy()
if not uncategorized.empty:
    st.warning(f"⚠️ {len(uncategorized)} uncategorized transactions to review.")
    with st.expander("📝 Review & Categorize", expanded=True):
        options = sorted(list(CATEGORY_RULES.keys())) + ["Uncategorized", "Ignore"]
        edited_df = st.data_editor(
            uncategorized[['Date', 'Description', 'Amount', 'Category']],
            column_config={"Category": st.column_config.SelectboxColumn("Assign Category", options=options)},
            hide_index=True, use_container_width=True, key="editor"
        )
        if st.button("💾 Save Rules", use_container_width=True):
            for _, row in edited_df.iterrows():
                if row['Category'] not in ['Uncategorized', 'Ignore']:
                    save_learned_rule(row['Description'], row['Category'], user_id=user_id)
            st.success("✅ Rules updated!")
            st.cache_data.clear()
            st.rerun()

# === DASHBOARD METRICS & CHARTS ===
st.divider()
st.markdown("### 📈 Dashboard Snapshot")

col1, col2, col3 = st.columns(3)
latest_month = df['Date'].dt.to_period('M').max()
month_df = df[df['Date'].dt.to_period('M') == latest_month]
spend = month_df[(month_df['Category'] != 'Savings') & (month_df['Amount'] < 0)]['Amount'].sum() * -1
saved = month_df[month_df['Category'] == 'Savings']['Amount'].sum() * -1

col1.metric("📅 Latest Month", str(latest_month))
col2.metric("💸 Total Spent", f"£{spend:,.0f}")
col3.metric("💰 Net Saved", f"£{saved:,.0f}")

# Charts row
col_chart1, col_chart2 = st.columns([1, 2])
with col_chart1:
    st.plotly_chart(create_spending_pie_chart(df), use_container_width=True)
with col_chart2:
    st.plotly_chart(create_monthly_trend_line(df), use_container_width=True)
    st.plotly_chart(create_balance_trend_line(df), use_container_width=True)

# Raw data expander
with st.expander("📋 View All Transactions", expanded=False):
    st.dataframe(df, use_container_width=True)
