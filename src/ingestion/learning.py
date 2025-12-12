# src/ingestion/learning.py
import json
from pathlib import Path

# Path to our "brain"
LEARNING_FILE = Path(__file__).parent.parent / "data" / "learned_categories.json"


def load_learned_rules():
    """Returns a dict of { "Exact Description": "Category" }"""
    if not LEARNING_FILE.exists():
        return {}

    try:
        with open(LEARNING_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {}


def save_learned_rule(description, category):
    rules = load_learned_rules()
    # STRIP WHITESPACE
    rules[description.strip()] = category

    with open(LEARNING_FILE, "w") as f:
        json.dump(rules, f, indent=4)
