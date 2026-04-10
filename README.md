# BudgetApp

BudgetApp is a FastAPI + vanilla JS personal finance tracker.

It supports:
- Supabase auth + data storage
- Statement upload and parsing (PDF/CSV)
- Transaction categorisation (rules + AI)
- Budget target management
- Dashboard analytics and charts

## Tech Stack

- Backend: FastAPI, Uvicorn, Supabase Python client, pandas, pdfplumber
- Frontend: HTML/CSS/JS, Plotly
- Storage: Backblaze B2 (S3-compatible via boto3)
- AI: Groq

## Project Structure

- `api/`: FastAPI app and routes
- `frontend/`: static frontend pages and JS
- `src/`: ingestion/parsing/shared config
- `supabase/`: schema contract SQL
- `docs/`: architecture and schema documentation

## Local Run

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set environment variables:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (recommended)
- `B2_ENDPOINT_URL`
- `B2_KEY_ID`
- `B2_APP_KEY`
- `B2_BUCKET_NAME`
- `GROQ_API_KEY`
- `LOG_LEVEL` (optional, default `INFO`)

3. Start server:
```bash
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

4. Open:
- `http://localhost:8000/`

## Supabase Schema Contract

Use the contract SQL and docs as source of truth:
- `supabase/schema_contract.sql`
- `docs/supabase-schema-contract.md`

## API Routes (Summary)

- `POST /api/upload`
- `GET /api/transactions`
- `PATCH /api/transactions/{transaction_id}/category`
- `GET /api/categories`
- `POST /api/categories`
- `PATCH /api/categories/{category}/keywords`
- `DELETE /api/categories/{category}`
- `GET /api/budget-targets`
- `POST /api/budget-targets`
- `DELETE /api/budget-targets/{category}`
- `GET /api/budget-comparison`
- `GET /api/insights`
- `GET /api/budget-suggestions`
- `POST /api/categorise`
- `GET /health`

## Observability

Current observability behavior (implemented in `api/main.py`):

- Request correlation:
  - Incoming `X-Request-ID` is accepted.
  - If missing, a request ID is generated.
  - `X-Request-ID` is returned on responses.

- Request logging:
  - Logs method, path, status, and duration (ms) per request.
  - Logs failed requests with duration before exception propagation.

- Exception logging:
  - Unhandled exceptions are logged with stack traces.
  - 500 responses include the request ID in payload for log correlation.

- Health endpoint:
  - `/health` returns `status`, `version`, and `uptime_seconds`.

## Deployment

Render deployment config is in `render.yaml`.

The service expects all required environment variables to be configured in Render.
