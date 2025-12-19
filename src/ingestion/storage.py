# budgetApp/src/ingestion/storage.py
from supabase_client import supabase
from io import BytesIO

BUCKET_NAME = "statements"

def save_uploaded_file(uploaded_file, user_id: str):
    storage_path = f"{user_id}/{uploaded_file.name}"
    file_bytes = uploaded_file.getvalue()

    # This call now has a valid 'Authorization' header
    supabase.storage.from_("statements").upload(
        path=storage_path,
        file=file_bytes,
        file_options={"upsert": True}
    )

def get_all_statement_paths(user_id: str):
    """
    Returns a list of full object paths in Supabase Storage for this user.
    e.g., ["user_abc/statement1.pdf", "user_abc/statement2.csv"]
    """
    try:
        # List all files in the user's "folder"
        res = supabase.storage.from_(BUCKET_NAME).list(path=user_id)
        # res is a list of dicts with a 'name' key, e.g., [{'name': 'statement1.pdf'}, ...]
        return [f"{user_id}/{f['name']}" for f in res]
    except Exception as e:
        print(f"Could not list files for user {user_id}: {e}")
        return []


def download_statement(storage_path: str) -> bytes:
    """Download a file's content from storage as bytes."""
    try:
        res = supabase.storage.from_(BUCKET_NAME).download(storage_path)
        return res
    except Exception as e:
        print(f"Failed to download {storage_path}: {e}")
        return None
