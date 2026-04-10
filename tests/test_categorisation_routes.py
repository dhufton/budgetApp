from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.auth import get_current_user
from api.dependencies import get_groq_service
from api.routes import categorisation as categorisation_route


class DummyGroq:
    def suggest_transaction_categories(self, transactions, allowed_categories):
        return [
            {
                "transaction_id": transactions[0]["id"],
                "suggested_category": "Food",
                "confidence": 72.5,
                "reason": "Merchant keyword match",
                "model_name": "test-model",
            }
        ]


def _client():
    app = FastAPI()
    app.include_router(categorisation_route.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: "user-1"
    app.dependency_overrides[get_groq_service] = lambda: DummyGroq()
    return TestClient(app)


def test_suggest_returns_structured_counts(monkeypatch):
    monkeypatch.setattr(categorisation_route, "_validate_account_scope", lambda user_id, account_id: "all")
    monkeypatch.setattr(
        categorisation_route,
        "_fetch_uncategorised_transactions",
        lambda user_id, account_scope: [
            {
                "id": "txn-1",
                "account_id": "acc-1",
                "date": "2026-04-10",
                "description": "Tesco Superstore",
                "amount": -24.5,
                "category": "Uncategorized",
            }
        ],
    )
    monkeypatch.setattr(categorisation_route, "apply_user_keywords", lambda txns, user_id: txns)
    monkeypatch.setattr(categorisation_route, "apply_transfer_classification", lambda txns: txns)
    monkeypatch.setattr(categorisation_route, "_get_available_categories", lambda user_id: ["Food", "Uncategorized"]) 
    monkeypatch.setattr(categorisation_route, "_insert_suggestions", lambda rows: None)
    monkeypatch.setattr(categorisation_route, "_log_event", lambda *args, **kwargs: None)
    monkeypatch.setattr(categorisation_route, "_apply_transaction_category", lambda *args, **kwargs: None)
    monkeypatch.setattr(categorisation_route, "_save_learning_if_eligible", lambda *args, **kwargs: None)

    client = _client()
    response = client.post("/api/categorise/suggest", json={"account_id": "all", "threshold": 85})

    assert response.status_code == 200
    payload = response.json()
    assert payload["uncategorised_total"] == 1
    assert payload["suggested_total"] == 1
    assert payload["auto_applied"] == 0
    assert payload["needs_review"] == 1


def test_approve_rejects_empty_input():
    client = _client()
    response = client.post("/api/categorise/approve", json={"suggestion_ids": []})
    assert response.status_code == 400
    assert "No suggestion_ids provided" in response.text
