import json
import logging
import os
from groq import Groq
from src.config import BUILTIN_CATEGORIES

logger = logging.getLogger(__name__)

CATEGORISATION_MODEL = os.environ.get('CATEGORISATION_MODEL', 'llama-3.1-8b-instant')
INSIGHTS_MODEL       = 'llama-3.1-8b-instant'
CHUNK_SIZE           = 50

VALID_CATEGORIES = set(BUILTIN_CATEGORIES + ['Uncategorized'])

CATEGORISE_SYSTEM_PROMPT = """You are a UK bank transaction categoriser.
Given a JSON array of vendor/transaction descriptions, return a JSON object mapping each description to exactly one category.
Available categories: Bills, Entertainment, Food, Savings, Shopping, Transport, Uncategorized

Rules:
- Return ONLY a valid JSON object (no explanation, no markdown)
- Every key must exactly match an input description
- Use ONLY categories from the available list
- UK context examples:
  Tesco/Sainsbury's/Asda/Lidl/Ocado = Food
  TfL/National Rail/Uber (rides) = Transport
  Netflix/Spotify/Cinema/Steam/Apple/Microsoft = Entertainment
  Council Tax/Utilities/Insurance/British Gas/Thames Water/O2/Hyperoptic/Rent/AmericanExpress/Amex = Bills
  Amazon/ASOS/eBay/John Lewis/Selfridges = Shopping
  ISA/Pension/Savings/Round up/Chase Saver = Savings
  Person-to-person transfers (e.g. "To Hannah - Chase", "From Dylan - Chase") = Shopping
  Instalment Plan payments = Shopping
  Payment Received = Shopping
- When genuinely unsure, use Uncategorized"""

INSIGHTS_SYSTEM_PROMPT = """You are a personal finance analyst.
Given a user's monthly spending data, write a concise 2-3 sentence natural language summary.
Be specific with numbers. Mention the biggest category and any notable changes vs last month.
Tone: friendly, helpful, not preachy. Output plain text only, no markdown."""

BUDGET_SUGGESTION_SYSTEM_PROMPT = """You are a personal finance advisor.
Given a user's average monthly spending per category, suggest realistic monthly budget targets.
Return ONLY a JSON object like: {"Food": 350, "Transport": 120}.
Round to nearest 10. Be 5-10% below average to encourage saving.
Use ONLY the categories provided in the input."""

ANOMALY_SYSTEM_PROMPT = """You are a fraud and anomaly detection assistant.
Given transactions with amounts and category averages, identify unusual ones.
Return a JSON array: [{"id": "...", "description": "...", "reason": "..."}].
Return an empty array if nothing looks unusual. Keep reasons under 10 words."""

SUGGESTION_SYSTEM_PROMPT = """You are a UK bank transaction categoriser.
Classify each transaction into one category and provide confidence and a short reason.

Return ONLY a valid JSON object in this shape:
{
  "suggestions": [
    {
      "transaction_id": "input id",
      "suggested_category": "one of allowed categories",
      "confidence": 0-100,
      "reason": "short reason"
    }
  ]
}

Rules:
- transaction_id must match an input id
- suggested_category must be from allowed categories exactly
- confidence must be numeric 0-100
- reason must be under 80 characters
- if uncertain, use low confidence and/or Uncategorized
- prefer specific categories when merchant is recognisable (avoid defaulting to Uncategorized)

Examples:
- Pizza Hut / Domino's / McDonald's / KFC / Pret / Nando's -> Food
- Tesco / Sainsbury's / Lidl / Aldi / Asda / Waitrose -> Food
- Amazon / eBay / ASOS / Argos / Apple Store -> Shopping
- TfL / Uber trip / Trainline / National Rail / Shell / BP -> Transport
- Netflix / Spotify / Steam / Cinema -> Entertainment
- Council Tax / British Gas / Thames Water / O2 / Rent -> Bills
- Chase Saver / ISA / Pension / savings transfer -> Savings
- Credit card payment / internal transfer / balance payment -> Transfer"""


