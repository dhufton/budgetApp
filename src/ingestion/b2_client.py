# src/ingestion/b2client.py
import os
import io
import boto3
from typing import List, Optional

def _get_b2_config():
    endpoint  = os.environ.get('B2_ENDPOINT_URL')
    key_id    = os.environ.get('B2_KEY_ID')
    app_key   = os.environ.get('B2_APP_KEY')
    bucket    = os.environ.get('B2_BUCKET_NAME')
    missing = [k for k, v in {
        'B2_ENDPOINT_URL': endpoint,
        'B2_KEY_ID': key_id,
        'B2_APP_KEY': app_key,
        'B2_BUCKET_NAME': bucket,
    }.items() if not v]
    if missing:
        raise ValueError(f"Missing B2 environment variables: {', '.join(missing)}")
    return endpoint, key_id, app_key, bucket

def get_b2_client():
    endpoint, key_id, app_key, _ = _get_b2_config()
    return boto3.client(
        's3',
        endpoint_url=endpoint,
        aws_access_key_id=key_id,
        aws_secret_access_key=app_key,
        region_name='us-west-004',
    )

def get_bucket_name() -> str:
    _, _, _, bucket = _get_b2_config()
    return bucket

def upload_file_to_b2(storage_key: str, file: bytes, content_type: str = 'application/pdf') -> dict:
    s3 = get_b2_client()
    bucket = get_bucket_name()
    s3.put_object(Bucket=bucket, Key=storage_key, Body=file, ContentType=content_type)
    return {'storage_key': storage_key, 'bucket': bucket, 'size': len(file)}

def download_file_from_b2(storage_key: str) -> bytes:
    s3 = get_b2_client()
    obj = s3.get_object(Bucket=get_bucket_name(), Key=storage_key)
    return obj['Body'].read()

def list_files_in_b2(prefix: str) -> List[dict]:
    s3 = get_b2_client()
    response = s3.list_objects_v2(Bucket=get_bucket_name(), Prefix=prefix)
    files = []
    if 'Contents' in response:
        for obj in response['Contents']:
            files.append({
                'fileName': obj['Key'],
                'size': obj['Size'],
                'lastModified': obj['LastModified'].isoformat(),
            })
    return files

def delete_file_from_b2(storage_key: str):
    s3 = get_b2_client()
    s3.delete_object(Bucket=get_bucket_name(), Key=storage_key)

def read_csv_from_b2(storage_key: str):
    import pandas as pd
    content = download_file_from_b2(storage_key)
    return pd.read_csv(io.BytesIO(content))

# Aliases used by storage.py
upload_statement   = upload_file_to_b2
download_statement = download_file_from_b2
delete_statement   = delete_file_from_b2
read_statement_csv = read_csv_from_b2
