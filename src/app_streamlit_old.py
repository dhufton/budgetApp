# budgetApp/src/app.py
import time
from datetime import datetime
from io import BytesIO

import pandas as pd

from src.supabase_client import supabase
from ingestion.storage import save_uploaded_file, get_all_statement_paths, download_statement
from ingestion.learning import save_learned_rule
from ingestion.parser import ChaseStatementParser, AmexCSVParser
from analysis.charts import (
    create_spending_pie_chart,
    create_monthly_trend_line,
    create_balance_trend_line,
)
from config import CATEGORY_RULES
from budgeting.categories import (
    get_user_categories,
    get_budget_targets,
    get_category_spending,
    add_category,
    delete_category,
    set_budget_target
)

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


# ---------- Data loading & parsing (from storage) ----------

@st.cache_data(ttl=300, show_spinner=True)
def load_and_parse_statements(_user_id: str) -> pd.DataFrame:
    """Load and parse all statements from storage for this user."""
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


# ---------- Settings Page ----------

def render_settings_page(user_id: str):
    """Settings page for categories and budgets."""
    st.title("⚙️ Settings")

    tab1, tab2 = st.tabs(["📂 Categories", "💰 Budget Targets"])

    # ===== CATEGORIES TAB =====
    with tab1:
        st.markdown("### Your Categories")

        # List current categories
        categories = get_user_categories(user_id)
        if categories:
            st.write("**Current categories:**")
            for cat in sorted(categories):
                col1, col2 = st.columns([4, 1])
                col1.write(f"• {cat}")
                if col2.button("🗑️", key=f"del_{cat}"):
                    delete_category(user_id, cat)
                    st.success(f"Deleted '{cat}'")
                    st.rerun()
        else:
            st.info("No custom categories yet.")

        st.divider()

        # Add new category
        st.markdown("### Add New Category")
        new_cat = st.text_input("Category Name", placeholder="e.g. Entertainment")

        if st.button("➕ Add Category", disabled=not new_cat, use_container_width=True):
            if new_cat and new_cat not in categories:
                add_category(user_id, new_cat)
                st.success(f"Added '{new_cat}'")
                st.cache_data.clear()
                st.rerun()
            elif new_cat in categories:
                st.warning("Category already exists!")

    # ===== BUDGET TARGETS TAB =====
    with tab2:
        st.markdown("### Monthly Budget Targets")

        categories = get_user_categories(user_id)
        if not categories:
            st.info("💡 Create some categories first in the Categories tab!")
            return

        # Load existing targets
        targets_df = get_budget_targets(user_id)
        targets_dict = dict(
            zip(targets_df["category_name"], targets_df["monthly_target"])) if not targets_df.empty else {}

        # Editable budget table
        budget_data = []
        for cat in sorted(categories):
            budget_data.append({
                "Category": cat,
                "Monthly Target (£)": float(targets_dict.get(cat, 0.0))
            })

        if budget_data:
            edited_df = st.data_editor(
                budget_data,
                use_container_width=True,
                hide_index=True,
                column_config={
                    "Monthly Target (£)": st.column_config.NumberColumn(
                        "Monthly Target (£)",
                        min_value=0.0,
                        format="£%.2f"
                    )
                },
                key="budget_editor"
            )

            if st.button("💾 Save Budget Targets", use_container_width=True):
                for row in edited_df:
                    if row["Monthly Target (£)"] > 0:
                        set_budget_target(user_id, row["Category"], row["Monthly Target (£)"])
                st.success("✅ Budget targets saved!")
                st.cache_data.clear()
                time.sleep(1)
                st.rerun()


# ---------- Main layout ----------

st.sidebar.markdown(f"👤 **{user_email}**")

# ---------- Sidebar: logout + navigation + upload ----------

