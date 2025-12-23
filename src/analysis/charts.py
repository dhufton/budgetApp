# budgetApp/src/analysis/charts.py
import plotly.express as px
import plotly.graph_objects as go
import pandas as pd
from src.config import BUDGET_LIMITS

def calculate_plot_data(df):
    """
    Prepares data for charts.
    - Filters out 'Ignore'.
    - Maps 'Uncategorized' to 'Shopping' for visual cleanliness.
    - Inverts amounts (Cost = Positive).
    """
    df = df.copy()

    # 1. FILTER: Exclude 'Ignore'
    df = df[df['Category'] != 'Ignore']

    # 2. LOGIC: Treat Uncategorized as Shopping for charts
    # We create a new column so we don't overwrite the actual 'Category'
    # (which needs to stay 'Uncategorized' for the review queue)
    df['PlotCategory'] = df['Category'].replace({'Uncategorized': 'Shopping'})

    # 3. Invert amounts
    df['PlotAmount'] = df['Amount'] * -1

    return df

def create_spending_pie_chart(df):
    data = calculate_plot_data(df)

    # Group by PlotCategory instead of Category
    grouped = data.groupby('PlotCategory')['PlotAmount'].sum().reset_index()
    grouped = grouped[grouped['PlotAmount'] > 0]

    fig = px.pie(
        grouped,
        values='PlotAmount',
        names='PlotCategory',  # <--- Use the Mapped Category
        title='Total Outgoings (Uncategorized included in Shopping)',
        hole=0.4,
        color_discrete_sequence=px.colors.qualitative.Prism
    )
    fig.update_traces(textposition='inside', textinfo='percent+label')
    return fig


def create_monthly_trend_line(df):
    data = calculate_plot_data(df)
    data['Month'] = data['Date'].dt.to_period('M').astype(str)

    # Group by PlotCategory
    monthly_cat = data.groupby(['Month', 'PlotCategory'])['PlotAmount'].sum().reset_index()

    fig = px.line(
        monthly_cat,
        x='Month',
        y='PlotAmount',
        color='PlotCategory',  # <--- Use the Mapped Category
        markers=True,
        title='Monthly Evolution',
        labels={'PlotAmount': 'Net Amount (£)', 'Month': 'Month', 'PlotCategory': 'Category'}
    )

    # 2. Add Budget Target Lines (Dashed)
    # Get unique months to plot horizontal lines across
    months = sorted(monthly_cat['Month'].unique())
    if not months: return fig

    for category, limit in BUDGET_LIMITS.items():
        # FIX IS HERE: Check 'PlotCategory' instead of 'Category'
        if category in monthly_cat['PlotCategory'].values:
            fig.add_trace(go.Scatter(
                x=months,
                y=[limit] * len(months),
                mode='lines',
                name=f"{category} Target",
                line=dict(dash='dot', width=1),
                opacity=0.5
            ))

    return fig


def create_balance_trend_line(df):
    """
    Plots the final 'Balance' value of the last transaction of each month.
    """
    # 1. Sort by Date
    df_sorted = df.sort_values(by=['Date']).copy()

    # 2. Create 'Month' column
    df_sorted['Month'] = df_sorted['Date'].dt.to_period('M').astype(str)

    # 3. Get the LAST row for every month (which holds that month's closing balance)
    # We group by Month and take the .tail(1)
    monthly_closing = df_sorted.groupby('Month').tail(1)

    fig = px.line(
        monthly_closing,
        x='Month',
        y='Balance',
        markers=True,
        title='Monthly Closing Balance',
        labels={'Balance': 'Account Balance (£)'}
    )
    return fig