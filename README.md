# BudgetApp

BudgetApp is a FastAPI + React personal finance tracker with:
- Supabase auth and data storage
- Multi-account support
- Statement ingestion (PDF/CSV)
- Rule-based and AI-assisted categorisation
- Budget targets, budget health, and trend analytics

## Architecture

- Backend API: `api/` (FastAPI)
- Frontend: `web/` (React + Vite, built and served by FastAPI)
- Shared/core modules: `src/` (Supabase client, ingestion, categorisation config)
- Database contract: `supabase/schema_contract.sql` + `docs/supabase-schema-contract.md`
- Tests: `tests/`

### High-level flow

1. User authenticates in the React app via Supabase JS client.
2. React sends bearer token to FastAPI routes.
3. Backend validates token with `src/supabase_client.supabase`.
4. Statement upload parses rows, applies deterministic rules and transfer classification, then optionally calls Groq for remaining uncategorised rows.
5. Routes return account-aware transaction/budget analytics.

## Repository Structure

```text
budgetApp/
  api/
    main.py                   # app bootstrap, middleware, page routes, AI endpoints
    auth.py                   # bearer token -> current user
    dependencies.py           # cached Supabase/Groq dependencies
    groq_service.py           # categorisation + insights/budget suggestions
    transfer_rules.py         # transfer detection/classification
    routes/
      accounts.py             # account CRUD + default account rules
      upload.py               # statement upload + parse + persist
      transactions.py         # list + category patch
      categories.py           # category CRUD + keyword mapping
      budget.py               # targets, comparison, health, trend
  web/
    src/
      app/                    # router, providers, shell
      components/             # shared UI/layout primitives
      features/               # auth, dashboard, settings, transactions
      lib/                    # API client, auth helpers, constants
      styles/                 # tokens and global styles
    package.json
    vite.config.ts
  src/
    config.py                 # built-in categories + keyword rules
    supabase_client.py        # anon/admin Supabase clients
    ingestion/
      parser.py               # Chase PDF + Amex CSV parsing
      storage.py              # statement storage orchestration
      b2_client.py            # B2/S3 adapter
      learning.py             # learned rule load/save helpers
  docs/
    supabase-schema-contract.md
  supabase/
    schema_contract.sql
    migrations/20260410_multi_account_v1.sql
  tests/
    test_accounts_and_transactions_routes.py
    test_transfer_rules.py
```

## Local Development

### 1. Install dependencies

```bash
pip install -r requirements-dev.txt
cd web && npm ci && cd ..
```

### 2. Set environment variables

Required:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `B2_ENDPOINT_URL`
- `B2_KEY_ID`
- `B2_APP_KEY`
- `B2_BUCKET_NAME`
- `GROQ_API_KEY`

Recommended for backend writes:
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:
- `LOG_LEVEL` (default: `INFO`)

### 3. Run the API

```bash
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

Open: [http://localhost:8000/](http://localhost:8000/)

### 4. Build the React app

```bash
cd web && npm run build && cd ..
```

## API Surface (Current)

### Pages
- `GET /`
- `GET /dashboard`
- `GET /settings`
- `GET /transactions`
- `GET /app/*` -> compatibility redirect to primary React routes

### Core
- `GET /api/config`
- `GET /health`

### Accounts
- `GET /api/accounts`
- `POST /api/accounts`
- `PATCH /api/accounts/{account_id}`
- `DELETE /api/accounts/{account_id}`

### Upload + Transactions
- `POST /api/upload`
- `GET /api/transactions`
- `PATCH /api/transactions/{transaction_id}/category`
- `POST /api/categorise`

### Categories
- `GET /api/categories`
- `POST /api/categories`
- `PATCH /api/categories/{category}/keywords`
- `DELETE /api/categories/{category}`

### Budget + Analytics
- `GET /api/budget-targets`
- `POST /api/budget-targets`
- `PATCH /api/budget-targets/{category}`
- `DELETE /api/budget-targets/{category}`
- `GET /api/budget-comparison`
- `GET /api/budget-health`
- `GET /api/budget-trend`
- `GET /api/insights`
- `GET /api/budget-suggestions`

## OpenAPI / Swagger

- Interactive Swagger UI: `GET /docs`
- ReDoc: `GET /redoc`
- Live schema: `GET /openapi.json`
- Committed schema snapshot: `docs/openapi/openapi.json`

Regenerate committed schema:

```bash
./.venv/bin/python scripts/export_openapi.py
```

Schema sync is enforced by:

- `tests/test_openapi_schema_sync.py`

When adding/changing endpoints, regenerate and commit `docs/openapi/openapi.json` in the same PR.

## Testing

Run all tests:

```bash
pytest -q
```

Current test focus:
- Accounts route behavior and account filtering on transactions
- Transfer classification rules

## Observability

`api/main.py` includes:
- request ID propagation via `X-Request-ID`
- request completion/failure timing logs
- global exception handler returning 500 payloads with `request_id`
- `/health` includes uptime

## Data Contract

Schema source of truth:
- `supabase/schema_contract.sql`
- `docs/supabase-schema-contract.md`

If table/column names change, update backend routes + frontend payloads in the same change.

## Deployment

Render configuration is defined in `render.yaml`.
