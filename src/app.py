# budgetApp/src/app.py
import streamlit as st
import pandas as pd
import extra_streamlit_components as stx
import time

from ingestion.learning import save_learned_rule
from ingestion.storage import save_uploaded_file, get_all_statement_paths, get_user_dir
from ingestion.parser import ChaseStatementParser, AmexCSVParser
from analysis.charts import create_spending_pie_chart, create_monthly_trend_line, create_balance_trend_line
from config import CATEGORY_RULES

# Page Config
st.set_page_config(page_title="Budget Tracker", layout="wide")


# -----------------------------------------------------------------------------
# SESSION & AUTHENTICATION
# -----------------------------------------------------------------------------
def get_manager():
    return stx.CookieManager()


cookie_manager = get_manager()

# 1. Try to get logged-in user from cookie
if 'user_id' not in st.session_state:
    st.session_state['user_id'] = cookie_manager.get(cookie="budget_user_id")

# 2. Authentication Flow
if not st.session_state['user_id']:
    st.title("🔐 Login")

    tab1, tab2 = st.tabs(["Login", "Register"])

    with tab1:
        username_input = st.text_input("Username", key="login_user")
        if st.button("Login"):
            # Check if user directory exists
            user_dir = get_user_dir(username_input)
            if user_dir.exists():
                # Set cookie (expires in 30 days)
                cookie_manager.set("budget_user_id", username_input, key="set_login")
                st.session_state['user_id'] = username_input
                st.success(f"Welcome back, {username_input}!")
                time.sleep(1)
                st.rerun()
            else:
                st.error("User not found. Please register first.")

    with tab2:
        new_user = st.text_input("Choose Username", key="reg_user")
        if st.button("Create Account"):
            if new_user:
                # Create directory
                get_user_dir(new_user)
                # Login automatically
                cookie_manager.set("budget_user_id", new_user, key="set_reg")
                st.session_state['user_id'] = new_user
                st.success(f"Account created for {new_user}!")
                time.sleep(1)
                st.rerun()
            else:
                st.error("Please enter a username.")

    st.stop()  # Stop here until logged in

# -----------------------------------------------------------------------------
# MAIN APP (Only runs if logged in)
# -----------------------------------------------------------------------------
user_id = st.session_state['user_id']

# Sidebar User Info
with st.sidebar:
    st.write(f"👤 **{user_id}**")
    if st.button("Logout"):
        cookie_manager.delete("budget_user_id")
        st.session_state['user_id'] = None
        st.rerun()
    st.divider()

st.title("📊 Personal Finance Dashboard")

# Upload Logic
with st.sidebar:
    st.header("Upload Statements")
    uploaded_files = st.file_uploader(
        "Upload Statements (PDF or CSV)",
        type=["pdf", "csv"],
        accept_multiple_files=True
    )

    if uploaded_files:
        with st.spinner("Processing files..."):
            for f in uploaded_files:
                save_uploaded_file(f, user_id=user_id)
            st.success(f"Saved {len(uploaded_files)} new statements!")
            st.cache_data.clear()

# Load Data
all_files = get_all_statement_paths(user_id=user_id)
all_files = [f for f in all_files if f.suffix.lower() in ['.pdf', '.csv']]

if not all_files:
    st.info(f"Welcome, {user_id}! You have no statements yet. Upload them in the sidebar.")
else:
    # ... (Rest of your exact app logic goes here) ...
    # ... (Copy-paste the parsing logic from the previous step) ...

    # Initialize parsers
    all_dfs = []
    chase_parser = ChaseStatementParser(user_id=user_id)
    amex_parser = AmexCSVParser(user_id=user_id)

    with st.spinner("Parsing historical data..."):
        for f in all_files:
            try:
                if f.suffix.lower() == '.pdf':
                    df_file = chase_parser.parse(f)
                elif f.suffix.lower() == '.csv':
                    df_file = amex_parser.parse(f)
                else:
                    continue

                if not df_file.empty:
                    all_dfs.append(df_file)
            except Exception as e:
                st.error(f"Error parsing {f.name}: {e}")

    if not all_dfs:
        st.warning("Statements found but no transactions parsed.")
        df = pd.DataFrame()
    else:
        df = pd.concat(all_dfs, ignore_index=True).drop_duplicates()

    if not df.empty:
        df = df.sort_values(by="Date", ascending=False)

        # --- UNCATEGORIZED QUEUE ---
        uncategorized = df[df['Category'] == 'Uncategorized'].copy()

        if not uncategorized.empty:
            st.warning(f"⚠️ {len(uncategorized)} uncategorized items.")
            with st.expander("📝 Review Queue", expanded=True):
                options = sorted(list(CATEGORY_RULES.keys())) + ["Uncategorized", "Ignore"]
                edited_df = st.data_editor(
                    uncategorized[['Date', 'Description', 'Amount', 'Category']],
                    column_config={"Category": st.column_config.SelectboxColumn("Assign", options=options)},
                    hide_index=True, use_container_width=True, key="editor_uncat"
                )
                if st.button("Update Categories", key="btn_update"):
                    for index, row in edited_df.iterrows():
                        if row['Category'] not in ['Uncategorized', 'Ignore']:
                            save_learned_rule(row['Description'], row['Category'], user_id=user_id)
                    st.success("Saved!")
                    st.cache_data.clear()
                    st.rerun()

        # --- DASHBOARD ---
        st.divider()
        st.markdown("### Snapshot")
        col1, col2, col3 = st.columns(3)

        latest_month = df['Date'].dt.to_period('M').max()
        month_df = df[df['Date'].dt.to_period('M') == latest_month]

        # Metrics
        spend = month_df[(month_df['Category'] != 'Savings') & (month_df['Amount'] < 0)]['Amount'].sum() * -1
        save = (month_df[month_df['Category'] == 'Savings']['Amount'] * -1).sum()

        col1.metric("Month", str(latest_month))
        col2.metric("Spent", f"£{spend:,.2f}")
        col3.metric("Saved", f"£{save:,.2f}")

        # Charts
        st.plotly_chart(create_balance_trend_line(df), use_container_width=True, key="bal")
        c1, c2 = st.columns([1, 2])
        c1.plotly_chart(create_spending_pie_chart(df), use_container_width=True, key="pie")
        c2.plotly_chart(create_monthly_trend_line(df), use_container_width=True, key="line")

        with st.expander("Raw Data"):
            st.dataframe(df)
