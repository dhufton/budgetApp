# OpenAPI / Swagger Schema

This directory contains the committed OpenAPI schema for the FastAPI backend:

- `docs/openapi/openapi.json`

## Why this exists

- Faster debugging and endpoint discovery.
- Stable snapshot of request/response contracts.
- Prevents undocumented endpoint drift.

## Regenerate schema

From repository root:

```bash
./.venv/bin/python scripts/export_openapi.py
```

## Enforced sync check

`tests/test_openapi_schema_sync.py` compares:

- generated schema from `api.main:app`
- committed `docs/openapi/openapi.json`

If they differ, tests fail and prompt regeneration.

## Rule for future endpoints

When adding/changing/removing API routes or request models:

1. Update code.
2. Regenerate OpenAPI JSON.
3. Commit both code and `docs/openapi/openapi.json`.
