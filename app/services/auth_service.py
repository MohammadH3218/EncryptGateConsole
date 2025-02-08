import boto3
from jose import jwt
from fastapi import HTTPException
import hmac, hashlib, base64, os

# Cognito configuration from environment variables
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")
JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "RS256")

# Initialize the Cognito client
cognito_client = boto3.client("cognito-idp", region_name=AWS_REGION)

# Generate client secret hash
def generate_client_secret_hash(username: str) -> str:
    message = username + CLIENT_ID
    secret = CLIENT_SECRET.encode('utf-8')
    return base64.b64encode(hmac.new(secret, message.encode('utf-8'), hashlib.sha256).digest()).decode()

# Authenticate user with AWS Cognito
def authenticate_user_with_cognito(username: str, password: str):
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
        if "ChallengeName" in response and response["ChallengeName"] == "SOFTWARE_TOKEN_MFA":
            return {"mfa_required": True, "session": response["Session"]}
        return {"mfa_required": False, "authentication_result": response["AuthenticationResult"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Authentication service error: {str(e)}")

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
