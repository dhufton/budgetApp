# api/routes/upload.py
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import JSONResponse
from io import BytesIO
from datetime import datetime
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from src.supabase_client import supabase
from src.ingestion.storage import save_uploaded_file, get_all_statement_paths
from src.ingestion.parser import ChaseStatementParser, AmexCSVParser
from api.auth import get_current_user

router = APIRouter()


@router.post("/upload")
async def upload_statement(
        file: UploadFile = File(...),
        user_id: str = Depends(get_current_user)
):
    try:
        # Check if file already exists
        existing_paths = set(get_all_statement_paths(user_id))
        storage_path = f"{user_id}/{file.filename}"

        if storage_path in existing_paths:
            return JSONResponse(
                status_code=409,
                content={"success": False, "message": f"{file.filename} already exists"}
            )

        # Read file content
        content = await file.read()
        file_stream = BytesIO(content)

        # Parse file
        if file.filename.lower().endswith(".pdf"):
            parser = ChaseStatementParser(user_id)
            df = parser.parse(file_stream)
        elif file.filename.lower().endswith(".csv"):
            parser = AmexCSVParser(user_id)
            df = parser.parse(file_stream)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Use PDF or CSV")

        if df.empty:
            raise HTTPException(status_code=400, detail="No transactions found in file")

        # Save to B2
        file_stream.seek(0)
        saved_path = save_uploaded_file(file_stream, user_id)

        # Save metadata to Supabase
        user_row = supabase.table("users").select("id").eq("id", user_id).execute()
        if not user_row:
            supabase.table("users").insert({
                "id": user_id,
                "username": "user",
            }).execute()

        supabase.table("statements").insert({
            "user_id": user_id,
            "storage_key": saved_path,
            "file_name": file.filename,
            "transactions_count": len(df),
            "uploaded_at": datetime.utcnow().isoformat(),
        }).execute()

        return {
            "success": True,
            "message": f"Uploaded {file.filename}",
            "transactions": len(df),
            "storage_path": saved_path
        }
    except Exception as e:
        print(f"Upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
