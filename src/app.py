# budgetApp/src/app.py
import streamlit as st
import pandas as pd
from ingestion.storage import save_uploaded_file, get_all_statement_paths
from ingestion.parser import ChaseStatementParser
from analysis.charts import create_spending_pie_chart, create_monthly_trend_line, create_balance_trend_line

# Page Config
st.set_page_config(page_title="Budget Tracker", layout="wide")
st.title("📊 Personal Finance Dashboard")

# Sidebar for Actions
with st.sidebar:
    st.header("Upload Statements")
    uploaded_files = st.file_uploader(
        "Upload PDF Statements",
        type="pdf",
        accept_multiple_files=True
    )

    if uploaded_files:
        with st.spinner("Processing files..."):
            for f in uploaded_files:
                save_uploaded_file(f)
            st.success(f"Saved {len(uploaded_files)} new statements!")

# Main Application Logic
parser = ChaseStatementParser()

# 1. Load ALL stored data (historical + new)
all_files = get_all_statement_paths()

if not all_files:
    st.info("No statements found. Please upload your Chase PDF statements to begin.")
else:
    # Parse everything found in the data/statements folder
    df = parser.parse_multiple(all_files)

    if df.empty:
        st.warning("Statements found but no transactions could be parsed.")
    else:
        # Sort by date
        df = df.sort_values(by="Date", ascending=False)  # Newest first is better for review

        # --- FEATURE: UNCATEGORIZED REVIEW QUEUE ---
        uncategorized = df[df['Category'] == 'Uncategorized'].copy()

        if not uncategorized.empty:
            st.warning(f"⚠️ You have {len(uncategorized)} uncategorized transactions. Please review them below.")

            with st.expander("📝 Review Uncategorized Items", expanded=True):
                # Get list of valid categories from your config
                from config import CATEGORY_RULES

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
                if st.button("Update Categories"):
                    # 1. Update the main dataframe 'df' with new values from 'edited_df'
                    # We match on Date, Description, and Amount to find the original row
                    # (Note: In a real DB app, we'd use a unique ID. For this CSV approach, this is a safe proxy)

                    for index, row in edited_df.iterrows():
                        mask = (
                                (df['Date'] == row['Date']) &
                                (df['Description'] == row['Description']) &
                                (df['Amount'] == row['Amount'])
                        )
                        # Apply new category
                        df.loc[mask, 'Category'] = row['Category']

                    # 2. Filter out "Ignore" or still "Uncategorized" if you want to clean up charts
                    # For now, we just rerun the app to refresh the charts with new data
                    st.rerun()

        # --- Top Level Metrics (Rest of your code) ---
        st.divider()
        st.markdown("### Snapshot")
        # ... (Rest of your existing app.py code below) ...

        # --- Visualizations ---
        st.markdown("### Financial Trends")

        # Row 1: The Balance Graph
        st.plotly_chart(
            create_balance_trend_line(df),
            use_container_width=True,
            key="balance_chart"  # <--- Added unique key
        )

        # Row 2: Spending Graphs
        col_chart1, col_chart2 = st.columns([1, 2])

        with col_chart1:
            st.plotly_chart(
                create_spending_pie_chart(df),
                use_container_width=True,
                key="spending_pie"  # <--- Added unique key
            )

        with col_chart2:
            st.plotly_chart(
                create_monthly_trend_line(df),
                use_container_width=True,
                key="spending_trend"  # <--- Added unique key
            )

        # --- Data Table ---
        with st.expander("View Raw Transaction Data"):
            st.dataframe(df.style.format({"Amount": "£{:.2f}"}))
