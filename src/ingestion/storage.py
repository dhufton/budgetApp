# src/ingestion/storage.py
import os
from typing import List, Optional

from .b2_client import (
    upload_file_to_b2,
    list_files_in_b2,
    download_file_from_b2,
)


def save_uploaded_file(file, user_id: str) -> str:
    """Save file to B2 storage with correct filename"""

    # Get filename
    if hasattr(file, 'filename'):
        filename = file.filename
    elif hasattr(file, 'name'):
        filename = file.name
    else:
        filename = "statement.pdf"

    print(f"[STORAGE] Saving as: {filename}")

    storage_path = f"{user_id}/{filename}"

    # Read content
    if hasattr(file, 'read'):
        content = file.read()
        if hasattr(file, 'seek'):
            file.seek(0)
    else:
        content = file

    # Determine content type
    if filename.lower().endswith('.pdf'):
        content_type = 'application/pdf'
    elif filename.lower().endswith('.csv'):
        content_type = 'text/csv'
    else:
        content_type = 'application/octet-stream'

    print(f"[STORAGE] Content type: {content_type}, size: {len(content)} bytes")

    # Upload to B2
    upload_file_to_b2(storage_path, content, content_type)

    print(f"[STORAGE] Uploaded to: {storage_path}")

    return storage_path


def get_all_statement_paths(user_id: str) -> List[str]:
    """Get all statement file paths for a user"""
    prefix = f"{user_id}/"
    files = list_files_in_b2(prefix)
    return [f["fileName"] for f in files]


def download_statement(storage_path: str) -> Optional[bytes]:
    """Download statement from B2"""
    try:
        return download_file_from_b2(storage_path)
    except Exception as e:
        print(f"Failed to download {storage_path}: {e}")
        return None
