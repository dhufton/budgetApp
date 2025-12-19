# budgetApp/src/ingestion/learning.py
from supabase_client import supabase

def load_learned_rules(user_id: str) -> dict:
    """
    Loads all categorization rules for a specific user from the 'rules' table.
    Returns a dictionary of {description: category}.
    """
    try:
        res = supabase.table("rules").select("description, category").eq("user_id", user_id).execute()
        rules = {row["description"]: row["category"] for row in res.data}
        return rules
    except Exception as e:
        print(f"Could not load rules for user {user_id}: {e}")
        return {}

def save_learned_rule(description: str, category: str, user_id: str):
    """
    Saves or updates a specific categorization rule for a user.
    Uses 'upsert' to either insert a new rule or update an existing one.
    """
    try:
        description = description.strip()
        supabase.table("rules").upsert({
            "user_id": user_id,
            "description": description,
            "category": category,
        }, on_conflict="user_id,description").execute()
    except Exception as e:
        print(f"Could not save rule for user {user_id}: {e}")
