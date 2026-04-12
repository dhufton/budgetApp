# api/main.py
import sys
import os
import logging
from pathlib import Path
from time import perf_counter
from uuid import uuid4

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from api.routes import transactions, upload, categories, budget, accounts, reviews, categorisation, recurring
from api.dependencies import get_supabase, get_groq_service
from fastapi import FastAPI, Depends, HTTPException, Request
from api.auth import get_current_user
from supabase import Client
from api.groq_service import GroqService
from api.routes.categories import apply_user_keywords
from api.transfer_rules import apply_transfer_classification
from datetime import datetime, timedelta
from collections import defaultdict

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)
APP_START_TIME = datetime.utcnow()
BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
WEB_DIST_DIR = BASE_DIR / "web" / "dist"
WEB_DIST_INDEX = WEB_DIST_DIR / "index.html"
WEB_DIST_ASSETS_DIR = WEB_DIST_DIR / "assets"

app = FastAPI(title="Budget Tracker API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
        "https://budgetapp-fusi.onrender.com",
        "https://budget-tracker-app-n12a.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/css", StaticFiles(directory=str(FRONTEND_DIR / "css")), name="css")
app.mount("/js",  StaticFiles(directory=str(FRONTEND_DIR / "js")),  name="js")
app.mount(
    "/app/assets",
    StaticFiles(directory=str(WEB_DIST_ASSETS_DIR), check_dir=False),
    name="react-assets",
)

app.include_router(upload.router,       prefix="/api", tags=["upload"])
app.include_router(transactions.router, prefix="/api", tags=["transactions"])
app.include_router(categories.router,   prefix="/api", tags=["categories"])
app.include_router(budget.router,       prefix="/api", tags=["budget"])
app.include_router(accounts.router,     prefix="/api", tags=["accounts"])
app.include_router(reviews.router,      prefix="/api", tags=["reviews"])
app.include_router(categorisation.router, prefix="/api", tags=["categorisation"])
app.include_router(recurring.router,    prefix="/api", tags=["recurring"])


def _apply_account_filter(query, account_id: str):
    if account_id and account_id != "all":
        return query.eq("account_id", account_id)
    return query


@app.middleware("http")
async def request_observability_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or uuid4().hex
    request.state.request_id = request_id
    start = perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (perf_counter() - start) * 1000
        logger.warning(
            "request_failed request_id=%s method=%s path=%s duration_ms=%.2f",
            request_id,
            request.method,
            request.url.path,
            duration_ms,
        )
        raise

    duration_ms = (perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "request_complete request_id=%s method=%s path=%s status=%s duration_ms=%.2f",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", "unknown")
    logger.exception(
        "unhandled_exception request_id=%s method=%s path=%s",
        request_id,
        request.method,
        request.url.path,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "request_id": request_id},
    )


@app.on_event("startup")
async def startup():
    logger.info("api_startup version=1.0.0 log_level=%s", LOG_LEVEL)
    try:
        get_supabase()
        logger.info("Supabase client ready")
    except RuntimeError as e:
        logger.error(f"Startup failed: {e}")
        raise
    try:
        get_groq_service()
        logger.info("Groq service ready")
    except RuntimeError as e:
        logger.warning(f"Groq service unavailable - categorisation disabled: {e}")


@app.get("/api/config")
@app.head("/api/config")
async def get_config():
    return {
        "supabase_url": os.environ.get("SUPABASE_URL"),
        "supabase_key": os.environ.get("SUPABASE_ANON_KEY"),
    }


@app.api_route("/",             methods=["GET", "HEAD"], include_in_schema=False)
async def root():             return FileResponse(FRONTEND_DIR / "index.html")

@app.api_route("/dashboard",    methods=["GET", "HEAD"], include_in_schema=False)
async def dashboard():        return FileResponse(FRONTEND_DIR / "dashboard.html")

@app.api_route("/settings",     methods=["GET", "HEAD"], include_in_schema=False)
async def settings_page():    return FileResponse(FRONTEND_DIR / "settings.html")

@app.api_route("/transactions", methods=["GET", "HEAD"], include_in_schema=False)
async def transactions_page(): return FileResponse(FRONTEND_DIR / "transactions.html")


