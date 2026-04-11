from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.auth import get_current_user
from api.routes import budget as budget_route


def _mock_query(data=None):
    q = MagicMock()
    q.select.return_value = q
    q.eq.return_value = q
    q.order.return_value = q
    q.limit.return_value = q
    q.gte.return_value = q
    q.lt.return_value = q
    q.insert.return_value = q
    q.update.return_value = q
    q.delete.return_value = q
    q.execute.return_value = SimpleNamespace(data=data or [])
    return q


def _client(mock_supabase):
    app = FastAPI()
    app.include_router(budget_route.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: "user-1"
    budget_route.supabase_admin = mock_supabase
    return TestClient(app)


def test_create_goal_rejects_invalid_account_scope():
    account_q = _mock_query(data=[])
    mock_supabase = MagicMock()
    mock_supabase.table.return_value = account_q

    client = _client(mock_supabase)
    response = client.post(
        "/api/goals",
        json={
            "name": "Laptop",
            "goal_type": "planned_purchase",
            "target_amount": 1200,
            "current_saved": 200,
            "target_date": "2030-01-01",
            "account_scope": "acc-missing",
        },
    )

    assert response.status_code == 400
    assert "Invalid account scope" in response.text


def test_get_goals_affordability_returns_items():
    goals_q = _mock_query(
        data=[
            {
                "id": "goal-1",
                "user_id": "user-1",
                "account_scope": "all",
                "name": "Holiday",
                "goal_type": "planned_purchase",
                "target_amount": 1000,
                "current_saved": 300,
                "target_date": "2030-01-01",
                "status": "active",
            }
        ]
    )
    tx_q = _mock_query(data=[])

    mock_supabase = MagicMock()
    mock_supabase.table.side_effect = [goals_q, tx_q]

    client = _client(mock_supabase)
    response = client.get("/api/goals-affordability?status=active")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["items"]) == 1
    assert payload["items"][0]["goal"]["id"] == "goal-1"
    assert "required_monthly_saving" in payload["items"][0]["affordability"]
