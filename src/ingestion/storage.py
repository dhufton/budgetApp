# budgetApp/src/ingestion/storage.py
import os
from pathlib import Path
import json
import bcrypt

# Base path: budgetApp/data/
BASE_DATA_DIR = Path(__file__).parent.parent.parent / "data"


def get_user_dir(user_id):
    """
    Returns Path('data/users/{user_id}')
    Creates the directory if it doesn't exist.
    """
    path = BASE_DATA_DIR / "users" / user_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_user_statements_path(user_id):
    """
    Returns Path('data/users/{user_id}/statements')
    Creates the directory if it doesn't exist.
    """
    path = get_user_dir(user_id) / "statements"
    path.mkdir(exist_ok=True)
    return path


def get_user_learning_file(user_id):
    """
    Returns Path('data/users/{user_id}/learned_categories.json')
    Does NOT create the file, just returns the path.
    """
    return get_user_dir(user_id) / "learned_categories.json"


def save_uploaded_file(uploaded_file, user_id):
    """
    Saves a Streamlit uploaded file to the user's specific statements directory.
    Returns the path to the saved file.

    Args:
        uploaded_file: The file object from st.file_uploader
        user_id (str): The unique ID of the user (from cookie)
    """
    # Get the user's statement folder
    target_dir = get_user_statements_path(user_id)

    file_path = target_dir / uploaded_file.name

    with open(file_path, "wb") as f:
        f.write(uploaded_file.getbuffer())

    return file_path


def get_all_statement_paths(user_id):
    """
    Returns a list of paths to all stored statements (PDF and CSV) for a specific user.

    Args:
        user_id (str): The unique ID of the user
    """
    target_dir = get_user_statements_path(user_id)

    if not target_dir.exists():
        return []

    # Grab both types
    pdfs = list(target_dir.glob("*.pdf"))
    csvs = list(target_dir.glob("*.csv"))

    return pdfs + csvs


def save_user_credentials(user_id, password):
    """Hashes and saves password to data/users/{user_id}/credentials.json"""
    user_dir = get_user_dir(user_id)

    # Hash the password (bcrypt handles salt automatically)
    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

    creds = {
        "username": user_id,
        "hash": hashed.decode('utf-8')
    }

    with open(user_dir / "credentials.json", "w") as f:
        json.dump(creds, f)


def verify_user_credentials(user_id, password):
    """Returns True if password matches stored hash."""
    creds_file = get_user_dir(user_id) / "credentials.json"

    if not creds_file.exists():
        return False

    try:
        with open(creds_file, "r") as f:
            data = json.load(f)
            stored_hash = data["hash"].encode('utf-8')

        return bcrypt.checkpw(password.encode('utf-8'), stored_hash)
    except Exception:
        return False