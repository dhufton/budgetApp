# src/ingestion/learning.py
import json
from ingestion.storage import get_user_learning_file


def load_learned_rules(user_id):
    """Returns a dict of { "Exact Description": "Category" } for the specific user."""
    learning_file = get_user_learning_file(user_id)

    if not learning_file.exists():
        return {}

    try:
        with open(learning_file, "r") as f:
            return json.load(f)
    except Exception:
        return {}


def save_learned_rule(description, category, user_id):
    """Updates the user's JSON file with a new rule."""
    rules = load_learned_rules(user_id)
    rules[description.strip()] = category

    learning_file = get_user_learning_file(user_id)
    with open(learning_file, "w") as f:
        json.dump(rules, f, indent=4)
