# api/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from api.routes import transactions, upload, categories, budget

app = FastAPI(title="Budget Tracker API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/css", StaticFiles(directory="frontend/css"), name="css")
app.mount("/js", StaticFiles(directory="frontend/js"), name="js")

app.include_router(upload.router, prefix="/api", tags=["upload"])
app.include_router(transactions.router, prefix="/api", tags=["transactions"])
app.include_router(categories.router, prefix="/api", tags=["categories"])
app.include_router(budget.router, prefix="/api", tags=["budget"])


@app.get("/api/config")
@app.head("/api/config")
async def get_config():
    """Expose public Supabase config to frontend"""
    return {
        "supabase_url": os.environ.get("SUPABASE_URL"),
        "supabase_key": os.environ.get("SUPABASE_ANON_KEY")
    }


@app.api_route("/", methods=["GET", "HEAD"])
async def root():
    return FileResponse("frontend/index.html")


@app.api_route("/dashboard", methods=["GET", "HEAD"])
async def dashboard():
    return FileResponse("frontend/dashboard.html")


@app.api_route("/settings", methods=["GET", "HEAD"])
async def settings():
    return FileResponse("frontend/settings.html")


@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}
