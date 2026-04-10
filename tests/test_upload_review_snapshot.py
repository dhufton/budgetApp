from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import pandas as pd
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.auth import get_current_user
from api.dependencies import get_groq_service
from api.routes import upload as upload_route


class DummyGroq:
    def get_cached_categories(self, descriptions):
        return {}

    def apply_categories_to_transactions(self, transactions, user_id):
        return transactions, 0


class DummyParser:
    def __init__(self, user_id):
        self.user_id = user_id

    def parse(self, file_stream):
        return pd.DataFrame([
            {
                "Date": datetime(2026, 3, 5),
                "Description": "Tesco Stores",
                "Amount": -12.34,
                "Category": "Food",
            }
        ])


class Query:
    def __init__(self, execute_results):
        self._execute_results = list(execute_results)

    def select(self, *args, **kwargs):
        return self

    def eq(self, *args, **kwargs):
        return self

    def gte(self, *args, **kwargs):
        return self

    def lt(self, *args, **kwargs):
        return self

    def order(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def insert(self, *args, **kwargs):
        return self

    def update(self, *args, **kwargs):
        return self

    def delete(self, *args, **kwargs):
        return self

    def is_(self, *args, **kwargs):
        return self

    def execute(self):
        if self._execute_results:
            return self._execute_results.pop(0)
        return SimpleNamespace(data=[])


class MockSupabase:
    def __init__(self):
        self.accounts = Query([SimpleNamespace(data=[{"id": "acc-1"}])])
        self.users = Query([
            SimpleNamespace(data=[]),
            SimpleNamespace(data=[{"id": "user-1"}]),
        ])
        self.statements = Query([SimpleNamespace(data=[{"id": "stmt-1"}])])
        self.transactions = Query([SimpleNamespace(data=[{
            "id": "txn-1",
            "category": "Food",
            "amount": -12.34,
            "date": "2026-03-05",
            "description": "Tesco Stores",
        }])])

    def table(self, name):
        return {
            "accounts": self.accounts,
            "users": self.users,
            "statements": self.statements,
            "transactions": self.transactions,
        }[name]


def test_upload_creates_snapshot_review(monkeypatch):
    app = FastAPI()
    app.include_router(upload_route.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: "user-1"
    app.dependency_overrides[get_groq_service] = lambda: DummyGroq()

    mock_supabase = MockSupabase()
    monkeypatch.setattr(upload_route, "supabase_admin", mock_supabase)
    monkeypatch.setattr(upload_route, "AmexCSVParser", DummyParser)
    monkeypatch.setattr(upload_route, "save_uploaded_file", lambda file_obj, user_id: f"{user_id}/statement.csv")
    monkeypatch.setattr(upload_route, "get_all_statement_paths", lambda user_id: [])
    monkeypatch.setattr(upload_route, "apply_user_keywords", lambda txns, user_id: txns)
    monkeypatch.setattr(upload_route, "apply_transfer_classification", lambda txns: txns)

    review_mock = MagicMock(return_value={"id": "review-1"})
    monkeypatch.setattr(upload_route, "get_or_create_review", review_mock)

    client = TestClient(app)
    response = client.post(
        "/api/upload",
        files={"file": ("statement.csv", "Date,Description,Amount\n05/03/2026,Tesco Stores,12.34\n", "text/csv")},
        data={"account_id": "acc-1"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["review_id"] == "review-1"
    review_mock.assert_called_once()
