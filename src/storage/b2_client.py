import boto3
import streamlit as st
import io
import pandas as pd


def get_b2_client():
    """Returns boto3 S3 client configured for Backblaze B2."""
    b2_conf = st.secrets["b2"]
    return boto3.client(
        "s3",
        endpoint_url=b2_conf["endpoint_url"],
        aws_access_key_id=b2_conf["access_key_id"],
        aws_secret_access_key=b2_conf["secret_access_key"],
        region_name="us-west-000",  # B2 always uses this
    )


def get_bucket_name():
    """Returns B2 bucket name from secrets."""
    return st.secrets["b2"]["bucket_name"]


def upload_statement(storage_key: str, file_bytes: bytes, content_type: str = "text/csv") -> str:
    """Uploads file bytes to B2, returns storage_key."""
    s3 = get_b2_client()
    bucket = get_bucket_name()

    s3.put_object(
        Bucket=bucket,
        Key=storage_key,
        Body=file_bytes,
        ContentType=content_type,
    )
    return storage_key


def download_statement(storage_key: str) -> bytes:
    """Downloads raw bytes from B2 storage_key."""
    s3 = get_b2_client()
    bucket = get_bucket_name()

    obj = s3.get_object(Bucket=bucket, Key=storage_key)
    return obj["Body"].read()


def read_statement_csv(storage_key: str) -> pd.DataFrame:
    """Downloads CSV from B2 and returns as pandas DataFrame."""
    content = download_statement(storage_key)
    return pd.read_csv(io.BytesIO(content))


def delete_statement(storage_key: str):
    """Deletes file from B2 storage_key."""
    s3 = get_b2_client()
    bucket = get_bucket_name()

    s3.delete_object(Bucket=bucket, Key=storage_key)