class GroqService:
    def __init__(self, api_key: str, supabase_client):
        self.client   = Groq(api_key=api_key)
        self.supabase = supabase_client

    # --- Cache helpers -------------------------------------------------------

    def get_cached_categories(self, vendors: list) -> dict:
        if not vendors:
            return {}
        try:
            result = (
                self.supabase.table('vendor_categories')
                .select('vendor_name, category')
                .in_('vendor_name', vendors)
                .execute()
            )
            return {row['vendor_name']: row['category'] for row in result.data}
        except Exception as e:
            logger.warning('Cache lookup failed: %r', e)
            return {}

    def _save_to_vendor_cache(self, mappings: dict) -> None:
        if not mappings:
            return
        try:
            rows = [{'vendor_name': k, 'category': v} for k, v in mappings.items()]
            self.supabase.table('vendor_categories').upsert(rows, on_conflict='vendor_name').execute()
        except Exception as e:
            logger.warning('Vendor cache save failed: %r', e)

    def _save_to_learned_rules(self, mappings: dict, user_id: str) -> None:
        if not mappings or not user_id:
            return
        try:
            rows = [{'user_id': user_id, 'description': k, 'category': v} for k, v in mappings.items()]
            self.supabase.table('learned_rules').upsert(rows, on_conflict='user_id,description').execute()
            logger.info('[LEARNING] Saved %d rules for user %s', len(rows), user_id)
        except Exception as e:
            logger.warning('Learned rules save failed: %r', e)

    # --- Groq calls ----------------------------------------------------------

    def _call_groq_json(self, system: str, user: str, max_tokens: int = 600):
        response = self.client.chat.completions.create(
            model=CATEGORISATION_MODEL,
            messages=[
                {'role': 'system', 'content': system},
                {'role': 'user',   'content': user},
            ],
            response_format={'type': 'json_object'},
            temperature=0,
            max_tokens=max_tokens,
        )
        return json.loads(response.choices[0].message.content)

    def _call_groq_text(self, system: str, user: str, max_tokens: int = 300) -> str:
        response = self.client.chat.completions.create(
            model=INSIGHTS_MODEL,
            messages=[
                {'role': 'system', 'content': system},
                {'role': 'user',   'content': user},
            ],
            temperature=0.4,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content.strip()

    # --- Public API ----------------------------------------------------------

    def categorise_vendors(self, vendors: list, force_groq: bool = False) -> dict:
        """
        Returns a vendor->category mapping.
        force_groq=True bypasses the cache — used by the manual Fix with AI button
        so vendors previously cached as Uncategorized are re-tried.
        """
        if not vendors:
            return {}
        unique_vendors = list(set(vendors))

        if force_groq:
            # Skip cache entirely — re-ask Groq for everything
            cached  = {}
            unknown = unique_vendors
        else:
            all_cached = self.get_cached_categories(unique_vendors)
            # Only use cache hits that resolved to a real category
            # Vendors cached as Uncategorized get re-tried by Groq
            cached  = {k: v for k, v in all_cached.items() if v != 'Uncategorized'}
            unknown = [v for v in unique_vendors if v not in cached]

        new_mappings = {}
        if unknown:
            try:
                for i in range(0, len(unknown), CHUNK_SIZE):
                    chunk = unknown[i:i + CHUNK_SIZE]
                    raw = self._call_groq_json(
                        CATEGORISE_SYSTEM_PROMPT,
                        'Categorise these transactions: ' + json.dumps(chunk),
                    )
                    for vendor, category in raw.items():
                        new_mappings[vendor] = category if category in VALID_CATEGORIES else 'Uncategorized'
                self._save_to_vendor_cache(new_mappings)
            except Exception as e:
                logger.error('Groq categorisation failed: %r', e)
                for vendor in unknown:
                    new_mappings[vendor] = 'Uncategorized'

        return {**cached, **new_mappings}

    def apply_categories_to_transactions(
        self, transactions: list, user_id: str, force_groq: bool = False
    ) -> tuple:
        """
        Categorise Uncategorized transactions, persist to DB, save as learned rules.
        force_groq=True re-asks Groq even for vendors previously cached as Uncategorized.
        """
        uncategorised = [t for t in transactions if t.get('category', 'Uncategorized') == 'Uncategorized']
        if not uncategorised:
            return transactions, 0

        mappings = self.categorise_vendors(
            [t['description'] for t in uncategorised],
            force_groq=force_groq,
        )

        changed = 0
        new_rules = {}

        for transaction in transactions:
            if transaction.get('category', 'Uncategorized') == 'Uncategorized':
                new_cat = mappings.get(transaction['description'], 'Uncategorized')
                if new_cat != 'Uncategorized':
                    transaction['category'] = new_cat
                    changed += 1
                    new_rules[transaction['description']] = new_cat
                    try:
                        self.supabase.table('transactions').update(
                            {'category': new_cat}
                        ).eq('id', transaction['id']).eq('user_id', user_id).execute()
                    except Exception as e:
                        logger.warning('Failed to persist category for %s: %r', transaction['id'], e)

        if new_rules:
            self._save_to_learned_rules(new_rules, user_id)

        return transactions, changed

    def get_spending_insights(self, current_month_totals: dict, prev_month_totals: dict = None) -> str:
        user_content = 'Current month spending by category: ' + json.dumps(current_month_totals)
        if prev_month_totals:
            user_content += '\nPrevious month spending: ' + json.dumps(prev_month_totals)
        try:
            return self._call_groq_text(INSIGHTS_SYSTEM_PROMPT, user_content)
        except Exception as e:
            logger.error('Insights generation failed: %r', e)
            return ''

    def suggest_budget_targets(self, average_monthly_spend: dict) -> dict:
        try:
            raw = self._call_groq_json(
                BUDGET_SUGGESTION_SYSTEM_PROMPT,
                'Average monthly spending: ' + json.dumps(average_monthly_spend),
                max_tokens=200,
            )
            return {k: int(v) for k, v in raw.items() if isinstance(v, (int, float))}
        except Exception as e:
            logger.error('Budget suggestion failed: %r', e)
            return {}

    def detect_anomalies(self, recent_transactions: list, category_averages: dict) -> list:
        if not recent_transactions:
            return []
        try:
            user_content = (
                'Category average transaction amounts: ' + json.dumps(category_averages) +
                '\nRecent transactions: ' + json.dumps(recent_transactions[:100])
            )
            raw = self._call_groq_json(ANOMALY_SYSTEM_PROMPT, user_content, max_tokens=400)
            return raw if isinstance(raw, list) else raw.get('anomalies', [])
        except Exception as e:
            logger.error('Anomaly detection failed: %r', e)
            return []

    def suggest_transaction_categories(self, transactions: list, allowed_categories: list) -> list:
        """
        Suggest category + confidence + reason for each transaction.
        Returns:
        [
          {
            "transaction_id": "...",
            "suggested_category": "...",
            "confidence": 0..100,
            "reason": "...",
            "model_name": CATEGORISATION_MODEL
          }
        ]
        """
        if not transactions:
            return []

        categories = allowed_categories or sorted(VALID_CATEGORIES)
        payload = [
            {
                "transaction_id": str(t.get("id", "")),
                "description": str(t.get("description", "")),
                "amount": t.get("amount"),
                "date": t.get("date"),
            }
            for t in transactions
        ]
        description_by_id = {row["transaction_id"]: row["description"] for row in payload}

        results = []
        for i in range(0, len(payload), CHUNK_SIZE):
            chunk = payload[i:i + CHUNK_SIZE]
            try:
                raw = self._call_groq_json(
                    SUGGESTION_SYSTEM_PROMPT,
                    "Allowed categories: "
                    + json.dumps(categories)
                    + "\nTransactions: "
                    + json.dumps(chunk),
                    max_tokens=1400,
                )
                suggestions = raw.get("suggestions", []) if isinstance(raw, dict) else []
                for item in suggestions:
                    tx_id = str(item.get("transaction_id", "")).strip()
                    suggested = str(item.get("suggested_category", "Uncategorized")).strip()
                    if suggested not in categories:
                        suggested = "Uncategorized"
                    try:
                        confidence = float(item.get("confidence", 0))
                    except (TypeError, ValueError):
                        confidence = 0.0
                    confidence = max(0.0, min(100.0, confidence))
                    reason = str(item.get("reason", "")).strip()[:80]
                    if not tx_id:
                        continue
                    results.append(
                        {
                            "transaction_id": tx_id,
                            "suggested_category": suggested,
                            "confidence": confidence,
                            "reason": reason,
                            "model_name": CATEGORISATION_MODEL,
                        }
                    )
            except Exception as e:
                logger.error("suggest_transaction_categories chunk failed: %r", e)
                # fallback per transaction
                for tx in chunk:
                    results.append(
                        {
                            "transaction_id": tx.get("transaction_id"),
                            "suggested_category": "Uncategorized",
                            "confidence": 0.0,
                            "reason": "Model unavailable",
                            "model_name": CATEGORISATION_MODEL,
                        }
                    )

        # Ensure all input transactions are represented at least once.
        existing = {row.get("transaction_id") for row in results}
        missing_ids = [tx.get("transaction_id") for tx in payload if tx.get("transaction_id") not in existing]
        if missing_ids:
            # Secondary fallback: use vendor mapping pipeline for any transactions the model omitted.
            try:
                fallback_descriptions = [description_by_id.get(tx_id, "") for tx_id in missing_ids]
                fallback_map = self.categorise_vendors(fallback_descriptions, force_groq=False)
            except Exception:
                fallback_map = {}

            for tx_id in missing_ids:
                description = description_by_id.get(tx_id, "")
                fallback_category = fallback_map.get(description, "Uncategorized")
                if fallback_category != "Uncategorized":
                    confidence = 68.0
                    reason = "Fallback vendor mapping"
                else:
                    confidence = 0.0
                    reason = "No suggestion returned"
                results.append(
                    {
                        "transaction_id": tx_id,
                        "suggested_category": fallback_category,
                        "confidence": confidence,
                        "reason": reason,
                        "model_name": CATEGORISATION_MODEL,
                    }
                )
        logger.info(
            "suggest_transaction_categories_complete total=%s returned=%s missing_fallback=%s",
            len(payload),
            len(results),
            len(missing_ids),
        )
        return results
