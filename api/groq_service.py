import json
import logging
from groq import Groq

logger = logging.getLogger(__name__)

CATEGORISATION_MODEL = "llama-3.1-8b-instant"
INSIGHTS_MODEL       = "llama-3.1-8b-instant"
CHUNK_SIZE           = 50

VALID_CATEGORIES = {
    "Bills", "Entertainment", "Food", "Savings", "Shopping", "Transport", "Uncategorized"
}

CATEGORISE_SYSTEM_PROMPT = """You are a UK bank transaction categoriser.
Given a JSON array of vendor/transaction descriptions, return a JSON object mapping each description to exactly one category.
Available categories: Bills, Entertainment, Food, Savings, Shopping, Transport, Uncategorized
Rules:
- Return ONLY a valid JSON object (no explanation, no markdown code blocks)
- Every key must exactly match an input description
- Use ONLY categories from the available list
- UK context: Tesco/Sainsbury's/Asda/Lidl=Food, TfL/National Rail/Uber=Transport,
  Netflix/Spotify/Cinema=Entertainment, Council Tax/Utilities/Insurance=Bills,
  Amazon/ASOS/eBay=Shopping, ISA/Pension/Monzo Savings=Savings
- When genuinely unsure, use Uncategorized"""

INSIGHTS_SYSTEM_PROMPT = """You are a personal finance analyst.
Given a user's monthly spending data, write a concise 2-3 sentence natural language summary.
Be specific with numbers. Mention the biggest category, any notable changes vs last month if provided.
Tone: friendly, helpful, not preachy. Output plain text only, no markdown."""

BUDGET_SUGGESTION_SYSTEM_PROMPT = """You are a personal finance advisor.
Given a user's average monthly spending per category over recent months, suggest realistic monthly budget targets.
Return ONLY a JSON object like: {"Food": 350, "Transport": 120}.
Round to nearest 10. Be slightly conservative (5-10% below average) to encourage saving.
Use ONLY the categories provided in the input."""

ANOMALY_SYSTEM_PROMPT = """You are a fraud and anomaly detection assistant.
Given a list of transactions with their amounts and category averages, identify any that look unusual
(amount significantly higher than typical for that category, odd merchant names, etc.).
Return a JSON array of objects: [{"id": "...", "description": "...", "reason": "..."}].
Return an empty array if nothing looks unusual. Keep reasons brief (under 10 words)."""


