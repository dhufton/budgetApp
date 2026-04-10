from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from src.supabase_client import supabase_admin

REVIEW_TYPES = {"monthly_closeout", "upload_snapshot"}
TRIGGER_TYPES = {"system_monthly", "upload", "manual"}


def _next_day(d: date) -> date:
    return d + timedelta(days=1)


def _parse_date(value: str | date) -> date:
    if isinstance(value, date):
        return value
    return datetime.strptime(value, "%Y-%m-%d").date()


def _apply_account_filter(query, account_id: str):
    if account_id and account_id != "all":
        return query.eq("account_id", account_id)
    return query


def _fetch_transactions(user_id: str, period_start: date, period_end: date, account_id: str = "all") -> List[Dict[str, Any]]:
    query = (
        supabase_admin.table("transactions")
        .select("id, date, description, amount, category, excluded_from_budget")
        .eq("user_id", user_id)
        .gte("date", period_start.isoformat())
        .lt("date", _next_day(period_end).isoformat())
    )
    query = _apply_account_filter(query, account_id)
    result = query.execute()
    return result.data or []


def _fetch_budget_targets(user_id: str) -> Dict[str, float]:
    result = (
        supabase_admin.table("budget_targets")
        .select("category,target_amount")
        .eq("user_id", user_id)
        .execute()
    )
    targets: Dict[str, float] = {}
    for row in (result.data or []):
        try:
            targets[row["category"]] = float(row["target_amount"])
        except Exception:
            continue
    return targets


def _merchant_from_description(desc: str) -> str:
    if not desc:
        return "Unknown"
    return str(desc).strip().split("  ")[0][:60]


def _aggregate_spend_by_category(transactions: List[Dict[str, Any]]) -> Dict[str, float]:
    out: Dict[str, float] = defaultdict(float)
    for t in transactions:
        amount = float(t.get("amount") or 0)
        category = t.get("category") or "Uncategorized"
        excluded = bool(t.get("excluded_from_budget", False))
        if amount < 0 and not excluded and category != "Transfer":
            out[category] += abs(amount)
    return dict(out)


def _review_summary(
    user_id: str,
    transactions: List[Dict[str, Any]],
    period_start: date,
    period_end: date,
    account_scope: str,
    statement_id: Optional[str] = None,
) -> Dict[str, Any]:
    spend_by_category = _aggregate_spend_by_category(transactions)

    spent = sum(spend_by_category.values())
    income = sum(float(t.get("amount") or 0) for t in transactions if float(t.get("amount") or 0) > 0)
    net = income - spent

    targets = _fetch_budget_targets(user_id)
    budget_variance = []
    for category in sorted(set(targets.keys()) | set(spend_by_category.keys())):
        target = float(targets.get(category, 0.0))
        actual = float(spend_by_category.get(category, 0.0))
        variance = target - actual
        pct_used = (actual / target * 100.0) if target > 0 else 0.0
        budget_variance.append(
            {
                "category": category,
                "target": round(target, 2),
                "actual": round(actual, 2),
                "variance": round(variance, 2),
                "pct_used": round(pct_used, 1),
            }
        )

    merchant_totals: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"amount": 0.0, "count": 0})
    for t in transactions:
        amount = float(t.get("amount") or 0)
        category = t.get("category") or "Uncategorized"
        excluded = bool(t.get("excluded_from_budget", False))
        if amount < 0 and not excluded and category != "Transfer":
            m = _merchant_from_description(t.get("description", ""))
            merchant_totals[m]["amount"] += abs(amount)
            merchant_totals[m]["count"] += 1

    top_merchants = sorted(
        [{"merchant": m, "amount": round(v["amount"], 2), "count": v["count"]} for m, v in merchant_totals.items()],
        key=lambda x: x["amount"],
        reverse=True,
    )[:5]

    # Previous period comparison
    length_days = (period_end - period_start).days + 1
    prev_end = period_start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=length_days - 1)
    prev_transactions = _fetch_transactions(user_id, prev_start, prev_end, account_scope)
    prev_spend_by_category = _aggregate_spend_by_category(prev_transactions)

    category_changes_vs_previous = []
    for cat in sorted(set(spend_by_category.keys()) | set(prev_spend_by_category.keys())):
        prev = float(prev_spend_by_category.get(cat, 0.0))
        cur = float(spend_by_category.get(cat, 0.0))
        delta = cur - prev
        delta_pct = (delta / prev * 100.0) if prev > 0 else (100.0 if cur > 0 else 0.0)
        category_changes_vs_previous.append(
            {
                "category": cat,
                "previous": round(prev, 2),
                "current": round(cur, 2),
                "delta": round(delta, 2),
                "delta_pct": round(delta_pct, 1),
            }
        )

    flags = []
    for row in budget_variance:
        if row["target"] > 0 and row["actual"] > row["target"]:
            flags.append({"type": "over_budget", "category": row["category"], "severity": "medium"})
    for row in category_changes_vs_previous:
        if row["previous"] > 0 and row["delta_pct"] >= 30:
            flags.append({"type": "spike_vs_previous", "category": row["category"], "severity": "low"})

    return {
        "totals": {
            "spent": round(spent, 2),
            "income": round(income, 2),
            "net": round(net, 2),
            "transaction_count": len(transactions),
        },
        "budget_variance": budget_variance,
        "top_merchants": top_merchants,
        "category_changes_vs_previous": category_changes_vs_previous,
        "flags": flags,
        "meta": {
            "currency": "GBP",
            "account_scope": account_scope,
            "source_statement_id": statement_id,
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
        },
    }


