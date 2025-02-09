from flask import request, jsonify
from jose import jwt, JWTError
import boto3, os

# Cognito configuration
COGNITO_REGION = os.getenv("AWS_REGION", "us-east-1")
USER_POOL_ID = os.getenv("USER_POOL_ID")
JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = "HS256"

cognito_client = boto3.client("cognito-idp", region_name=COGNITO_REGION)


def get_jwt_public_keys():
    try:
        response = cognito_client.get_signing_certificate(UserPoolId=USER_POOL_ID)
        return response["certificate"]
    except Exception as e:
        raise Exception("Failed to retrieve Cognito public key")


def decode_jwt_token(token: str):
    try:
        public_key = get_jwt_public_keys()
        return jwt.decode(token, public_key, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise Exception("Invalid or expired token")


def get_current_user():
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        return jsonify({"detail": "Authorization token is missing"}), 401

    payload = decode_jwt_token(token)
    return payload.get("sub"), payload.get("role")
