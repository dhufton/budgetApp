from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.auth import get_current_user
from api.routes import accounts as accounts_route
from api.routes import transactions as transactions_route


def _client_for_accounts(mock_supabase):
    app = FastAPI()
    app.include_router(accounts_route.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: "user-1"
    accounts_route.supabase_admin = mock_supabase
    return TestClient(app)


def _client_for_transactions(mock_supabase):
    app = FastAPI()
    app.include_router(transactions_route.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: "user-1"
    transactions_route.supabase_admin = mock_supabase
    return TestClient(app)


def _mock_query(data=None):
    q = MagicMock()
    q.select.return_value = q
    q.eq.return_value = q
    q.order.return_value = q
    q.limit.return_value = q
    q.insert.return_value = q
    q.update.return_value = q
    q.delete.return_value = q
    q.execute.return_value = SimpleNamespace(data=data or [])
    return q


def test_list_accounts_returns_accounts():
    q_default = _mock_query(data=[{"id": "a-default"}])
    q_list = _mock_query(data=[{"id": "a-default", "name": "Primary", "is_default": True}])

    mock_supabase = MagicMock()
    mock_supabase.table.side_effect = [q_default, q_list]

    client = _client_for_accounts(mock_supabase)
    res = client.get("/api/accounts")

    assert res.status_code == 200
    assert "accounts" in res.json()


def test_delete_default_account_is_blocked():
    q_existing = _mock_query(data=[{"id": "a1", "is_default": True}])
    mock_supabase = MagicMock()
    mock_supabase.table.return_value = q_existing

    client = _client_for_accounts(mock_supabase)
    res = client.delete("/api/accounts/a1")

    assert res.status_code == 400
    assert "Default account cannot be deleted" in res.text


def test_get_transactions_applies_account_filter_when_provided():
    q = _mock_query(data=[])
    mock_supabase = MagicMock()
    mock_supabase.table.return_value = q

    client = _client_for_transactions(mock_supabase)
    res = client.get("/api/transactions?account_id=acc-123")

    assert res.status_code == 200
    q.eq.assert_any_call("account_id", "acc-123")
