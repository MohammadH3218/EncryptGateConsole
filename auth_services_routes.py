import boto3
import botocore
from jose import jwt
import hmac
import hashlib
import base64
import logging
import os
import time
import sys
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, make_response
from dotenv import load_dotenv
import pyotp
import qrcode
from io import BytesIO
from base64 import b64encode
import traceback
import json

# Load environment variables
load_dotenv()

# Enhanced Logging Configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create a dedicated debug logger for MFA operations
debug_logger = logging.getLogger('cognito_mfa_debug')
debug_logger.setLevel(logging.DEBUG)
file_handler = logging.FileHandler('/tmp/cognito_mfa_debug.log')
file_handler.setLevel(logging.DEBUG)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
file_handler.setFormatter(formatter)
debug_logger.addHandler(file_handler)
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.DEBUG)
console_handler.setFormatter(formatter)
debug_logger.addHandler(console_handler)

# Create a separate logger for MFA-related logs
mfa_logger = logging.getLogger("mfa_operations")
mfa_logger.setLevel(logging.DEBUG)
mfa_logger.addHandler(file_handler)
mfa_logger.addHandler(console_handler)

# AWS Cognito Configuration
AWS_REGION = os.getenv("REGION", "us-east-1")
USER_POOL_ID = os.getenv("COGNITO_USERPOOL_ID")
CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")
CLIENT_SECRET = os.getenv("COGNITO_CLIENT_SECRET")

try:
    cognito_client = boto3.client("cognito-idp", region_name=AWS_REGION)
    logger.info(f"Successfully initialized Cognito client for region {AWS_REGION}")
except Exception as e:
    logger.error(f"Failed to initialize Cognito client: {e}")
    cognito_client = boto3.client("cognito-idp", region_name="us-east-1")

auth_services_routes = Blueprint('auth_services_routes', __name__)

# Debug middleware: log incoming request data for debugging Postman requests.
@auth_services_routes.before_request
def log_request_info():
    logger.info(f"Request {request.method} {request.url}")
    logger.debug(f"Headers: {dict(request.headers)}")
    if request.get_data():
        logger.debug(f"Body: {request.get_data(as_text=True)}")

# Generate Client Secret Hash – note: this is not the MFA secret.
def generate_client_secret_hash(username: str) -> str:
    try:
        if not CLIENT_ID:
            logger.error("CLIENT_ID is not configured")
            raise ValueError("CLIENT_ID is missing")
        if not CLIENT_SECRET:
            logger.error("CLIENT_SECRET is not configured")
            raise ValueError("CLIENT_SECRET is missing")
        message = username + CLIENT_ID
        secret = CLIENT_SECRET.encode("utf-8")
        hash_obj = hmac.new(secret, message.encode("utf-8"), hashlib.sha256)
        hash_result = base64.b64encode(hash_obj.digest()).decode()
        debug_logger.debug(f"Generated secret hash for {username} with first 10 chars: {hash_result[:10]}...")
        return hash_result
    except Exception as e:
        logger.error(f"Error generating client secret hash: {e}")
        debug_logger.error(f"Secret hash generation failed: {e}\n{traceback.format_exc()}")
        raise

# Function to generate QR code for MFA setup
def generate_qr_code(secret_code, username, issuer="EncryptGate"):
    try:
        totp = pyotp.TOTP(secret_code)
        provisioning_uri = totp.provisioning_uri(name=username, issuer_name=issuer)
        mfa_logger.debug(f"Generated provisioning URI: {provisioning_uri}")
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(provisioning_uri)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buffered = BytesIO()
        img.save(buffered)
        img_str = b64encode(buffered.getvalue()).decode()
        return f"data:image/png;base64,{img_str}"
    except Exception as e:
        logger.error(f"Error generating QR code: {e}")
        debug_logger.error(f"QR code generation failed: {e}\n{traceback.format_exc()}")
        return None

def handle_cors_preflight():
    response = make_response()
    origin = request.headers.get("Origin", "")
    allowed_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net").split(",")
    allowed_origins = [o.strip() for o in allowed_origins]
    if origin in allowed_origins or "*" in allowed_origins:
        response.headers.add("Access-Control-Allow-Origin", origin)
    else:
        response.headers.add("Access-Control-Allow-Origin", allowed_origins[0] if allowed_origins else "*")
    response.headers.add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    response.headers.add("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Origin")
    response.headers.add("Access-Control-Allow-Credentials", "true")
    response.headers.add("Access-Control-Max-Age", "3600")
    return response, 200

