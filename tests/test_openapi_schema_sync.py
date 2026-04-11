import json
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _canonicalize(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _canonicalize(value[k]) for k in sorted(value.keys())}
    if isinstance(value, list):
        return [_canonicalize(v) for v in value]
    return value


def test_openapi_schema_is_in_sync():
    os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
    os.environ.setdefault(
        "SUPABASE_ANON_KEY",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
        "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4YW1wbGUiLCJyb2xlIjoiYW5vbiJ9."
        "signature-placeholder",
    )

    from api.main import app

    generated = _canonicalize(app.openapi())

    schema_path = Path("docs/openapi/openapi.json")
    assert schema_path.exists(), "OpenAPI schema file is missing: docs/openapi/openapi.json"

    committed = json.loads(schema_path.read_text(encoding="utf-8"))
    committed = _canonicalize(committed)

    assert generated == committed, (
        "OpenAPI schema is out of date. "
        "Run `./.venv/bin/python scripts/export_openapi.py` and commit docs/openapi/openapi.json"
    )
