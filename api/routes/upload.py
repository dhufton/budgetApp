# api/routes/upload.py
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import JSONResponse
from io import BytesIO
from datetime import datetime
import sys
import os
import traceback
import logging

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from src.supabase_client import supabase_admin
from src.ingestion.storage import save_uploaded_file, get_all_statement_paths
from src.ingestion.parser import ChaseStatementParser, AmexCSVParser
from api.auth import get_current_user
from api.dependencies import get_groq_service
from groq_service import GroqService

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/upload")
async def upload_statement(
        file: UploadFile = File(...),
        user_id: str = Depends(get_current_user),
        groq: GroqService = Depends(get_groq_service),
):
    try:
        logger.info(f"[UPLOAD] user={user_id}, filename={file.filename}")

        existing_paths = set(get_all_statement_paths(user_id))
        storage_path = f"{user_id}/{file.filename}"

        if storage_path in existing_paths:
            logger.info(f"[UPLOAD] duplicate file {storage_path}")
            return JSONResponse(
                status_code=409,
                content={"success": False, "message": f"{file.filename} already exists"},
            )

        content = await file.read()
        file_stream = BytesIO(content)

        # Parse
        if file.filename.lower().endswith(".pdf"):
            parser = ChaseStatementParser(user_id)
            df = parser.parse(file_stream)
        elif file.filename.lower().endswith(".csv"):
            parser = AmexCSVParser(user_id)
            df = parser.parse(file_stream)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Use PDF or CSV")

        logger.info(f"[UPLOAD] parsed {len(df)} rows")

        if df.empty:
            raise HTTPException(status_code=400, detail="No transactions found in file")

        # Save to storage
        file_stream.seek(0)
        file_stream.filename = file.filename
        saved_path = save_uploaded_file(file_stream, user_id)

        # Ensure user row exists
        user_row = supabase_admin.table("users").select("id").eq("id", user_id).execute()
        if not user_row:
            supabase_admin.table("users").insert({"id": user_id, "username": "user"}).execute()

        # Insert statement metadata
        statement_result = supabase_admin.table("statements").insert({
                "user_id": user_id,
                "storage_key": saved_path,
                "file_name": file.filename,
                "uploaded_at": datetime.utcnow().isoformat(),
        }).execute()

        statement_id = statement_result.data[0]["id"] if statement_result.data else None

        # Build transactions list
        transactions_to_insert = []
        for _, row in df.iterrows():
            transactions_to_insert.append({
                "user_id": user_id,
                "statement_id": statement_id,
                "date": row["Date"].strftime('%Y-%m-%d') if hasattr(row["Date"], 'strftime') else str(row["Date"]),
                "description": str(row["Description"]),
                "amount": float(row["Amount"]),
                "category": "Uncategorized",
            })

        # Insert and capture returned rows (with their new IDs)
        categorised_count = 0
        if transactions_to_insert:
            insert_result = supabase_admin.table("transactions") \
                .insert(transactions_to_insert) \
                .execute()

            saved_transactions = insert_result.data or []
            logger.info(f"[UPLOAD] inserted {len(saved_transactions)} transactions")

            # Categorise via Groq — passes saved rows which include 'id' fields
            if saved_transactions:
                _, categorised_count = groq.apply_categories_to_transactions(
                    saved_transactions, user_id
                )
                logger.info(f"[UPLOAD] Groq categorised {categorised_count} transactions")

        return {
            "success": True,
            "message": f"Uploaded {file.filename}",
            "transactions": len(df),
            "categorised": categorised_count,
            "storage_path": saved_path,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[UPLOAD] ERROR: {repr(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