with st.sidebar:
    if st.button("🚪 Logout", use_container_width=True):
        supabase.auth.sign_out()
        logout()
        st.rerun()

    st.divider()

    # Navigation
    page = st.radio(
        "📍 Navigate",
        ["📊 Dashboard", "⚙️ Settings"],
        label_visibility="collapsed"
    )

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
                    # 1. Upload raw file to B2
                    saved_path = save_uploaded_file(f, user_id=user_id)

                    # 2. Ensure user exists
                    user_row = supabase.table("users").select("id").eq("id", user_id).execute()
                    if not user_row:
                        supabase.table("users").insert({
                            "id": user_id,
                            "username": user_email.split("@")[0],
                            "email": user_email,
                        }).execute()

                    # 3. Save statement metadata
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

# ---------- Page routing ----------

if page == "⚙️ Settings":
    render_settings_page(user_id)
    st.stop()

# ---------- DASHBOARD PAGE ----------

st.title("📊 Personal Finance Dashboard")

# Load data
df = load_and_parse_statements(user_id)

if df.empty:
    st.info("👋 No statements found yet. Upload some using the sidebar to see your dashboard.")
    st.stop()

st.success(f"✅ Loaded {len(df):,} transactions from {len(get_all_statement_paths(user_id))} files")

# ---------- Review queue ----------

uncategorized = df[df["Category"] == "Uncategorized"].copy()
if not uncategorized.empty:
    st.warning(f"⚠️ {len(uncategorized)} uncategorized transactions to review.")
    with st.expander("📝 Review & Categorize", expanded=True):
        # Merge default + custom categories
        user_categories = get_user_categories(user_id)
        default_categories = sorted(list(CATEGORY_RULES.keys()))
        options = sorted(set(user_categories + default_categories)) + ["Uncategorized", "Ignore"]

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

# ---------- Budget vs Actual ----------

st.divider()
st.markdown("### 💰 Budget vs Actual (This Month)")

latest_month = df["Date"].dt.to_period("M").max()
targets_df = get_budget_targets(user_id)

if not targets_df.empty:
    spending_df = get_category_spending(df, latest_month)

    # Merge targets with actual spending
    budget_comparison = targets_df.merge(
        spending_df,
        left_on="category_name",
        right_on="Category",
        how="left"
    ).fillna(0)

    budget_comparison["spent"] = budget_comparison["spent"].abs()
    budget_comparison["remaining"] = budget_comparison["monthly_target"] - budget_comparison["spent"]
    budget_comparison["% used"] = (budget_comparison["spent"] / budget_comparison["monthly_target"] * 100).round(1)

    # Display as table
    st.dataframe(
        budget_comparison[["category_name", "monthly_target", "spent", "remaining", "% used"]],
        column_config={
            "category_name": "Category",
            "monthly_target": st.column_config.NumberColumn("Budget", format="£%.0f"),
            "spent": st.column_config.NumberColumn("Spent", format="£%.0f"),
            "remaining": st.column_config.NumberColumn("Remaining", format="£%.0f"),
            "% used": st.column_config.ProgressColumn("Progress", min_value=0, max_value=100)
        },
        use_container_width=True,
        hide_index=True
    )
else:
    st.info("💡 Set budget targets in Settings to track spending vs budget.")

# ---------- Dashboard metrics ----------

st.divider()
st.markdown("### 📈 Dashboard Snapshot")

col1, col2, col3 = st.columns(3)
month_df = df[df["Date"].dt.to_period("M") == latest_month]

spend = month_df[(month_df["Category"] != "Savings") & (month_df["Amount"] < 0)]["Amount"].sum() * -1
saved = month_df[month_df["Category"] == "Savings"]["Amount"].sum() * -1

col1.metric("📅 Latest Month", str(latest_month))
col2.metric("💸 Total Spent", f"£{spend:,.0f}")
col3.metric("💰 Net Saved", f"£{saved:,.0f}")

# ---------- Charts ----------

col_chart1, col_chart2 = st.columns([1, 2])
with col_chart1:
    st.plotly_chart(create_spending_pie_chart(df), use_container_width=True)
with col_chart2:
    st.plotly_chart(create_monthly_trend_line(df), use_container_width=True)
    st.plotly_chart(create_balance_trend_line(df), use_container_width=True)

# ---------- All transactions ----------

with st.expander("📋 View All Transactions", expanded=False):
    st.dataframe(df, use_container_width=True)
