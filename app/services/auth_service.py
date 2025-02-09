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

# Initialize the Cognito client
cognito_client = boto3.client("cognito-idp", region_name=AWS_REGION)

# Generate client secret hash
def generate_client_secret_hash(username: str) -> str:
    message = username + CLIENT_ID
    secret = CLIENT_SECRET.encode("utf-8")
    return base64.b64encode(hmac.new(secret, message.encode("utf-8"), hashlib.sha256).digest()).decode()

# Authenticate user with AWS Cognito
def authenticate_user_with_cognito(username: str, password: str):
    logging.info(f"Authenticating user {username} with Cognito")
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
        logging.info(f"Cognito response: {response}")

        if "ChallengeName" in response and response["ChallengeName"] == "SOFTWARE_TOKEN_MFA":
            logging.info("MFA challenge triggered")
            return {"mfa_required": True, "session": response["Session"], "email": username, "role": "user"}  # Added email and role

        authentication_result = response.get("AuthenticationResult")
        if authentication_result:
            return {
                "mfa_required": False,
                "authentication_result": authentication_result,
                "email": username,
                "role": "user",
            }
        else:  # Handle missing AuthenticationResult
            logging.error("Authentication failed: AuthenticationResult missing")
            raise HTTPException(status_code=401, detail="Authentication failed: Check credentials")

    except Exception as e:
        logging.error(f"Error authenticating with Cognito: {e}")
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")


# Generate JWT access token
def create_access_token(data: dict, expires_delta: timedelta = timedelta(minutes=30)):
    payload = data.copy()
    payload.update({"exp": datetime.utcnow() + expires_delta})
    return jwt.encode(payload, JWT_PRIVATE_KEY, algorithm=JWT_ALGORITHM)

# Verify JWT access token
def verify_access_token(token: str):
    try:
        payload = jwt.decode(token, JWT_PUBLIC_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.JWTError as e:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

# Complete the MFA challenge
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
        raise HTTPException(status_code=500, detail=f"MFA verification error: {str(e)}")

# Confirm user signup
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
        raise HTTPException(status_code=400, detail=f"Signup confirmation failed: {str(e)}")