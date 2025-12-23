# api/routes/transactions.py
from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional
import sys
import os
from io import BytesIO
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from src.ingestion.storage import get_all_statement_paths, download_statement
from src.ingestion.parser import ChaseStatementParser, AmexCSVParser
from api.auth import get_current_user

router = APIRouter()

# Simple in-memory cache
_cache = {}


@router.get("/transactions")
async def get_transactions(
        user_id: str = Depends(get_current_user),
        limit: int = Query(1000, le=5000),
        refresh: bool = Query(False)
):
    cache_key = f"{user_id}_{refresh}"

    if cache_key not in _cache:
        df = await load_statements(user_id)
        _cache[cache_key] = df.to_dict('records')

    transactions = _cache[cache_key]

    if not transactions:
        return {
            "total": 0,
            "transactions": [],
            "latest_date": None,
            "uncategorized_count": 0
        }

    # Filter and limit
    recent_transactions = transactions[:limit]
    uncategorized_count = sum(1 for t in transactions if t.get("Category") == "Uncategorized")

    return {
        "total": len(transactions),
        "transactions": recent_transactions,
        "latest_date": transactions[0]["Date"][:10] if transactions else None,
        "uncategorized_count": uncategorized_count
    }


@router.post("/transactions/refresh")
async def refresh_cache(user_id: str = Depends(get_current_user)):
    _cache.clear()
    return {"success": True, "message": "Cache cleared"}


async def load_statements(user_id: str) -> pd.DataFrame:
    """Load and parse all statements for a user"""
    paths = get_all_statement_paths(user_id)
    if not paths:
        return pd.DataFrame()

    all_dfs = []
    chase_parser = ChaseStatementParser(user_id)
    amex_parser = AmexCSVParser(user_id)

    for storage_path in paths:
        content = download_statement(storage_path)
        if not content:
            print(f"Failed to download {storage_path}")
            continue

        filename = storage_path.split("/")[-1]
        file_stream = BytesIO(content)

        try:
            if filename.lower().endswith(".pdf"):
                df = chase_parser.parse(file_stream)
            elif filename.lower().endswith(".csv"):
                df = amex_parser.parse(file_stream)
            else:
                print(f"Skipping unsupported file: {filename}")
                continue

            if not df.empty:
                all_dfs.append(df)
                print(f"Parsed {len(df)} transactions from {filename}")
        except Exception as e:
            print(f"Failed to parse {filename}: {e}")

    if not all_dfs:
        return pd.DataFrame()

    combined_df = pd.concat(all_dfs, ignore_index=True)
    combined_df = combined_df.drop_duplicates(subset=["Date", "Description", "Amount"])
    return combined_df.sort_values("Date", ascending=False)
