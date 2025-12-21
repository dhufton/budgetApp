# budgetApp/src/ingestion/storage.py
import io
import pandas as pd
from supabase_client import supabase
from storage.b2_client import (
    upload_statement,
    download_statement as b2_download_statement,
    read_statement_csv,
    delete_statement
)

BUCKET_NAME = "statements"  # Still used for Supabase metadata reference

def save_uploaded_file(uploaded_file, user_id: str):
    """
    Uploads file to B2 and returns storage_path.
    Replaces Supabase Storage upload.
    """
    storage_path = f"{user_id}/{uploaded_file.name}"
    file_bytes = uploaded_file.getvalue()

    print("DEBUG storage_path:", storage_path)
    print("DEBUG bytes_type:", type(file_bytes), "len:", len(file_bytes))

    # Upload to B2 (replaces supabase.storage.upload)
    upload_statement(storage_path, file_bytes)

    return storage_path

def get_all_statement_paths(user_id: str):
    """
    Queries Supabase metadata table instead of listing B2 bucket.
    Assumes you have a 'statements' table with 'storage_key' column.
    """
    try:
        # Query Supabase metadata table (RLS ensures user_id filter)
        res = (
            supabase.table("statements")
            .select("storage_key")
            .eq("user_id", user_id)
            .execute()
        )
        return [row["storage_key"] for row in res.data] if res.data else []
    except Exception as e:
        print(f"Could not list statements for user {user_id}: {e}")
        return []

def download_statement(storage_path: str) -> bytes:
    """
    Downloads raw bytes from B2 storage_path.
    Replaces supabase.storage.download.
    """
    try:
        return b2_download_statement(storage_path)
    except Exception as e:
        print(f"Failed to download {storage_path}: {e}")
        return None

def read_statement_csv(storage_path: str) -> pd.DataFrame:
    """
    Downloads CSV from B2 and returns as pandas DataFrame.
    Convenience function for re-parsing statements.
    """
    try:
        return read_statement_csv(storage_path)
    except Exception as e:
        print(f"Failed to read CSV from {storage_path}: {e}")
        return pd.DataFrame()

def delete_statement(storage_path: str):
    """
    Deletes file from B2 storage.
    Use when removing statement metadata from Supabase.
    """
    try:
        delete_statement(storage_path)
    except Exception as e:
        print(f"Failed to delete {storage_path}: {e}")
