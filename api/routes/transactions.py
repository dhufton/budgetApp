# api/routes/transactions.py
from fastapi import APIRouter, Depends, Query
from io import BytesIO
import pandas as pd
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from src.ingestion.storage import get_all_statement_paths, download_statement
from src.ingestion.parser import ChaseStatementParser, AmexCSVParser
from src.ingestion.learning import save_learned_rule
from api.auth import get_current_user

router = APIRouter()

_cache = {}


@router.get("/transactions")
async def get_transactions(
        user_id: str = Depends(get_current_user),
        limit: int = Query(1000, le=5000)
):
    if user_id not in _cache:
        df = await load_statements(user_id)
        _cache[user_id] = df
    else:
        df = _cache[user_id]

    if df.empty:
        return {"total": 0, "transactions": [], "latest_date": None}

    # Get uncategorized count
    uncategorized_count = len(df[df["Category"] == "Uncategorized"])

    transactions = df.tail(limit).to_dict("records")
    return {
        "total": len(df),
        "transactions": transactions,
        "latest_date": df["Date"].max().strftime("%Y-%m-%d"),
        "uncategorized_count": uncategorized_count
    }


@router.get("/transactions/uncategorized")
async def get_uncategorized(user_id: str = Depends(get_current_user)):
    """Get uncategorized transactions for review."""
    if user_id not in _cache:
        df = await load_statements(user_id)
        _cache[user_id] = df
    else:
        df = _cache[user_id]

    uncategorized = df[df["Category"] == "Uncategorized"].copy()
    return uncategorized.to_dict("records")


@router.post("/transactions/categorize")
async def categorize_transaction(
        description: str,
        category: str,
        user_id: str = Depends(get_current_user)
):
    """Save a categorization rule."""
    save_learned_rule(description, category, user_id)

    # Clear cache to force reload
    if user_id in _cache:
        del _cache[user_id]

    return {"success": True}


@router.post("/transactions/refresh")
async def refresh_cache(user_id: str = Depends(get_current_user)):
    """Clear cache to force reload."""
    if user_id in _cache:
        del _cache[user_id]
    return {"success": True}


async def load_statements(user_id: str) -> pd.DataFrame:
    """Load and parse all statements (replaces st.cache_data)."""
    paths = get_all_statement_paths(user_id)
    if not paths:
        return pd.DataFrame()

    all_dfs = []
    chase_parser = ChaseStatementParser(user_id)
    amex_parser = AmexCSVParser(user_id)

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
