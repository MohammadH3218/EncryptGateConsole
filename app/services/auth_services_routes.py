import boto3
from jose import jwt
import hmac
import hashlib
import base64
import logging
import os
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from dotenv import load_dotenv
import pyotp
import qrcode
from io import BytesIO
from base64 import b64encode

# Initialize logger
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Load environment variables from the .env file
load_dotenv()

# Environment-based configuration
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")
JWT_PRIVATE_KEY = os.getenv("JWT_PRIVATE_KEY")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "RS256")
USER_POOL_ID = os.getenv("USER_POOL_ID")

# Initialize AWS Cognito client
cognito_client = boto3.client("cognito-idp", region_name=AWS_REGION)

# Define blueprint
auth_services_routes = Blueprint('auth_services_routes', __name__)

# --- Utility Functions ---
def generate_client_secret_hash(username: str) -> str:
    """Generate client secret hash for AWS Cognito."""
    message = username + CLIENT_ID
    secret = CLIENT_SECRET.encode("utf-8")
    return base64.b64encode(hmac.new(secret, message.encode("utf-8"), hashlib.sha256).digest()).decode()

def create_access_token(data: dict, expires_delta: timedelta = timedelta(minutes=30)) -> str:
    """Generate JWT access token."""
    payload = data.copy()
    payload.update({"exp": datetime.utcnow() + expires_delta})
    return jwt.encode(payload, JWT_PRIVATE_KEY, algorithm=JWT_ALGORITHM)

# --- Routes ---
@auth_services_routes.route("/authenticate", methods=["POST"])
def authenticate_user_with_cognito():
    """Authenticate user with AWS Cognito."""
    data = request.json
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"detail": "Username and password are required"}), 400

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

        if response.get("ChallengeName") == "NEW_PASSWORD_REQUIRED":
            return jsonify({"new_password_required": True, "session": response["Session"]})

        if response.get("ChallengeName") == "SOFTWARE_TOKEN_MFA":
            return jsonify({"mfa_required": True, "session": response["Session"]})

        authentication_result = response.get("AuthenticationResult")
        if not authentication_result:
            return jsonify({"detail": "Authentication failed"}), 401

        return jsonify({"authentication_result": authentication_result})

    except cognito_client.exceptions.NotAuthorizedException:
        return jsonify({"detail": "Invalid username or password."}), 401
    except Exception as e:
        logger.error(f"Error during authentication: {e}")
        return jsonify({"detail": "Authentication failed"}), 500


@auth_services_routes.route("/change-password", methods=["POST"])
def change_password():
    """Change password for a user if required."""
    data = request.json
    session = data.get('session')
    new_password = data.get('new_password')
    username = data.get('username')

    if not session or not new_password:
        return jsonify({"detail": "Session and new password are required"}), 400

    try:
        client_secret_hash = generate_client_secret_hash(username)
        response = cognito_client.respond_to_auth_challenge(
            ClientId=CLIENT_ID,
            ChallengeName="NEW_PASSWORD_REQUIRED",
            Session=session,
            ChallengeResponses={
                "USERNAME": username,
                "NEW_PASSWORD": new_password,
                "SECRET_HASH": client_secret_hash,
            },
        )

        if response.get("ChallengeName") == "MFA_SETUP":
            cognito_client.admin_set_user_password(
                UserPoolId=USER_POOL_ID,
                Username=username,
                Password=new_password,
                Permanent=False
            )
            return jsonify({
                "message": "MFA setup required. Password change is not permanent until setup is complete.",
                "session": response["Session"]
            })

        authentication_result = response.get("AuthenticationResult")
        if not authentication_result:
            return jsonify({"detail": "Password change failed"}), 500

        return jsonify({
            "message": "Password changed successfully",
            "token": authentication_result["IdToken"]
        })

    except Exception as e:
        logger.error(f"Password change failed: {e}")
        return jsonify({"detail": "Password change failed"}), 500


@auth_services_routes.route("/verify-mfa", methods=["POST"])
def verify_mfa():
    """Verify MFA code with AWS Cognito."""
    data = request.json
    session = data.get('session')
    code = data.get('code')
    username = data.get('username')

    if not (session and code):
        return jsonify({"detail": "Session and code are required"}), 400

    try:
        client_secret_hash = generate_client_secret_hash(username)
        response = cognito_client.respond_to_auth_challenge(
            ClientId=CLIENT_ID,
            ChallengeName="SOFTWARE_TOKEN_MFA",
            Session=session,
            ChallengeResponses={
                "USERNAME": username,
                "SOFTWARE_TOKEN_MFA_CODE": code,
                "SECRET_HASH": client_secret_hash,
            },
        )

        authentication_result = response.get("AuthenticationResult")
        if not authentication_result:
            return jsonify({"detail": "MFA verification failed"}), 401

        return jsonify({"token": authentication_result["IdToken"]})

    except Exception as e:
        logger.error(f"MFA verification failed: {e}")
        return jsonify({"detail": "MFA verification failed"}), 401


@auth_services_routes.route("/mfa-setup-details", methods=["GET"])
def get_mfa_setup_details():
    """Generate and return MFA setup details including a secret and QR code."""
    secret = pyotp.random_base32()
    issuer = "EncryptGate"
    username = request.args.get('username', 'user@example.com')
    otpauth_url = pyotp.totp.TOTP(secret).provisioning_uri(name=username, issuer_name=issuer)

    qr = qrcode.make(otpauth_url)
    buffer = BytesIO()
    qr.save(buffer, format="PNG")
    buffer.seek(0)
    qr_code_base64 = b64encode(buffer.getvalue()).decode()

    return jsonify({
        "mfa_secret": secret,
        "otpauth_url": otpauth_url,
        "qr_code_base64": qr_code_base64,
        "session_message": "Use the following session in the next step if needed."
    })