@app.api_route("/app", methods=["GET", "HEAD"], include_in_schema=False)
@app.api_route("/app/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
async def react_app(full_path: str = ""):
    if not WEB_DIST_INDEX.exists():
        return JSONResponse(
            status_code=503,
            content={
                "detail": "React app build not found. Run `npm install` and `npm run build` in `web/`."
            },
        )

    return FileResponse(WEB_DIST_INDEX)


@app.get("/api/insights")
async def get_insights(
    current_user: str = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
    groq: GroqService = Depends(get_groq_service),
    account_id: str = "all",
):
    try:
        query = (
            supabase.table("transactions")
            .select("amount, category, date")
            .eq("user_id", current_user)
        )
        query = _apply_account_filter(query, account_id)
        result = query.execute()
        txns = result.data or []
        now = datetime.now()
        current_month = now.strftime("%Y-%m")
        prev_month = (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")

        def monthly_totals(month: str) -> dict:
            totals: dict = defaultdict(float)
            for t in txns:
                if (
                    t["date"].startswith(month)
                    and t["amount"] < 0
                    and t.get("category") != "Transfer"
                ):
                    totals[t["category"]] += abs(t["amount"])
            return {k: round(v, 2) for k, v in totals.items()}

        current  = monthly_totals(current_month)
        previous = monthly_totals(prev_month)
        insight  = groq.get_spending_insights(current, previous) or None
        return {"insight": insight, "current_month": current, "previous_month": previous}
    except Exception as e:
        logger.error(f"Insights error: {e!r}")
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/budget-suggestions")
async def get_budget_suggestions(
    current_user: str = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
    groq: GroqService = Depends(get_groq_service),
    account_id: str = "all",
):
    query = (
        supabase.table("transactions")
        .select("amount, category, date")
        .eq("user_id", current_user)
    )
    query = _apply_account_filter(query, account_id)
    result = query.execute()
    monthly_category: dict = defaultdict(lambda: defaultdict(float))
    for t in result.data or []:
        if t["amount"] < 0 and t.get("category") != "Transfer":
            month = t["date"][:7]
            monthly_category[month][t["category"]] += abs(t["amount"])
    if not monthly_category:
        return {"suggestions": {}}
    all_cats = set(cat for m in monthly_category.values() for cat in m)
    averages = {
        cat: round(
            sum(monthly_category[m].get(cat, 0) for m in monthly_category) / len(monthly_category),
            2,
        )
        for cat in all_cats
    }
    suggestions = groq.suggest_budget_targets(averages)
    return {"suggestions": suggestions, "based_on_months": len(monthly_category)}


@app.post("/api/categorise")
async def categorise_transactions(
    current_user: str = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
    groq: GroqService = Depends(get_groq_service),
    account_id: str = "all",
):
    query = (
        supabase.table("transactions")
        .select("id, description, category")
        .eq("user_id", current_user)
        .eq("category", "Uncategorized")
    )
    query = _apply_account_filter(query, account_id)
    result = query.execute()
    uncategorised = result.data or []
    if not uncategorised:
        return {"message": "No uncategorised transactions", "changed": 0}

    # Apply user-defined keywords first before hitting Groq
    uncategorised = apply_user_keywords(uncategorised, current_user)
    uncategorised = apply_transfer_classification(uncategorised)

    # Persist any that were resolved by user keywords
    kw_changed = 0
    still_uncategorised = []
    for txn in uncategorised:
        if txn.get("category") != "Uncategorized":
            kw_changed += 1
            try:
                supabase.table("transactions").update(
                    {"category": txn["category"]}
                ).eq("id", txn["id"]).eq("user_id", current_user).execute()
            except Exception as e:
                logger.warning(f"Failed to persist user-keyword category: {e!r}")
        else:
            still_uncategorised.append(txn)

    groq_changed = 0
    if still_uncategorised:
        _, groq_changed = groq.apply_categories_to_transactions(still_uncategorised, current_user)

    total_changed = kw_changed + groq_changed
    return {"message": f"Categorised {total_changed} transactions", "changed": total_changed}


@app.get("/health")
async def health_check():
    uptime_seconds = int((datetime.utcnow() - APP_START_TIME).total_seconds())
    return {"status": "healthy", "version": "1.0.0", "uptime_seconds": uptime_seconds}
