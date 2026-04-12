import os
import sys
from pathlib import Path

import pytest
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

import api.main as main_module
from api.main import app


@pytest.fixture(autouse=True)
def react_dist_stub(tmp_path, monkeypatch):
    stub_index = tmp_path / "index.html"
    stub_index.write_text(
        "<!DOCTYPE html><html><body><div id=\"root\"></div></body></html>",
        encoding="utf-8",
    )
    monkeypatch.setattr(main_module, "WEB_DIST_INDEX", stub_index)


def assert_react_shell_response(response):
    assert response.status_code == 200
    assert '<div id="root"></div>' in response.text


def test_root_route_serves_react_app():
    with TestClient(app) as client:
        response = client.get("/")

    assert_react_shell_response(response)


def test_dashboard_route_serves_react_app():
    with TestClient(app) as client:
        response = client.get("/dashboard")

    assert_react_shell_response(response)


def test_transactions_route_serves_react_app():
    with TestClient(app) as client:
        response = client.get("/transactions")

    assert_react_shell_response(response)


def test_settings_route_serves_react_app():
    with TestClient(app) as client:
        response = client.get("/settings")

    assert_react_shell_response(response)


def test_app_dashboard_redirects_to_primary_dashboard_route():
    with TestClient(app) as client:
        response = client.get("/app/dashboard", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "/dashboard"


def test_app_root_redirects_to_primary_root_route():
    with TestClient(app) as client:
        response = client.get("/app", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "/"


def test_legacy_routes_are_not_available():
    with TestClient(app) as client:
        assert client.get("/legacy", follow_redirects=False).status_code == 404
        assert client.get("/legacy/login", follow_redirects=False).status_code == 404
        assert client.get("/legacy/dashboard", follow_redirects=False).status_code == 404
        assert client.get("/legacy/settings", follow_redirects=False).status_code == 404
        assert client.get("/legacy/transactions", follow_redirects=False).status_code == 404
