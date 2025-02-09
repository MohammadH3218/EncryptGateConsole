import boto3
from jose import jwt
from fastapi import HTTPException
from datetime import datetime, timedelta
import hmac, hashlib, base64, os
import logging

# Cognito configuration from environment variables
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")
JWT_PRIVATE_KEY = os.getenv("JWT_PRIVATE_KEY")
JWT_PUBLIC_KEY = os.getenv("JWT_PUBLIC_KEY")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "RS256")

# Initialize logger and Cognito client
logger = logging.getLogger(__name__)
cognito_client = boto3.client("cognito-idp", region_name=AWS_REGION)

# --- Generate client secret hash ---
def generate_client_secret_hash(username: str) -> str:
    message = username + CLIENT_ID
    secret = CLIENT_SECRET.encode("utf-8")
    return base64.b64encode(hmac.new(secret, message.encode("utf-8"), hashlib.sha256).digest()).decode()

# --- Authenticate user with AWS Cognito ---
def authenticate_user_with_cognito(username: str, password: str):
    logger.info(f"Authenticating user {username} with Cognito")

    try:
        client_secret_hash = generate_client_secret_hash(username)
        response = cognito_client.initiate_auth(
            ClientId=CLIENT_ID,
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={
                "USERNAME": username,
                "PASSWORD": password,
                "SECRET_HASH": client_secret_hash,
            },
        )
        logger.info(f"Cognito response: {response}")

        if "ChallengeName" in response and response["ChallengeName"] == "SOFTWARE_TOKEN_MFA":
            return {"mfa_required": True, "session": response["Session"]}

        return {"authentication_result": response["AuthenticationResult"], "role": "user", "email": username}

    except Exception as e:
        logger.error(f"Error authenticating with Cognito: {e}")
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

# --- Verify MFA code ---
def verify_mfa_code(session: str, code: str):
    try:
        response = cognito_client.respond_to_auth_challenge(
            ClientId=CLIENT_ID,
            ChallengeName="SOFTWARE_TOKEN_MFA",
            Session=session,
            ChallengeResponses={"USERNAME": "username-placeholder", "SOFTWARE_TOKEN_MFA_CODE": code},
        )
        return response["AuthenticationResult"]
    except Exception as e:
        logger.error(f"MFA verification error: {e}")
        raise HTTPException(status_code=500, detail="MFA verification failed")

# --- Confirm user signup ---
def confirm_signup(email: str, temp_password: str, new_password: str):
    try:
        secret_hash = generate_client_secret_hash(email)
        response = cognito_client.respond_to_auth_challenge(
            ClientId=CLIENT_ID,
            ChallengeName="NEW_PASSWORD_REQUIRED",
            ChallengeResponses={
                "USERNAME": email,
                "NEW_PASSWORD": new_password,
                "SECRET_HASH": secret_hash,
            },
        )
        return response.get("AuthenticationResult") is not None
    except Exception as e:
        logger.error(f"Signup confirmation error: {e}")
        raise HTTPException(status_code=400, detail="Signup confirmation failed")
