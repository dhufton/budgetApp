from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.auth import get_current_user
from api.routes import recurring as recurring_route


def _mock_query(data=None):
    q = MagicMock()
    q.select.return_value = q
    q.eq.return_value = q
    q.order.return_value = q
    q.limit.return_value = q
    q.gte.return_value = q
    q.lte.return_value = q
    q.lt.return_value = q
    q.upsert.return_value = q
    q.update.return_value = q
    q.execute.return_value = SimpleNamespace(data=data or [])
    return q


def _client(mock_supabase):
    app = FastAPI()
    app.include_router(recurring_route.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: "user-1"
    recurring_route.supabase_admin = mock_supabase
    return TestClient(app)


def test_recompute_recurring_creates_rule(monkeypatch):
    monkeypatch.setattr(recurring_route, "_validate_account_scope", lambda user_id, account_id: "all")
    monkeypatch.setattr(
        recurring_route,
        "_fetch_transactions_for_recurrence",
        lambda user_id, account_scope, lookback_months: [
            {
                "id": "t1",
                "account_id": "acc-1",
                "date": "2026-01-10",
                "description": "Netflix\nPurchase",
                "amount": -12.99,
                "category": "Entertainment",
            },
            {
                "id": "t2",
                "account_id": "acc-1",
                "date": "2026-02-10",
                "description": "Netflix\nPurchase",
                "amount": -12.99,
                "category": "Entertainment",
            },
            {
                "id": "t3",
                "account_id": "acc-1",
                "date": "2026-03-10",
                "description": "Netflix\nPurchase",
                "amount": -12.99,
                "category": "Entertainment",
            },
        ],
    )

    default_account_q = _mock_query(data=[{"id": "acc-1", "is_default": True}])
    existing_q = _mock_query(data=[])
    upsert_q = _mock_query(data=[])

    mock_supabase = MagicMock()
    mock_supabase.table.side_effect = [default_account_q, existing_q, upsert_q]

    client = _client(mock_supabase)
    res = client.post("/api/recurring/recompute", json={"lookback_months": 12, "min_occurrences": 3, "account_id": "all"})

    assert res.status_code == 200
    payload = res.json()
    assert payload["rules_created"] == 1
    assert payload["rules_updated"] == 0
    assert payload["scanned_transactions"] == 3
    upsert_q.upsert.assert_called_once()


def test_recompute_recurring_rejects_invalid_account():
    account_q = _mock_query(data=[])
    mock_supabase = MagicMock()
    mock_supabase.table.return_value = account_q

    client = _client(mock_supabase)
    res = client.post("/api/recurring/recompute", json={"account_id": "acc-missing"})

    assert res.status_code == 400
    assert "Invalid account" in res.text


def test_upcoming_recurring_returns_items(monkeypatch):
    monkeypatch.setattr(recurring_route, "_validate_account_scope", lambda user_id, account_id: "all")

    upcoming_q = _mock_query(
        data=[
            {
                "id": "rule-1",
                "display_name": "Netflix",
                "next_expected_date": "2026-04-20",
                "average_amount": 12.99,
                "category": "Entertainment",
                "confidence": 92.0,
                "account_id": "acc-1",
            }
        ]
    )
    mock_supabase = MagicMock()
    mock_supabase.table.return_value = upcoming_q

    client = _client(mock_supabase)
    res = client.get("/api/recurring/upcoming?days=30")

    assert res.status_code == 200
    payload = res.json()
    assert len(payload["items"]) == 1
    assert payload["items"][0]["display_name"] == "Netflix"
    assert payload["items"][0]["expected_amount"] == 12.99
