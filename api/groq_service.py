# api/groq_service.py
import json
import logging
from groq import Groq

logger = logging.getLogger(__name__)

CATEGORISATION_MODEL = "llama-3.1-8b-instant"
INSIGHTS_MODEL = "llama-3.1-8b-instant"
CHUNK_SIZE = 50  # Vendors per Groq call, well within token limits

VALID_CATEGORIES = {
    "Bills", "Entertainment", "Food", "Savings", "Shopping", "Transport", "Uncategorized"
}

CATEGORISE_SYSTEM_PROMPT = """You are a UK bank transaction categoriser.
Given a JSON array of vendor/transaction descriptions, return a JSON object mapping \
each description to exactly one category.

Available categories: Bills, Entertainment, Food, Savings, Shopping, Transport, Uncategorized

Rules:
- Return ONLY a valid JSON object — no explanation, no markdown code blocks
- Every key must exactly match an input description
- Use ONLY categories from the available list
- UK context: Tesco/Sainsburys/Asda/Lidl = Food, TfL/National Rail/Uber = Transport,
  Netflix/Spotify/Cinema = Entertainment, Council Tax/Utilities/Insurance = Bills,
  Amazon/ASOS/eBay = Shopping, ISA/Pension/Monzo Savings = Savings
- When genuinely unsure, use Uncategorized"""

INSIGHTS_SYSTEM_PROMPT = """You are a personal finance analyst. 
Given a user's monthly spending data, write a concise 2-3 sentence natural language summary.
Be specific with numbers. Mention the biggest category, any notable changes vs last month if provided.
Tone: friendly, helpful, not preachy. Output plain text only, no markdown."""

BUDGET_SUGGESTION_SYSTEM_PROMPT = """You are a personal finance advisor.
Given a user's average monthly spending per category over recent months, suggest realistic 
monthly budget targets. Return ONLY a JSON object like: {"Food": 350, "Transport": 120}.
Round to nearest £10. Be slightly conservative (5-10% below average to encourage saving).
Use ONLY the categories provided in the input."""

ANOMALY_SYSTEM_PROMPT = """You are a fraud and anomaly detection assistant.
Given a list of transactions with their amounts and category averages, identify any that look 
unusual (amount significantly higher than typical for that category, odd merchant names, etc).
Return a JSON array of objects: [{"id": "...", "description": "...", "reason": "..."}].
Return an empty array [] if nothing looks unusual. Keep reasons brief (under 10 words)."""


