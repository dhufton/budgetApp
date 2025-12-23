# src/ingestion/b2_client.py
import os
import io
import pandas as pd
import boto3
from typing import List, Optional
from dotenv import load_dotenv

load_dotenv()

B2_ENDPOINT_URL = os.environ.get("B2_ENDPOINT_URL")
B2_ACCESS_KEY_ID = os.environ.get("B2_ACCESS_KEY_ID")
B2_SECRET_ACCESS_KEY = os.environ.get("B2_SECRET_ACCESS_KEY")
B2_BUCKET_NAME = os.environ.get("B2_BUCKET_NAME")

if not all([B2_ENDPOINT_URL, B2_ACCESS_KEY_ID, B2_SECRET_ACCESS_KEY, B2_BUCKET_NAME]):
    raise ValueError("Missing B2 credentials in environment variables")


def get_b2_client():
    return boto3.client(
        "s3",
        endpoint_url=B2_ENDPOINT_URL,
        aws_access_key_id=B2_ACCESS_KEY_ID,
        aws_secret_access_key=B2_SECRET_ACCESS_KEY,
        region_name="us-west-000",
    )


def get_bucket_name():
    return B2_BUCKET_NAME


def upload_file_to_b2(storage_key: str, file_bytes, content_type: str = "application/pdf") -> dict:
    s3 = get_b2_client()
    bucket = get_bucket_name()

    s3.put_object(
        Bucket=bucket,
        Key=storage_key,
        Body=file_bytes,
        ContentType=content_type,
    )

    return {
        "storage_key": storage_key,
        "bucket": bucket,
        "size": len(file_bytes)
    }


def download_file_from_b2(storage_key: str) -> bytes:
    s3 = get_b2_client()
    bucket = get_bucket_name()

    obj = s3.get_object(Bucket=bucket, Key=storage_key)
    return obj["Body"].read()


def list_files_in_b2(prefix: str = "") -> List[dict]:
    s3 = get_b2_client()
    bucket = get_bucket_name()

    response = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)

    files = []
    if "Contents" in response:
        for obj in response["Contents"]:
            files.append({
                "fileName": obj["Key"],
                "size": obj["Size"],
                "lastModified": obj["LastModified"].isoformat(),
            })

    return files


def delete_file_from_b2(storage_key: str):
    s3 = get_b2_client()
    bucket = get_bucket_name()
    s3.delete_object(Bucket=bucket, Key=storage_key)


def read_csv_from_b2(storage_key: str) -> pd.DataFrame:
    content = download_file_from_b2(storage_key)
    return pd.read_csv(io.BytesIO(content))


upload_statement = upload_file_to_b2
download_statement = download_file_from_b2
delete_statement = delete_file_from_b2
read_statement_csv = read_csv_from_b2
