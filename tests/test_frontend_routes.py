import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault(
    "SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4YW1wbGUiLCJyb2xlIjoiYW5vbiJ9."
    "signature-placeholder",
)

from api.main import app


def test_transactions_route_redirects_to_react_app():
    with TestClient(app) as client:
        response = client.get("/transactions", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "/app/transactions"


def test_dashboard_route_redirects_to_react_app():
    with TestClient(app) as client:
        response = client.get("/dashboard", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "/app/dashboard"


def test_legacy_dashboard_route_remains_available():
    with TestClient(app) as client:
        response = client.get("/legacy/dashboard")

    assert response.status_code == 200
    assert "Dashboard - Budget Tracker" in response.text


def test_legacy_transactions_route_remains_available():
    with TestClient(app) as client:
        response = client.get("/legacy/transactions")

    assert response.status_code == 200
    assert "Transactions - Budget Tracker" in response.text