class GroqService:
    def __init__(self, api_key: str, supabase_client):
        self.client = Groq(api_key=api_key)
        self.supabase = supabase_client

    # -------------------------------------------------------------------------
    # Vendor category cache (Supabase table: vendor_categories)
    # -------------------------------------------------------------------------

    def _get_cached_categories(self, vendors: list[str]) -> dict[str, str]:
        if not vendors:
            return {}
        try:
            result = (
                self.supabase.table("vendor_categories")
                .select("vendor_name, category")
                .in_("vendor_name", vendors)
                .execute()
            )
            return {row["vendor_name"]: row["category"] for row in result.data}
        except Exception as e:
            logger.warning(f"Cache lookup failed: {e}")
            return {}

    def _save_to_cache(self, mappings: dict[str, str]) -> None:
        if not mappings:
            return
        try:
            rows = [{"vendor_name": k, "category": v} for k, v in mappings.items()]
            self.supabase.table("vendor_categories").upsert(
                rows, on_conflict="vendor_name"
            ).execute()
        except Exception as e:
            logger.warning(f"Cache save failed: {e}")

    # -------------------------------------------------------------------------
    # Core Groq call helpers
    # -------------------------------------------------------------------------

    def _call_groq_json(self, system: str, user: str, max_tokens: int = 600) -> dict | list:
        response = self.client.chat.completions.create(
            model=CATEGORISATION_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_format={"type": "json_object"},
            temperature=0,
            max_tokens=max_tokens,
        )
        return json.loads(response.choices[0].message.content)

    def _call_groq_text(self, system: str, user: str, max_tokens: int = 300) -> str:
        response = self.client.chat.completions.create(
            model=INSIGHTS_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.4,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content.strip()

    # -------------------------------------------------------------------------
    # 1. Transaction categorisation
    # -------------------------------------------------------------------------

    def categorise_vendors(self, vendors: list[str]) -> dict[str, str]:
        """
        Returns a vendor→category mapping for all input vendors.
        Checks the Supabase cache first — only calls Groq for unknown vendors.
        """
        if not vendors:
            return {}

        unique_vendors = list(set(vendors))
        cached = self._get_cached_categories(unique_vendors)
        unknown = [v for v in unique_vendors if v not in cached]

        new_mappings: dict[str, str] = {}
        if unknown:
            try:
                for i in range(0, len(unknown), CHUNK_SIZE):
                    chunk = unknown[i : i + CHUNK_SIZE]
                    raw = self._call_groq_json(
                        CATEGORISE_SYSTEM_PROMPT,
                        f"Categorise these transactions:\n{json.dumps(chunk)}",
                    )
                    for vendor, category in raw.items():
                        new_mappings[vendor] = (
                            category if category in VALID_CATEGORIES else "Uncategorized"
                        )
                self._save_to_cache(new_mappings)
            except Exception as e:
                logger.error(f"Groq categorisation failed: {e}")
                for vendor in unknown:
                    new_mappings[vendor] = "Uncategorized"

        return {**cached, **new_mappings}

    def apply_categories_to_transactions(
        self, transactions: list[dict], user_id: str
    ) -> tuple[list[dict], int]:
        """
        Categorises any Uncategorized transactions in-place, persists to Supabase,
        and returns (updated_transactions, number_changed).
        """
        uncategorised = [
            t for t in transactions
            if t.get("category", "Uncategorized") == "Uncategorized"
        ]
        if not uncategorised:
            return transactions, 0

        mappings = self.categorise_vendors([t["description"] for t in uncategorised])

        changed = 0
        for transaction in transactions:
            if transaction.get("category", "Uncategorized") == "Uncategorized":
                new_cat = mappings.get(transaction["description"], "Uncategorized")
                if new_cat != "Uncategorized":
                    transaction["category"] = new_cat
                    changed += 1
                    try:
                        self.supabase.table("transactions").update(
                            {"category": new_cat}
                        ).eq("id", transaction["id"]).eq("user_id", user_id).execute()
                    except Exception as e:
                        logger.warning(f"Failed to persist category for {transaction['id']}: {e}")

        return transactions, changed

    # -------------------------------------------------------------------------
    # 2. Monthly spending insights narrative
    # -------------------------------------------------------------------------

    def get_spending_insights(
        self, current_month_totals: dict[str, float], prev_month_totals: dict[str, float] | None = None
    ) -> str:
        """
        Returns a 2-3 sentence natural language spending summary for the current month.
        Optionally compares against the previous month.
        """
        user_content = f"Current month spending by category (£): {json.dumps(current_month_totals)}"
        if prev_month_totals:
            user_content += f"\nPrevious month spending (£): {json.dumps(prev_month_totals)}"

        try:
            return self._call_groq_text(INSIGHTS_SYSTEM_PROMPT, user_content)
        except Exception as e:
            logger.error(f"Insights generation failed: {e}")
            return ""

    # -------------------------------------------------------------------------
    # 3. Budget target suggestions
    # -------------------------------------------------------------------------

    def suggest_budget_targets(self, average_monthly_spend: dict[str, float]) -> dict[str, int]:
        """
        Given average monthly spend per category, returns suggested budget targets rounded to £10.
        """
        try:
            raw = self._call_groq_json(
                BUDGET_SUGGESTION_SYSTEM_PROMPT,
                f"Average monthly spending (£): {json.dumps(average_monthly_spend)}",
                max_tokens=200,
            )
            return {k: int(v) for k, v in raw.items() if isinstance(v, (int, float))}
        except Exception as e:
            logger.error(f"Budget suggestion failed: {e}")
            return {}

    # -------------------------------------------------------------------------
    # 4. Anomaly detection
    # -------------------------------------------------------------------------

    def detect_anomalies(
        self, recent_transactions: list[dict], category_averages: dict[str, float]
    ) -> list[dict]:
        """
        Flags transactions that look unusual compared to category spend averages.
        Returns a list of {id, description, reason} dicts.
        """
        if not recent_transactions:
            return []
        try:
            user_content = (
                f"Category average transaction amounts (£): {json.dumps(category_averages)}\n"
                f"Recent transactions: {json.dumps(recent_transactions[:100])}"
            )
            raw = self._call_groq_json(ANOMALY_SYSTEM_PROMPT, user_content, max_tokens=400)
            return raw if isinstance(raw, list) else raw.get("anomalies", [])
        except Exception as e:
            logger.error(f"Anomaly detection failed: {e}")
            return []
