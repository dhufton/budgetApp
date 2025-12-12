# budgetApp/src/app.py
import streamlit as st
import pandas as pd
from ingestion.storage import save_uploaded_file, get_all_statement_paths
from ingestion.parser import ChaseStatementParser
from analysis.charts import create_spending_pie_chart, create_monthly_trend_line

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
        df = df.sort_values(by="Date")

        # --- Top Level Metrics ---
        st.markdown("### Snapshot")
        col1, col2, col3 = st.columns(3)

        # Calculate stats for the *latest* month in the data
        latest_month = df['Date'].dt.to_period('M').max()
        current_month_data = df[df['Date'].dt.to_period('M') == latest_month]
        total_spend = current_month_data[current_month_data['Amount'] < 0]['Amount'].sum() * -1

        col1.metric("Latest Month", str(latest_month))
        col2.metric("Total Spent", f"£{total_spend:,.2f}")
        col3.metric("Transactions", len(current_month_data))

        st.divider()

        # --- Visualizations ---
        col_chart1, col_chart2 = st.columns([1, 2])

        with col_chart1:
            st.subheader("Spending Mix")
            # Pie Chart
            fig_pie = create_spending_pie_chart(df)
            st.plotly_chart(fig_pie, use_container_width=True)

        with col_chart2:
            st.subheader("Monthly Trends vs Budget")
            # Filter to last 6 months for the line graph
            six_months_ago = df['Date'].max() - pd.DateOffset(months=6)
            recent_df = df[df['Date'] >= six_months_ago]

            # Line Graph
            fig_line = create_monthly_trend_line(recent_df)
            st.plotly_chart(fig_line, use_container_width=True)

        # --- Data Table ---
        with st.expander("View Raw Transaction Data"):
            st.dataframe(df.style.format({"Amount": "£{:.2f}"}))
