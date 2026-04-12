# agents.md

This file is for coding agents working in this repository.

## Objective

Maintain and extend BudgetApp (FastAPI + React) without breaking:
- Supabase schema contract
- account-aware transaction flows
- deterministic + AI-assisted categorisation pipeline

## Repo Map (What Lives Where)

- `api/main.py`: App bootstrap, middleware, static page routes, AI insight/suggestion/categorise endpoints.
- `api/auth.py`: Bearer token authentication (Supabase user lookup).
- `api/dependencies.py`: Cached app dependencies (`get_supabase`, `get_groq_service`).
- `api/groq_service.py`: Groq wrappers for categorisation, insights, budget suggestions.
- `api/transfer_rules.py`: Regex-based transfer detection and classification.
- `api/routes/accounts.py`: Multi-account CRUD and default-account safeguards.
- `api/routes/upload.py`: Statement upload flow (parse -> classify -> persist).
- `api/routes/transactions.py`: Transaction list + category update.
- `api/routes/categories.py`: Category CRUD + keyword upsert + keyword classification helper.
- `api/routes/categorisation.py`: Suggest/approve/reject/override category workflow and review queue.
- `api/routes/budget.py`: Budget targets/comparison/health/trend endpoints.
- `api/routes/reviews.py`: Account-scoped monthly/upload review generation and history endpoints.
- `api/routes/recurring.py`: Recurring transaction rule CRUD, recompute, and upcoming endpoints.
- `api/review_service.py`: Shared review generation logic used by review/upload flows.
- `web/src/app/*`: React app shell, router, and global providers.
- `web/src/components/*`: Shared React layout and UI primitives.
- `web/src/features/auth/*`: Auth page, provider, and protected-route behavior.
- `web/src/features/dashboard/*`: Dashboard React feature modules.
- `web/src/features/settings/*`: Settings React feature modules.
- `web/src/features/transactions/*`: Transactions React feature modules.
- `web/src/lib/api/*`: Typed API client/endpoints/types used by React features.
- `web/src/lib/constants/categories.ts`: Frontend category constants.
- `web/src/styles/*`: Global design tokens and base styles.
- `src/config.py`: Built-in categories + deterministic keyword rules.
- `src/supabase_client.py`: Global Supabase anon/admin clients.
- `src/ingestion/parser.py`: Chase PDF and Amex CSV parsing.
- `src/ingestion/storage.py` + `src/ingestion/b2_client.py`: B2 storage operations.
- `src/ingestion/learning.py`: Learned categorisation rule helpers.
- `supabase/schema_contract.sql`: Canonical schema contract.
- `docs/supabase-schema-contract.md`: Human-readable schema contract.
- `docs/openapi/openapi.json`: Committed OpenAPI snapshot kept in sync with routes/models.
- `tests/`: Route and transfer-rule unit tests.

## Critical Contracts (Do Not Drift)

1. Built-in categories must remain aligned across:
- `src/config.py`
- `web/src/lib/constants/categories.ts`
- `docs/supabase-schema-contract.md`

2. Schema changes must be paired:
- Update `supabase/schema_contract.sql`
- Add/adjust migration in `supabase/migrations/`
- Update route + frontend payload assumptions

3. Account-aware behavior:
- `POST /api/upload` requires `account_id`
- List/analytics endpoints using `account_id` query must preserve `all` behavior

4. Categorisation order of operations:
- deterministic keywords/user keywords/transfer rules before Groq fallback

5. API contract sync:
- Route/request-model changes must regenerate and commit `docs/openapi/openapi.json`

## Safe Change Workflow

1. Read impacted API route(s), corresponding React feature(s)/shared component(s), and schema contract first.
2. Prefer minimal, local edits over broad refactors.
3. Keep request/response shapes backward-compatible unless intentionally versioned.
4. Update tests (or add targeted tests) when behavior changes.
5. Run tests before finalizing.

## Validation Commands

Install:
```bash
pip install -r requirements-dev.txt
```

Run tests:
```bash
pytest -q
```

Run targeted schema sync check:
```bash
pytest -q tests/test_openapi_schema_sync.py
```

Regenerate committed OpenAPI schema after endpoint/model changes:
```bash
./.venv/bin/python scripts/export_openapi.py
```

Run app:
```bash
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

## Common Pitfalls

- Editing only backend category constants and forgetting React frontend defaults.
- Introducing schema field renames without updating docs/routes/UI.
- Breaking auth flow by bypassing the shared React auth/API client.
- Reordering classification steps so transfer detection or user keywords no longer run before Groq.

## Out of Scope for Routine Changes

- Do not edit `.pyc` files under `__pycache__`.
- Do not treat stale cache files as source of truth.
