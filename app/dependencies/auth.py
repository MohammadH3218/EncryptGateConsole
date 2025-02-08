from fastapi import Depends, HTTPException, Request
from jose import jwt, JWTError
from pydantic import BaseModel
import boto3
import os

# Environment-based configuration for JWT
COGNITO_REGION = os.getenv("AWS_REGION", "your-aws-region")
USER_POOL_ID = os.getenv("USER_POOL_ID", "your-user-pool-id")
JWT_SECRET = os.getenv("JWT_SECRET", "your-secure-jwt-secret")
JWT_ALGORITHM = "HS256"

# Initialize AWS Cognito client
cognito_client = boto3.client("cognito-idp", region_name=COGNITO_REGION)

# User data model for request context
class User(BaseModel):
    email: str
    role: str


def get_jwt_public_keys():
    """Fetches and caches AWS Cognito public keys."""
    try:
        response = cognito_client.get_signing_certificate(UserPoolId=USER_POOL_ID)
        return response["certificate"]
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to retrieve Cognito public key")


def decode_jwt_token(token: str):
    """Decodes the JWT token using AWS Cognito's public key."""
    try:
        public_key = get_jwt_public_keys()
        return jwt.decode(token, public_key, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_current_user(request: Request) -> User:
    """Extracts and verifies the JWT token from the request headers."""
    token = request.headers.get("Authorization", "").replace("Bearer ", "")

    if not token:
        raise HTTPException(status_code=401, detail="Authorization token is missing")

    payload = decode_jwt_token(token)
    email: str = payload.get("sub")
    role: str = payload.get("role")

    if not email or not role:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    return User(email=email, role=role)


def require_role(required_role: str):
    """Dependency to enforce role-based access control on routes."""
    def role_checker(user: User = Depends(get_current_user)):
        if user.role != required_role:
            raise HTTPException(status_code=403, detail="You do not have access to this resource")
        return user

    return role_checker
