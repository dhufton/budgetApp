# budgetApp/src/ingestion/storage.py
from supabase_client import supabase

BUCKET_NAME = "statements"

def save_uploaded_file(uploaded_file, user_id: str):
    storage_path = f"{user_id}/{uploaded_file.name}"
    file_bytes = uploaded_file.getvalue()

    print("DEBUG storage_path:", storage_path)
    print("DEBUG bytes_type:", type(file_bytes), "len:", len(file_bytes))

    supabase.storage.from_(BUCKET_NAME).upload(
        path=storage_path,
        file=file_bytes,
    )

    supabase.table("statements").upsert(
        {"user_id": user_id, "filename": uploaded_file.name},
        on_conflict="user_id,filename"
    ).execute()

    return storage_path

def get_all_statement_paths(user_id: str):
    try:
        res = supabase.storage.from_(BUCKET_NAME).list(path=user_id)
        return [f"{user_id}/{f['name']}" for f in res]
    except Exception as e:
        print(f"Could not list files for user {user_id}: {e}")
        return []

def download_statement(storage_path: str) -> bytes:
    try:
        return supabase.storage.from_(BUCKET_NAME).download(storage_path)
    except Exception as e:
        print(f"Failed to download {storage_path}: {e}")
        return None
