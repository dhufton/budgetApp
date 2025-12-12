# budgetApp/src/analysis/charts.py
import plotly.express as px
import plotly.graph_objects as go
import pandas as pd
from config import BUDGET_LIMITS


def create_spending_pie_chart(df):
    """
    Generates a pie chart of total spending by category.
    """
    # Filter for expenses only (negative amounts)
    expenses = df[df['Amount'] < 0].copy()
    expenses['AbsAmount'] = expenses['Amount'].abs()

    grouped = expenses.groupby('Category')['AbsAmount'].sum().reset_index()

    fig = px.pie(
        grouped,
        values='AbsAmount',
        names='Category',
        title='Total Spending Distribution',
        hole=0.4,
        color_discrete_sequence=px.colors.qualitative.Prism
    )
    fig.update_traces(textposition='inside', textinfo='percent+label')
    return fig


def create_monthly_trend_line(df):
    """
    Generates a line graph of monthly spending vs budget targets.
    """
    # Prepare Data: Group by Month and Category
    expenses = df[df['Amount'] < 0].copy()
    expenses['AbsAmount'] = expenses['Amount'].abs()
    expenses['Month'] = expenses['Date'].dt.to_period('M').astype(str)

    # 1. Actual Spending Line
    monthly_cat = expenses.groupby(['Month', 'Category'])['AbsAmount'].sum().reset_index()

    fig = px.line(
        monthly_cat,
        x='Month',
        y='AbsAmount',
        color='Category',
        markers=True,
        title='Monthly Spending Evolution (Past 6 Months)',
        labels={'AbsAmount': 'Amount (£)', 'Month': 'Month'}
    )

    # 2. Add Budget Target Lines (Dashed)
    # Get unique months to plot horizontal lines across
    months = sorted(monthly_cat['Month'].unique())
    if not months: return fig

    for category, limit in BUDGET_LIMITS.items():
        # Only plot budget line if that category exists in the data to avoid clutter
        if category in monthly_cat['Category'].values:
            fig.add_trace(go.Scatter(
                x=months,
                y=[limit] * len(months),
                mode='lines',
                name=f"{category} Target",
                line=dict(dash='dot', width=1),
                opacity=0.5
            ))

    return fig
