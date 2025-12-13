# budgetApp/src/ingestion/storage.py
import os
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data" / "statements"


def save_uploaded_file(uploaded_file):
    """
    Saves a Streamlit uploaded file to the local data directory.
    Returns the path to the saved file.
    """
    # Create directory if it doesn't exist
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    file_path = DATA_DIR / uploaded_file.name

    with open(file_path, "wb") as f:
        f.write(uploaded_file.getbuffer())

    return file_path


def get_all_statement_paths():
    """Returns a list of paths to all stored statements (PDF and CSV)."""
    if not DATA_DIR.exists():
        return []

    # Grab both types
    pdfs = list(DATA_DIR.glob("*.pdf"))
    csvs = list(DATA_DIR.glob("*.csv"))
    return pdfs + csvs