def get_or_create_review(
    *,
    user_id: str,
    review_type: str,
    triggered_by: str,
    period_start: date,
    period_end: date,
    account_id: str = "all",
    statement_id: Optional[str] = None,
) -> Dict[str, Any]:
    if review_type not in REVIEW_TYPES:
        raise ValueError("Invalid review_type")
    if triggered_by not in TRIGGER_TYPES:
        raise ValueError("Invalid triggered_by")

    account_scope = account_id or "all"

    existing_query = (
        supabase_admin.table("monthly_reviews")
        .select("*")
        .eq("user_id", user_id)
        .eq("account_scope", account_scope)
        .eq("period_start", period_start.isoformat())
        .eq("period_end", period_end.isoformat())
        .eq("review_type", review_type)
    )
    if statement_id:
        existing_query = existing_query.eq("statement_id", statement_id)
    else:
        existing_query = existing_query.is_("statement_id", "null")

    existing = existing_query.limit(1).execute()
    if existing.data:
        return existing.data[0]

    transactions = _fetch_transactions(user_id, period_start, period_end, account_scope)
    summary = _review_summary(user_id, transactions, period_start, period_end, account_scope, statement_id)

    inserted = (
        supabase_admin.table("monthly_reviews")
        .insert(
            {
                "user_id": user_id,
                "account_scope": account_scope,
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "review_type": review_type,
                "triggered_by": triggered_by,
                "statement_id": statement_id,
                "summary": summary,
            }
        )
        .execute()
    )

    created = (inserted.data or [None])[0]

    # best-effort event logging
    try:
        supabase_admin.table("review_events").insert(
            {
                "user_id": user_id,
                "review_id": created.get("id") if created else None,
                "event_type": "review_created",
                "payload": {
                    "review_id": created.get("id") if created else None,
                    "review_type": review_type,
                    "triggered_by": triggered_by,
                },
            }
        ).execute()
    except Exception:
        pass

    return created or {}


def generate_monthly_closeout_for_previous_month(user_id: str, account_id: str = "all") -> Dict[str, Any]:
    today = date.today()
    this_month_start = date(today.year, today.month, 1)
    prev_month_end = this_month_start - timedelta(days=1)
    prev_month_start = date(prev_month_end.year, prev_month_end.month, 1)

    return get_or_create_review(
        user_id=user_id,
        review_type="monthly_closeout",
        triggered_by="system_monthly",
        period_start=prev_month_start,
        period_end=prev_month_end,
        account_id=account_id,
        statement_id=None,
    )
