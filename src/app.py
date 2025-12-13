# budgetApp/src/app.py
import streamlit as st
import pandas as pd

from ingestion.learning import save_learned_rule
from ingestion.storage import save_uploaded_file, get_all_statement_paths
from ingestion.parser import ChaseStatementParser, AmexCSVParser
from analysis.charts import create_spending_pie_chart, create_monthly_trend_line, create_balance_trend_line
from config import CATEGORY_RULES  # Import here for the dropdown options

# Page Config
st.set_page_config(page_title="Budget Tracker", layout="wide")
st.title("📊 Personal Finance Dashboard")

# Sidebar for Actions
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
                save_uploaded_file(f)
            st.success(f"Saved {len(uploaded_files)} new statements!")
            # Clear cache to force reload of new files
            st.cache_data.clear()

# Main Application Logic

# 1. Load ALL stored data
all_files = get_all_statement_paths()
# Filter for supported extensions
all_files = [f for f in all_files if f.suffix.lower() in ['.pdf', '.csv']]

if not all_files:
    st.info("No statements found. Please upload your Chase PDF or Amex CSV statements to begin.")
else:
    # We need a unified parse logic that handles mixed types
    all_dfs = []

    chase_parser = ChaseStatementParser()
    amex_parser = AmexCSVParser()

    with st.spinner("Parsing historical data..."):
        for f in all_files:
            try:
                if f.suffix.lower() == '.pdf':
                    # It's Chase (or potentially Amex PDF, but we assume Chase based on earlier context)
                    df_file = chase_parser.parse(f)
                elif f.suffix.lower() == '.csv':
                    # It's Amex CSV
                    df_file = amex_parser.parse(f)
                else:
                    continue

                if not df_file.empty:
                    all_dfs.append(df_file)
            except Exception as e:
                st.error(f"Error parsing {f.name}: {e}")

    # Combine all data
    if not all_dfs:
        st.warning("Statements were found, but no transactions could be parsed.")
        df = pd.DataFrame()
    else:
        df = pd.concat(all_dfs, ignore_index=True).drop_duplicates()

    # Only proceed if we have a valid DataFrame
    if not df.empty:
        # Sort by date
        df = df.sort_values(by="Date", ascending=False)

        # --- FEATURE: UNCATEGORIZED REVIEW QUEUE ---
        uncategorized = df[df['Category'] == 'Uncategorized'].copy()

        if not uncategorized.empty:
            st.warning(f"⚠️ You have {len(uncategorized)} uncategorized transactions. Please review them below.")

            with st.expander("📝 Review Uncategorized Items", expanded=True):
                # Add 'Uncategorized' and 'Ignore' to options
                options = sorted(list(CATEGORY_RULES.keys())) + ["Uncategorized", "Ignore"]

                # Create the editor
                edited_df = st.data_editor(
                    uncategorized[['Date', 'Description', 'Amount', 'Category']],
                    column_config={
                        "Category": st.column_config.SelectboxColumn(
                            "Assign Category",
                            help="Select the correct category for this transaction",
                            options=options,
                            required=True,
                        )
                    },
                    hide_index=True,
                    use_container_width=True,
                    key="editor_uncat"
                )

                # Button to Apply Changes
                if st.button("Update Categories", key="btn_update_review"):
                    # Process all edits
                    for index, row in edited_df.iterrows():
                        new_category = row['Category']

                        # 1. Save rule if it's a real category
                        if new_category not in ['Uncategorized', 'Ignore']:
                            save_learned_rule(row['Description'], new_category)

                        # 2. Update the main DataFrame (df) in memory
                        # This ensures visual feedback even before the re-parse happens
                        mask = (
                                (df['Date'] == row['Date']) &
                                (df['Description'] == row['Description']) &
                                (df['Amount'] == row['Amount'])
                        )
                        df.loc[mask, 'Category'] = new_category

                    st.success("Categories updated and rules saved!")
                    # Clear cache to ensure next parse picks up new rules
                    st.cache_data.clear()
                    st.rerun()

        # --- Top Level Metrics ---
        st.divider()
        st.markdown("### Snapshot")
        col1, col2, col3 = st.columns(3)

        # Calculate stats for the *latest* month present in data
        latest_month = df['Date'].dt.to_period('M').max()
        current_month_data = df[df['Date'].dt.to_period('M') == latest_month].copy()

        # Calculate Real "Spending" (Excluding Savings)
        non_savings_spend = current_month_data[
                                (current_month_data['Category'] != 'Savings') &
                                (current_month_data['Amount'] < 0)
                                ]['Amount'].sum() * -1

        # Calculate Net Savings
        net_savings = (current_month_data[current_month_data['Category'] == 'Savings']['Amount'] * -1).sum()

        col1.metric("Latest Month", str(latest_month))
        col2.metric("Total Spent", f"£{non_savings_spend:,.2f}")
        col3.metric("Net Saved", f"£{net_savings:,.2f}")

        # --- Visualizations ---
        st.markdown("### Financial Trends")

        # Row 1: The Balance Graph
        # Note: Amex CSVs might have 0 balance, so this graph will mix Chase balances with 0s.
        # Ideally, we filter out accounts with 0 balance or plot them separately.
        # For now, it plots whatever is in the 'Balance' column.
        st.plotly_chart(
            create_balance_trend_line(df),
            use_container_width=True,
            key="balance_chart"
        )

        # Row 2: Spending Graphs
        col_chart1, col_chart2 = st.columns([1, 2])

        with col_chart1:
            st.plotly_chart(
                create_spending_pie_chart(df),
                use_container_width=True,
                key="spending_pie"
            )

        with col_chart2:
            st.plotly_chart(
                create_monthly_trend_line(df),
                use_container_width=True,
                key="spending_trend"
            )

        # --- Data Table ---
        with st.expander("View Raw Transaction Data"):
            st.dataframe(df.style.format({"Amount": "£{:.2f}"}))
