# src/ingestion/learning.py
import os
from typing import Dict
from src.supabase_client import supabase_admin


def load_learned_rules(user_id: str) -> Dict[str, str]:
    """
    Load user-specific learned categorization rules from Supabase database.

    Args:
        user_id: The authenticated user's ID

    Returns:
        Dictionary mapping {description: category}
    """
    try:
        result = supabase_admin.table("learned_rules") \
            .select("description, category") \
            .eq("user_id", user_id) \
            .execute()

        if not result:
            return {}

        # Convert to dictionary: {description: category}
        rules = {rule["description"]: rule["category"] for rule in result.data}
        print(f"[LEARNING] Loaded {len(rules)} learned rules for user {user_id}")
        return rules

    except Exception as e:
        print(f"[LEARNING] Error loading rules for {user_id}: {repr(e)}")
        return {}


def save_learned_rule(description: str, category: str, user_id: str) -> bool:
    """
    Save a new categorization rule to Supabase database.

    Args:
        description: Transaction description
        category: Assigned category
        user_id: The authenticated user's ID

    Returns:
        True if successful, False otherwise
    """
    try:
        # Upsert (insert or update) the rule
        result = supabase_admin.table("learned_rules").upsert({
            "user_id": user_id,
            "description": description,
            "category": category
        }, on_conflict="user_id,description").execute()

        print(f"[LEARNING] Saved rule: '{description}' -> '{category}' for user {user_id}")
        return True

    except Exception as e:
        print(f"[LEARNING] Error saving rule: {repr(e)}")
        return False


def delete_learned_rule(description: str, user_id: str) -> bool:
    """
    Delete a learned rule from Supabase database.

    Args:
        description: Transaction description
        user_id: The authenticated user's ID

    Returns:
        True if successful, False otherwise
    """
    try:
        result = supabase_admin.table("learned_rules") \
            .delete() \
            .eq("user_id", user_id) \
            .eq("description", description) \
            .execute()

        print(f"[LEARNING] Deleted rule for '{description}' (user {user_id})")
        return True

    except Exception as e:
        print(f"[LEARNING] Error deleting rule: {repr(e)}")
        return False
