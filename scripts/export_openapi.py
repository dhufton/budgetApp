#!/usr/bin/env python3
"""Export deterministic OpenAPI schema for the FastAPI app."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "openapi" / "openapi.json"
sys.path.insert(0, str(ROOT))


def _ensure_env() -> None:
    # Avoid import failures in local/CI schema generation.
    os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
    os.environ.setdefault(
        "SUPABASE_ANON_KEY",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
        "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4YW1wbGUiLCJyb2xlIjoiYW5vbiJ9."
        "signature-placeholder",
    )


def _canonicalize(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _canonicalize(value[k]) for k in sorted(value.keys())}
    if isinstance(value, list):
        return [_canonicalize(v) for v in value]
    return value


def main() -> None:
    _ensure_env()

    from api.main import app

    schema = app.openapi()
    schema = _canonicalize(schema)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(schema, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    print(f"Wrote OpenAPI schema to {OUTPUT}")


if __name__ == "__main__":
    main()
