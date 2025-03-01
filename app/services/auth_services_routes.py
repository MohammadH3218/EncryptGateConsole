import boto3
from jose import jwt
import hmac
import hashlib
import base64
import logging
import os
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, make_response
from dotenv import load_dotenv
import pyotp
import qrcode
from io import BytesIO
from base64 import b64encode

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

load_dotenv()

AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")
JWT_PRIVATE_KEY = os.getenv("JWT_PRIVATE_KEY")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "RS256")

cognito_client = boto3.client("cognito-idp", region_name=AWS_REGION)
auth_services_routes = Blueprint('auth_services_routes', __name__)


def generate_client_secret_hash(username: str) -> str:
    message = username + CLIENT_ID
    secret = CLIENT_SECRET.encode("utf-8")
    hash_result = base64.b64encode(hmac.new(secret, message.encode("utf-8"), hashlib.sha256).digest()).decode()
    return hash_result


def handle_cors_preflight():
    response = make_response()
    response.headers.add("Access-Control-Allow-Origin", request.headers.get("Origin", "*"))
    response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
    response.headers.add("Access-Control-Allow-Headers", "Content-Type")
    return response, 204


@auth_services_routes.route("/authenticate", methods=["OPTIONS", "POST"])
def authenticate_user():
    if request.method == "OPTIONS":
        return handle_cors_preflight()

    data = request.json
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"detail": "Username and password are required"}), 400

    try:
        response = cognito_client.initiate_auth(
            ClientId=CLIENT_ID,
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={
                "USERNAME": username,
                "PASSWORD": password,
                "SECRET_HASH": generate_client_secret_hash(username),
            },
        )

        challenge_name = response.get("ChallengeName")
        session = response.get("Session")
        
        if challenge_name == "NEW_PASSWORD_REQUIRED":
            return jsonify({"new_password_required": True, "session": session})

        if challenge_name == "SOFTWARE_TOKEN_MFA":
            return jsonify({"mfa_required": True, "session": session})

        auth_result = response.get("AuthenticationResult")
        return jsonify({
            "id_token": auth_result.get("IdToken"),
            "access_token": auth_result.get("AccessToken"),
            "refresh_token": auth_result.get("RefreshToken"),
            "token_type": auth_result.get("TokenType"),
            "expires_in": auth_result.get("ExpiresIn"),
        })

    except cognito_client.exceptions.NotAuthorizedException:
        return jsonify({"detail": "Invalid username or password."}), 401
    except Exception as e:
        logger.error(f"Error during authentication: {e}")
        return jsonify({"detail": "Authentication failed"}), 500


@auth_services_routes.route("/change-password", methods=["OPTIONS", "POST"])
def change_password():
    if request.method == "OPTIONS":
        return handle_cors_preflight()

    data = request.json
    session = data.get('session')
    new_password = data.get('new_password')
    username = data.get('username')

    if not session or not new_password:
        return jsonify({"detail": "Session and new password are required"}), 400

    try:
        response = cognito_client.respond_to_auth_challenge(
            ClientId=CLIENT_ID,
            ChallengeName="NEW_PASSWORD_REQUIRED",
            Session=session,
            ChallengeResponses={
                "USERNAME": username,
                "NEW_PASSWORD": new_password,
                "SECRET_HASH": generate_client_secret_hash(username),
            },
        )

        if response.get("ChallengeName") == "MFA_SETUP":
            return jsonify({"message": "MFA setup required", "session": response["Session"]})

        return jsonify({"message": "Password changed successfully"})

    except Exception as e:
        return jsonify({"detail": "Password change failed"}), 500


@auth_services_routes.route("/mfa-setup-details", methods=["OPTIONS", "GET"])
def get_mfa_setup_details():
    if request.method == "OPTIONS":
        return handle_cors_preflight()

    username = request.args.get('username', 'user@example.com')
    secret = pyotp.random_base32()
    issuer = "EncryptGate"
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
    })


@auth_services_routes.route("/verify-mfa", methods=["OPTIONS", "POST"])
def verify_mfa():
    if request.method == "OPTIONS":
        return handle_cors_preflight()

    data = request.json
    session = data.get('session')
    code = data.get('code')
    username = data.get('username')

    if not (session and code):
        return jsonify({"detail": "Session and code are required"}), 400

    try:
        response = cognito_client.respond_to_auth_challenge(
            ClientId=CLIENT_ID,
            ChallengeName="SOFTWARE_TOKEN_MFA",
            Session=session,
            ChallengeResponses={
                "USERNAME": username,
                "SOFTWARE_TOKEN_MFA_CODE": code,
                "SECRET_HASH": generate_client_secret_hash(username),
            },
        )

        return jsonify({"token": response.get("AuthenticationResult", {}).get("IdToken")})

    except cognito_client.exceptions.CodeMismatchException:
        return jsonify({"detail": "Invalid code"}), 401
    except Exception as e:
        logger.error(f"MFA verification failed: {e}")
        return jsonify({"detail": "MFA verification failed"}), 401
