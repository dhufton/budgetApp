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

app.mount("/static", StaticFiles(directory="frontend"), name="static")

app.include_router(upload.router, prefix="/api", tags=["upload"])
app.include_router(transactions.router, prefix="/api", tags=["transactions"])
app.include_router(categories.router, prefix="/api", tags=["categories"])
app.include_router(budget.router, prefix="/api", tags=["budget"])


@app.get("/")
async def root():
    return FileResponse("frontend/index.html")


@app.get("/dashboard")
async def dashboard():
    return FileResponse("frontend/dashboard.html")


@app.get("/settings")
async def settings():
    return FileResponse("frontend/settings.html")


@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}