@auth_services_routes.route("/authenticate", methods=["OPTIONS", "POST"])
def authenticate_user_route():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    data = request.json
    username = data.get('username')
    password = data.get('password')
    if not username or not password:
        return jsonify({"detail": "Username and password are required"}), 400
    try:
        logger.info(f"Authenticating user: {username}")
        auth_response = cognito_client.initiate_auth(
            ClientId=CLIENT_ID,
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={
                "USERNAME": username,
                "PASSWORD": password,
                "SECRET_HASH": generate_client_secret_hash(username),
            },
        )
        challenge_name = auth_response.get("ChallengeName")
        session = auth_response.get("Session")
        logger.info(f"Authentication response received with challenge: {challenge_name}")
        if challenge_name == "NEW_PASSWORD_REQUIRED":
            return jsonify({"ChallengeName": challenge_name, "session": session})
        if challenge_name == "SOFTWARE_TOKEN_MFA":
            return jsonify({"mfa_required": True, "session": session})
        auth_result = auth_response.get("AuthenticationResult", {})
        return jsonify({
            "access_token": auth_result.get("AccessToken"),
            "id_token": auth_result.get("IdToken"),
            "refresh_token": auth_result.get("RefreshToken"),
            "token_type": auth_result.get("TokenType"),
            "expires_in": auth_result.get("ExpiresIn")
        })
    except cognito_client.exceptions.NotAuthorizedException:
        return jsonify({"detail": "Invalid username or password."}), 401
    except Exception as e:
        logger.error(f"Error during authentication: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": "Authentication failed"}), 500

@auth_services_routes.route("/setup-mfa", methods=["OPTIONS", "POST"])
def setup_mfa_endpoint():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    data = request.json
    access_token = data.get("access_token")
    if not access_token:
        return jsonify({"detail": "Access token is required"}), 400
    try:
        logger.info("Setting up MFA")
        associate_response = cognito_client.associate_software_token(
            AccessToken=access_token
        )
        secret_code = associate_response.get("SecretCode")
        if not secret_code:
            logger.error("No secret code received from Cognito")
            return jsonify({"detail": "Failed to generate MFA secret code"}), 500
        try:
            user_info = cognito_client.get_user(AccessToken=access_token)
            username = user_info.get("Username", "user")
            logger.info(f"Retrieved username: {username}")
        except Exception as e:
            logger.warning(f"Could not get username: {e}")
            username = "user"
        qr_code_image = generate_qr_code(secret_code, username)
        logger.info("Returning MFA setup data with QR code")
        return jsonify({
            "secretCode": secret_code,
            "qrCodeImage": qr_code_image,
            "message": "MFA setup initiated successfully",
            "username": username
        })
    except Exception as e:
        logger.error(f"MFA setup failed: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": f"Failed to setup MFA: {str(e)}"}), 500

@auth_services_routes.route("/verify-mfa", methods=["OPTIONS", "POST"])
def verify_mfa_route():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    data = request.json
    session = data.get("session")
    code = data.get("code")
    username = data.get("username")
    if not (session and code and username):
        return jsonify({"detail": "Session, username, and code are required"}), 400
    try:
        logger.info(f"Verifying MFA for user: {username} with code: {code}")
        secret_hash = generate_client_secret_hash(username)
        response = cognito_client.respond_to_auth_challenge(
            ClientId=CLIENT_ID,
            ChallengeName="SOFTWARE_TOKEN_MFA",
            Session=session,
            ChallengeResponses={
                "USERNAME": username,
                "SOFTWARE_TOKEN_MFA_CODE": code,
                "SECRET_HASH": secret_hash,
            },
        )
        auth_result = response.get("AuthenticationResult", {})
        logger.info("MFA verification successful")
        return jsonify({
            "id_token": auth_result.get("IdToken"),
            "access_token": auth_result.get("AccessToken"),
            "refresh_token": auth_result.get("RefreshToken"),
            "token_type": auth_result.get("TokenType"),
            "expires_in": auth_result.get("ExpiresIn")
        })
    except cognito_client.exceptions.CodeMismatchException:
        logger.warning(f"MFA code mismatch for user: {username}")
        return jsonify({"detail": "Invalid code"}), 401
    except Exception as e:
        logger.error(f"MFA verification failed: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": "MFA verification failed"}), 401

@auth_services_routes.route("/verify-mfa-setup", methods=["OPTIONS", "POST"])
def verify_mfa_setup_endpoint():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    data = request.json
    access_token = data.get("access_token")
    code = data.get("code")
    if not access_token or not code:
        return jsonify({"detail": "Access token and code are required"}), 400
    try:
        response = cognito_client.verify_software_token(
            AccessToken=access_token,
            UserCode=code,
            FriendlyDeviceName="EncryptGate Auth App"
        )
        status = response.get("Status")
        if status != "SUCCESS":
            return jsonify({"detail": f"MFA verification failed with status: {status}"}), 400
        try:
            cognito_client.set_user_mfa_preference(
                AccessToken=access_token,
                SoftwareTokenMfaSettings={"Enabled": True, "PreferredMfa": True}
            )
        except Exception:
            pass
        try:
            user_info = cognito_client.get_user(AccessToken=access_token)
            username = user_info.get("Username", "user")
        except Exception:
            username = "user"
        return jsonify({
            "message": "MFA setup verified successfully",
            "status": status,
            "username": username
        })
    except cognito_client.exceptions.CodeMismatchException:
        return jsonify({"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}), 400
    except Exception as e:
        logger.error(f"MFA setup verification failed: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": "MFA verification failed"}), 500

@auth_services_routes.route("/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "success", 
        "message": "Authentication service is running",
        "environment": os.getenv("FLASK_ENV", "production"),
        "region": AWS_REGION,
        "client_id_configured": bool(CLIENT_ID),
        "client_secret_configured": bool(CLIENT_SECRET),
        "user_pool_id_configured": bool(USER_POOL_ID),
        "timestamp": datetime.utcnow().isoformat()
    }), 200
