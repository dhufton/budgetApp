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
from fastapi import FastAPI, Depends, HTTPException
from api.auth import get_current_user
from supabase import Client
from api.groq_service import GroqService
from api.routes.categories import apply_user_keywords
from datetime import datetime, timedelta
from collections import defaultdict

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Budget Tracker API", version="1.0.0")

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

app.mount("/css", StaticFiles(directory="frontend/css"), name="css")
app.mount("/js",  StaticFiles(directory="frontend/js"),  name="js")

app.include_router(upload.router,       prefix="/api", tags=["upload"])
app.include_router(transactions.router, prefix="/api", tags=["transactions"])
app.include_router(categories.router,   prefix="/api", tags=["categories"])
app.include_router(budget.router,       prefix="/api", tags=["budget"])


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
        logger.warning(f"Groq service unavailable - categorisation disabled: {e}")


@app.get("/api/config")
@app.head("/api/config")
async def get_config():
    return {
        "supabase_url": os.environ.get("SUPABASE_URL"),
        "supabase_key": os.environ.get("SUPABASE_ANON_KEY"),
    }


@app.api_route("/",             methods=["GET", "HEAD"])
async def root():             return FileResponse("frontend/index.html")

@app.api_route("/dashboard",    methods=["GET", "HEAD"])
async def dashboard():        return FileResponse("frontend/dashboard.html")

@app.api_route("/settings",     methods=["GET", "HEAD"])
async def settings_page():    return FileResponse("frontend/settings.html")

@app.api_route("/transactions", methods=["GET", "HEAD"])
async def transactions_page(): return FileResponse("frontend/transactions.html")


@app.get("/api/insights")
async def get_insights(
    current_user: str = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
    groq: GroqService = Depends(get_groq_service),
):
    try:
        result = (
            supabase.table("transactions")
            .select("amount, category, date")
            .eq("user_id", current_user)
            .execute()
        )
        txns = result.data or []
        now = datetime.now()
        current_month = now.strftime("%Y-%m")
        prev_month = (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")

        def monthly_totals(month: str) -> dict:
            totals: dict = defaultdict(float)
            for t in txns:
                if t["date"].startswith(month) and t["amount"] < 0:
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
):
    result = (
        supabase.table("transactions")
        .select("amount, category, date")
        .eq("user_id", current_user)
        .execute()
    )
    monthly_category: dict = defaultdict(lambda: defaultdict(float))
    for t in result.data or []:
        if t["amount"] < 0:
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
):
    result = (
        supabase.table("transactions")
        .select("id, description, category")
        .eq("user_id", current_user)
        .eq("category", "Uncategorized")
        .execute()
    )
    uncategorised = result.data or []
    if not uncategorised:
        return {"message": "No uncategorised transactions", "changed": 0}

    # Apply user-defined keywords first before hitting Groq
    uncategorised = apply_user_keywords(uncategorised, current_user)

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
    return {"status": "healthy", "version": "1.0.0"}