class GroqService:
    def __init__(self, api_key: str, supabase_client):
        self.client  = Groq(api_key=api_key)
        self.supabase = supabase_client

    # â”€â”€ Cache helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    def get_cached_categories(self, vendors: list[str]) -> dict[str, str]:
        """Single Supabase lookup for a list of vendor names."""
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

    def _save_to_vendor_cache(self, mappings: dict[str, str]) -> None:
        if not mappings:
            return
        try:
            rows = [{"vendor_name": k, "category": v} for k, v in mappings.items()]
            self.supabase.table("vendor_categories").upsert(rows, on_conflict="vendor_name").execute()
        except Exception as e:
            logger.warning(f"Vendor cache save failed: {e}")

    def _save_to_learned_rules(self, mappings: dict[str, str], user_id: str) -> None:
        """Save Groq results as per-user learned rules for future offline categorisation."""
        if not mappings or not user_id:
            return
        try:
            rows = [{"user_id": user_id, "description": k, "category": v} for k, v in mappings.items()]
            self.supabase.table("learned_rules").upsert(rows, on_conflict="user_id,description").execute()
            logger.info(f"[LEARNING] Saved {len(rows)} rules for user {user_id}")
        except Exception as e:
            logger.warning(f"Learned rules save failed: {e}")

    # â”€â”€ Groq calls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    def _call_groq_json(self, system: str, user: str, max_tokens: int = 600) -> dict | list:
        response = self.client.chat.completions.create(
            model=CATEGORISATION_MODEL,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={"type": "json_object"},
            temperature=0,
            max_tokens=max_tokens,
        )
        return json.loads(response.choices[0].message.content)

    def _call_groq_text(self, system: str, user: str, max_tokens: int = 300) -> str:
        response = self.client.chat.completions.create(
            model=INSIGHTS_MODEL,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.4,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content.strip()

    # â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    def categorise_vendors(self, vendors: list[str]) -> dict[str, str]:
        """Returns vendorâ†’category mapping. Checks vendor cache first; calls Groq only for unknowns."""
        if not vendors:
            return {}
        unique_vendors = list(set(vendors))
        cached  = self.get_cached_categories(unique_vendors)
        unknown = [v for v in unique_vendors if v not in cached]
        new_mappings: dict[str, str] = {}
        if unknown:
            try:
                for i in range(0, len(unknown), CHUNK_SIZE):
                    chunk = unknown[i:i + CHUNK_SIZE]
                    raw   = self._call_groq_json(CATEGORISE_SYSTEM_PROMPT, f"Categorise these transactions: {json.dumps(chunk)}")
                    for vendor, category in raw.items():
                        new_mappings[vendor] = category if category in VALID_CATEGORIES else "Uncategorized"
                self._save_to_vendor_cache(new_mappings)
            except Exception as e:
                logger.error(f"Groq categorisation failed: {e!r}")
                for vendor in unknown:
                    new_mappings[vendor] = "Uncategorized"
        return {**cached, **new_mappings}

    def apply_categories_to_transactions(
        self, transactions: list[dict], user_id: str
    ) -> tuple[list[dict], int]:
        """Categorise Uncategorized transactions, persist to DB, and save as learned rules."""
        uncategorised = [t for t in transactions if t.get("category", "Uncategorized") == "Uncategorized"]
        if not uncategorised:
            return transactions, 0

        mappings = self.categorise_vendors([t["description"] for t in uncategorised])

        changed = 0
        new_rules: dict[str, str] = {}

        for transaction in transactions:
            if transaction.get("category", "Uncategorized") == "Uncategorized":
                new_cat = mappings.get(transaction["description"], "Uncategorized")
                if new_cat != "Uncategorized":
                    transaction["category"] = new_cat
                    changed += 1
                    new_rules[transaction["description"]] = new_cat
                    try:
                        self.supabase.table("transactions").update(
                            {"category": new_cat}
                        ).eq("id", transaction["id"]).eq("user_id", user_id).execute()
                    except Exception as e:
                        logger.warning(f"Failed to persist category for {transaction['id']}: {e}")

        # Save new vendorâ†’category mappings as per-user learned rules
        if new_rules:
            self._save_to_learned_rules(new_rules, user_id)

        return transactions, changed

    def get_spending_insights(
        self,
        current_month_totals: dict[str, float],
        prev_month_totals: dict[str, float] | None = None,
    ) -> str:
        user_content = f"Current month spending by category: {json.dumps(current_month_totals)}"
        if prev_month_totals:
            user_content += f"\nPrevious month spending: {json.dumps(prev_month_totals)}"
        try:
            return self._call_groq_text(INSIGHTS_SYSTEM_PROMPT, user_content)
        except Exception as e:
            logger.error(f"Insights generation failed: {e!r}")
            return ""

    def suggest_budget_targets(self, average_monthly_spend: dict[str, float]) -> dict[str, int]:
        try:
            raw = self._call_groq_json(
                BUDGET_SUGGESTION_SYSTEM_PROMPT,
                f"Average monthly spending: {json.dumps(average_monthly_spend)}",
                max_tokens=200,
            )
            return {k: int(v) for k, v in raw.items() if isinstance(v, (int, float))}
        except Exception as e:
            logger.error(f"Budget suggestion failed: {e!r}")
            return {}

    def detect_anomalies(
        self, recent_transactions: list[dict], category_averages: dict[str, float]
    ) -> list[dict]:
        if not recent_transactions:
            return []
        try:
            user_content = (
                f"Category average transaction amounts: {json.dumps(category_averages)}\n"
                f"Recent transactions: {json.dumps(recent_transactions[:100])}"
            )
            raw = self._call_groq_json(ANOMALY_SYSTEM_PROMPT, user_content, max_tokens=400)
            return raw if isinstance(raw, list) else raw.get("anomalies", [])
        except Exception as e:
            logger.error(f"Anomaly detection failed: {e!r}")
            return []