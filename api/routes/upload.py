# api/routes/upload.py
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import JSONResponse
from io import BytesIO
from datetime import datetime
import sys
import os
import traceback

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
        print(f"[UPLOAD] user={user_id}, filename={file.filename}")

        existing_paths = set(get_all_statement_paths(user_id))
        storage_path = f"{user_id}/{file.filename}"
        print(f"[UPLOAD] computed storage_path={storage_path}")

        if storage_path in existing_paths:
            print(f"[UPLOAD] duplicate file {storage_path}")
            return JSONResponse(
                status_code=409,
                content={"success": False, "message": f"{file.filename} already exists"},
            )

        content = await file.read()
        print(f"[UPLOAD] read {len(content)} bytes")

        file_stream = BytesIO(content)

        # Parse
        if file.filename.lower().endswith(".pdf"):
            print("[UPLOAD] using ChaseStatementParser (PDF)")
            parser = ChaseStatementParser(user_id)
            df = parser.parse(file_stream)
        elif file.filename.lower().endswith(".csv"):
            print("[UPLOAD] using AmexCSVParser (CSV)")
            parser = AmexCSVParser(user_id)
            df = parser.parse(file_stream)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Use PDF or CSV")

        print(f"[UPLOAD] parsed {len(df)} rows")

        if df.empty:
            raise HTTPException(status_code=400, detail="No transactions found in file")

        # Save to storage - add filename attribute
        file_stream.seek(0)
        file_stream.filename = file.filename
        saved_path = save_uploaded_file(file_stream, user_id)
        print(f"[UPLOAD] saved to storage at {saved_path}")

        # Ensure user row exists
        user_row = supabase.table("users").select("id").eq("id", user_id).execute()
        if not user_row:
            print(f"[UPLOAD] inserting new user record {user_id}")
            supabase.table("users").insert(
                {"id": user_id, "username": "user"}
            ).execute()

        # Insert statement metadata (without transactions_count)
        supabase.table("statements").insert(
            {
                "user_id": user_id,
                "storage_key": saved_path,
                "file_name": file.filename,
                "uploaded_at": datetime.utcnow().isoformat(),
            }
        ).execute()

        print("[UPLOAD] completed successfully")

        return {
            "success": True,
            "message": f"Uploaded {file.filename}",
            "transactions": len(df),
            "storage_path": saved_path,
        }
    except HTTPException:
        raise
    except Exception as e:
        print("[UPLOAD] ERROR:", repr(e))
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
