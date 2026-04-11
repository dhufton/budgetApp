# api/routes/upload.py
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form
from fastapi.responses import JSONResponse
from io import BytesIO
from datetime import datetime
import sys, os, traceback, logging

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../../'))

from src.supabase_client import supabase_admin
from src.ingestion.storage import save_uploaded_file, get_all_statement_paths
from src.ingestion.parser import ChaseStatementParser, AmexCSVParser
from api.auth import get_current_user
from api.dependencies import get_groq_service
from api.groq_service import GroqService
from api.routes.categories import apply_user_keywords
from api.transfer_rules import apply_transfer_classification
from api.review_service import get_or_create_review

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/upload")
async def upload_statement(
    file: UploadFile = File(...),
    account_id: str = Form(...),
    user_id: str = Depends(get_current_user),
    groq: GroqService = Depends(get_groq_service),
):
    try:
        logger.info(f"[UPLOAD] user={user_id}, filename={file.filename}")
        account_check = (
            supabase_admin.table("accounts")
            .select("id")
            .eq("id", account_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not account_check.data:
            raise HTTPException(status_code=400, detail="Invalid account")

        filename = (file.filename or "").strip()
        if not filename:
            raise HTTPException(status_code=400, detail="Filename missing")

        # Duplicate check scoped to user + account + filename.
        existing_statement = (
            supabase_admin.table("statements")
            .select("id")
            .eq("user_id", user_id)
            .eq("account_id", account_id)
            .eq("filename", filename)
            .limit(1)
            .execute()
        )
        if existing_statement.data:
            logger.info(f"[UPLOAD] duplicate statement user={user_id} account={account_id} filename={filename}")
            return JSONResponse(
                status_code=409,
                content={"success": False, "message": f"{filename} already exists for this account"},
            )

        # Backward-compatible storage-path duplicate check as fallback.
        existing_paths = set(get_all_statement_paths(user_id))
        storage_path = f"{user_id}/{account_id}/{filename}"
        if storage_path in existing_paths:
            logger.info(f"[UPLOAD] duplicate: {storage_path}")
            return JSONResponse(
                status_code=409,
                content={"success": False, "message": f"{filename} already exists for this account"},
            )

        content = await file.read()
        file_stream = BytesIO(content)

        # Select parser
        if file.filename.lower().endswith(".pdf"):
            parser = ChaseStatementParser(user_id)
        elif file.filename.lower().endswith(".csv"):
            parser = AmexCSVParser(user_id)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Use PDF or CSV")

        df = parser.parse(file_stream)
        logger.info(f"[UPLOAD] parsed {len(df)} rows")

        if df.empty:
            raise HTTPException(status_code=400, detail="No transactions found in file")

        # Enrich with vendor cache
        descriptions = list(set(df["Description"].astype(str).tolist()))
        vendor_cache = groq.get_cached_categories(descriptions)
        if vendor_cache:
            logger.info(f"[UPLOAD] vendor cache hit for {len(vendor_cache)}/{len(descriptions)} descriptions")
            df["Category"] = df.apply(
                lambda row: vendor_cache.get(str(row["Description"]), row["Category"]),
                axis=1,
            )

        # Save file to storage
        file_stream.seek(0)
        file_stream.name = file.filename
        saved_path = save_uploaded_file(file_stream, user_id, storage_path_override=storage_path)

        # Ensure user row exists
        user_row = supabase_admin.table("users").select("id").eq("id", user_id).execute()
        if not user_row.data:
            supabase_admin.table("users").insert({"id": user_id, "username": "user"}).execute()

        # Insert statement metadata
        statement_result = supabase_admin.table("statements").insert({
            "user_id":     user_id,
            "account_id":  account_id,
            "storage_key": saved_path,
            "filename":    filename,
            "uploaded_at": datetime.utcnow().isoformat(),
        }).execute()
        statement_id = statement_result.data[0]["id"] if statement_result.data else None

        # Build transactions list
        transactions_to_insert = []
        for _, row in df.iterrows():
            transactions_to_insert.append({
                "user_id":      user_id,
                "statement_id": statement_id,
                "account_id":   account_id,
                "date":         row["Date"].strftime("%Y-%m-%d") if hasattr(row["Date"], "strftime") else str(row["Date"]),
                "description":  str(row["Description"]),
                "amount":       float(row["Amount"]),
                "category":     str(row.get("Category", "Uncategorized")),
            })

        # Apply user-defined keywords before Groq
        transactions_to_insert = apply_user_keywords(transactions_to_insert, user_id)
        transactions_to_insert = apply_transfer_classification(transactions_to_insert)

        categorised_count = 0
        created_review = None
        if transactions_to_insert:
            insert_result = supabase_admin.table("transactions").insert(transactions_to_insert).execute()
            saved_transactions = insert_result.data or []
            logger.info(f"[UPLOAD] inserted {len(saved_transactions)} transactions")

            pre_categorised = sum(1 for t in saved_transactions if t.get("category") != "Uncategorized")
            logger.info(f"[UPLOAD] {pre_categorised} pre-categorised from cache/rules/user-keywords")

            still_uncategorized = [t for t in saved_transactions if t.get("category") == "Uncategorized"]
            if still_uncategorized:
                _, groq_count = groq.apply_categories_to_transactions(still_uncategorized, user_id)
                categorised_count = pre_categorised + groq_count
                logger.info(f"[UPLOAD] Groq categorised {groq_count} additional transactions")
            else:
                categorised_count = pre_categorised
                logger.info("[UPLOAD] All transactions categorised - no Groq call needed")

            # Best-effort upload snapshot review generation for this statement period.
            try:
                txn_dates = []
                for txn in transactions_to_insert:
                    txn_date = txn.get("date")
                    if not txn_date:
                        continue
                    parsed = datetime.strptime(str(txn_date), "%Y-%m-%d").date()
                    txn_dates.append(parsed)
                if txn_dates:
                    period_start = min(txn_dates)
                    period_end = max(txn_dates)
                    created_review = get_or_create_review(
                        user_id=user_id,
                        review_type="upload_snapshot",
                        triggered_by="upload",
                        period_start=period_start,
                        period_end=period_end,
                        account_id=account_id,
                        statement_id=statement_id,
                    )
            except Exception as review_error:
                logger.warning(f"[UPLOAD] review generation failed: {review_error!r}")

        return {
            "success":      True,
            "message":      f"Uploaded {filename}",
            "transactions": len(df),
            "categorised":  categorised_count,
            "storage_path": saved_path,
            "review_id": created_review.get("id") if created_review else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[UPLOAD] ERROR: {e!r}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
