from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.auth import get_current_user
from api.routes import reviews as reviews_route


def _mock_query(data=None):
    q = MagicMock()
    q.select.return_value = q
    q.eq.return_value = q
    q.order.return_value = q
    q.limit.return_value = q
    q.insert.return_value = q
    q.update.return_value = q
    q.delete.return_value = q
    q.gte.return_value = q
    q.lt.return_value = q
    q.is_.return_value = q
    q.execute.return_value = SimpleNamespace(data=data or [])
    return q


def _client(mock_supabase):
    app = FastAPI()
    app.include_router(reviews_route.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: "user-1"
    reviews_route.supabase_admin = mock_supabase
    return TestClient(app)


def test_generate_review_rejects_unowned_account():
    accounts_query = _mock_query(data=[])
    mock_supabase = MagicMock()
    mock_supabase.table.return_value = accounts_query

    client = _client(mock_supabase)
    res = client.post(
        "/api/reviews/generate",
        json={
            "review_type": "monthly_closeout",
            "period_start": "2026-03-01",
            "period_end": "2026-03-31",
            "account_id": "acc-not-owned",
        },
    )

    assert res.status_code == 400
    assert "Invalid account" in res.text


def test_generate_review_returns_created_review_for_valid_account(monkeypatch):
    accounts_query = _mock_query(data=[{"id": "acc-1"}])
    mock_supabase = MagicMock()
    mock_supabase.table.return_value = accounts_query

    created_review = {"id": "review-1", "review_type": "monthly_closeout"}
    get_or_create_mock = MagicMock(return_value=created_review)
    monkeypatch.setattr(reviews_route, "get_or_create_review", get_or_create_mock)

    client = _client(mock_supabase)
    res = client.post(
        "/api/reviews/generate",
        json={
            "review_type": "monthly_closeout",
            "period_start": "2026-03-01",
            "period_end": "2026-03-31",
            "account_id": "acc-1",
        },
    )

    assert res.status_code == 200
    payload = res.json()
    assert payload["review"]["id"] == "review-1"
    get_or_create_mock.assert_called_once()
