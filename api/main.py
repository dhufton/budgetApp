# api/main.py
import sys
import os
import logging

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from api.routes import transactions, upload, categories, budget
from api.dependencies import get_supabase, get_groq_service
from fastapi import FastAPI, Depends
from api.auth import get_current_user
from supabase import Client
from groq_service import GroqService
from datetime import datetime, timedelta
from collections import defaultdict

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Budget Tracker API", version="1.0.0")

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "https://budgetapp-fusi.onrender.com",
        "https://budget-tracker-app-n12a.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------------
app.mount("/css", StaticFiles(directory="frontend/css"), name="css")
app.mount("/js", StaticFiles(directory="frontend/js"), name="js")

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(upload.router,        prefix="/api", tags=["upload"])
app.include_router(transactions.router,  prefix="/api", tags=["transactions"])
app.include_router(categories.router,    prefix="/api", tags=["categories"])
app.include_router(budget.router,        prefix="/api", tags=["budget"])

# ---------------------------------------------------------------------------
# Startup: eagerly validate env vars so the app fails fast on bad config
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup():
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
        # Groq is non-critical — app still works without AI categorisation
        logger.warning(f"Groq service unavailable (categorisation disabled): {e}")

# ---------------------------------------------------------------------------
# Config endpoint (exposes public Supabase keys to the frontend)
# ---------------------------------------------------------------------------
@app.get("/api/config")
@app.head("/api/config")
async def get_config():
    return {
        "supabase_url": os.environ.get("SUPABASE_URL"),
        "supabase_key": os.environ.get("SUPABASE_ANON_KEY"),
    }

# ---------------------------------------------------------------------------
# Frontend page routes
# ---------------------------------------------------------------------------
@app.api_route("/", methods=["GET", "HEAD"])
async def root():
    return FileResponse("frontend/index.html")

@app.api_route("/dashboard", methods=["GET", "HEAD"])
async def dashboard():
    return FileResponse("frontend/dashboard.html")

@app.api_route("/settings", methods=["GET", "HEAD"])
async def settings_page():
    return FileResponse("frontend/settings.html")

@app.api_route("/transactions", methods=["GET", "HEAD"])
async def transactions_page():
    return FileResponse("frontend/transactions.html")


@app.get("/api/insights")
async def get_insights(
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
    groq: GroqService = Depends(get_groq_service),
):
    result = supabase.table("transactions") \
        .select("amount, category, date") \
        .eq("user_id", current_user.id) \
        .execute()

    transactions = result.data or []
    now = datetime.now()
    current_month = now.strftime("%Y-%m")
    prev_month = (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")

    def monthly_totals(month: str) -> dict:
        totals = defaultdict(float)
        for t in transactions:
            if t["date"].startswith(month) and t["amount"] < 0:
                totals[t["category"]] += abs(t["amount"])
        return {k: round(v, 2) for k, v in totals.items()}

    current = monthly_totals(current_month)
    previous = monthly_totals(prev_month)
    insight = groq.get_spending_insights(current, previous or None)
    return {"insight": insight, "current_month": current, "previous_month": previous}


@app.get("/api/budget-suggestions")
async def get_budget_suggestions(
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
    groq: GroqService = Depends(get_groq_service),
    ):
    result = supabase.table("transactions") \
        .select("amount, category, date") \
        .eq("user_id", current_user.id) \
        .execute()

    monthly_category: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for t in (result.data or []):
        if t["amount"] < 0:
            month = t["date"][:7]
            monthly_category[month][t["category"]] += abs(t["amount"])

    if not monthly_category:
        return {"suggestions": {}}

    all_cats = set(cat for m in monthly_category.values() for cat in m)
    averages = {
        cat: round(
            sum(monthly_category[m].get(cat, 0) for m in monthly_category) / len(monthly_category), 2
        )
        for cat in all_cats
    }
    suggestions = groq.suggest_budget_targets(averages)
    return {"suggestions": suggestions, "based_on_months": len(monthly_category)}


@app.post("/api/categorise")
async def categorise_transactions(
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
    groq: GroqService = Depends(get_groq_service),
):
    result = supabase.table("transactions") \
        .select("id, description, category") \
        .eq("user_id", current_user.id) \
        .eq("category", "Uncategorized") \
        .execute()

    uncategorised = result.data or []
    if not uncategorised:
        return {"message": "No uncategorised transactions", "changed": 0}

    _, changed = groq.apply_categories_to_transactions(uncategorised, current_user.id)
    return {"message": f"Categorised {changed} transactions", "changed": changed}
# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}
