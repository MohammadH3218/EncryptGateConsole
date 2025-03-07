import boto3
from jose import jwt
import hmac
import hashlib
import base64
import logging
import os
import sys
import time
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, make_response
from dotenv import load_dotenv
import pyotp
import qrcode
from io import BytesIO
from base64 import b64encode
import traceback

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add a file handler for detailed debugging
debug_logger = logging.getLogger('mfa_debug')
debug_logger.setLevel(logging.DEBUG)

try:
    file_handler = logging.FileHandler('/tmp/mfa_debug.log', mode='a')
    file_handler.setLevel(logging.DEBUG)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    file_handler.setFormatter(formatter)
    debug_logger.addHandler(file_handler)
except Exception as e:
    print(f"Could not set up file logging: {e}")

console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.DEBUG)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
console_handler.setFormatter(formatter)
debug_logger.addHandler(console_handler)

# AWS Configuration
AWS_REGION = os.getenv("REGION", "us-east-1")
USER_POOL_ID = os.getenv("COGNITO_USERPOOL_ID")
CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")
CLIENT_SECRET = os.getenv("COGNITO_CLIENT_SECRET")

# Initialize Cognito client
try:
    cognito_client = boto3.client("cognito-idp", region_name=AWS_REGION)
    logger.info(f"Successfully initialized Cognito client for region {AWS_REGION}")
except Exception as e:
    logger.error(f"Failed to initialize Cognito client: {e}")
    cognito_client = boto3.client("cognito-idp", region_name="us-east-1")

# Create blueprint
auth_services_routes = Blueprint('auth_services_routes', __name__)

# Generate Client Secret Hash - CRITICAL FUNCTION FROM THE WORKING VERSION
def generate_client_secret_hash(username: str) -> str:
    message = username + CLIENT_ID
    secret = CLIENT_SECRET.encode("utf-8")
    hash_result = base64.b64encode(hmac.new(secret, message.encode("utf-8"), hashlib.sha256).digest()).decode()
    return hash_result

# --- NEW: Generate QR Code Function ---
def generate_qr_code(secret_code, username, issuer="EncryptGate"):
    """
    Generate a base64-encoded PNG QR code for MFA setup.
    """
    try:
        totp = pyotp.TOTP(secret_code)
        provisioning_uri = totp.provisioning_uri(name=username, issuer_name=issuer)
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
        return None

# Enhanced CORS preflight handler
def handle_cors_preflight():
    response = make_response()
    origin = request.headers.get("Origin", "")
    allowed_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net").split(",")
    allowed_origins = [o.strip() for o in allowed_origins]
    logger.info(f"CORS preflight request from origin: {origin}")
    if origin in allowed_origins or "*" in allowed_origins:
        response.headers.add("Access-Control-Allow-Origin", origin)
    else:
        response.headers.add("Access-Control-Allow-Origin", allowed_origins[0] if allowed_origins else "*")
    response.headers.add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    response.headers.add("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Origin")
    response.headers.add("Access-Control-Allow-Credentials", "true")
    response.headers.add("Access-Control-Max-Age", "3600")
    logger.info("Returning preflight response with 200 status")
    return response, 200

# Authentication route
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
        logger.info(f"Authenticating user: {username}")
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
        logger.info(f"Authentication response received with challenge: {challenge_name}")
        if challenge_name == "NEW_PASSWORD_REQUIRED":
            return jsonify({"ChallengeName": challenge_name, "session": session})
        if challenge_name == "SOFTWARE_TOKEN_MFA":
            return jsonify({"mfa_required": True, "session": session})
        auth_result = response.get("AuthenticationResult", {})
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

# Password change route with enhanced CORS
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
        logger.info(f"Changing password for user: {username}")
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
        if response.get("ChallengeName") == "SOFTWARE_TOKEN_MFA":
            return jsonify({"mfa_required": True, "session": response["Session"]})
        auth_result = response.get("AuthenticationResult", {})
        return jsonify({
            "message": "Password changed successfully",
            "access_token": auth_result.get("AccessToken"),
            "id_token": auth_result.get("IdToken"),
            "refresh_token": auth_result.get("RefreshToken")
        })
    except Exception as e:
        logger.error(f"Password change failed: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": "Password change failed"}), 500

# Auth challenge response handler with enhanced CORS
@auth_services_routes.route("/respond-to-challenge", methods=["OPTIONS", "POST"])
def respond_to_challenge():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    data = request.json
    if not data:
        return jsonify({"detail": "No data provided"}), 400
    session = data.get('session')
    challenge_name = data.get('challengeName')
    username = data.get('username')
    challenge_responses = data.get('challengeResponses', {})
    if not (username and session and challenge_name):
        return jsonify({"detail": "Missing required parameters"}), 400
    try:
        logger.info(f"Responding to {challenge_name} challenge for {username}")
        full_responses = {
            "USERNAME": username,
            "SECRET_HASH": generate_client_secret_hash(username)
        }
        for key, value in challenge_responses.items():
            full_responses[key] = value
        response = cognito_client.respond_to_auth_challenge(
            ClientId=CLIENT_ID,
            ChallengeName=challenge_name,
            Session=session,
            ChallengeResponses=full_responses
        )
        if response.get("ChallengeName"):
            next_challenge = response.get("ChallengeName")
            logger.info(f"Received next challenge: {next_challenge}")
            return jsonify({
                "ChallengeName": next_challenge,
                "session": response.get("Session"),
                "mfa_required": next_challenge == "SOFTWARE_TOKEN_MFA"
            })
        auth_result = response.get("AuthenticationResult", {})
        return jsonify({
            "message": f"{challenge_name} completed successfully",
            "access_token": auth_result.get("AccessToken"),
            "id_token": auth_result.get("IdToken"),
            "refresh_token": auth_result.get("RefreshToken")
        })
    except Exception as e:
        logger.error(f"Challenge response failed: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": f"Challenge response failed: {str(e)}"}), 500

# --- UPDATED MFA Setup route with QR Code generation ---
@auth_services_routes.route("/setup-mfa", methods=["OPTIONS", "POST"])
def setup_mfa_endpoint():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    data = request.json
    access_token = data.get('access_token')
    if not access_token:
        return jsonify({"detail": "Access token is required"}), 400
    try:
        logger.info("Setting up MFA")
        debug_logger.info(f"MFA setup requested with token")
        associate_response = cognito_client.associate_software_token(
            AccessToken=access_token
        )
        secret_code = associate_response.get("SecretCode")
        if not secret_code:
            logger.error("No secret code received from Cognito")
            return jsonify({"detail": "Failed to generate MFA secret code"}), 500
        logger.info("Received secret code")
        debug_logger.info(f"Received secret code: {secret_code}")
        try:
            user_info = cognito_client.get_user(AccessToken=access_token)
            username = user_info.get("Username", "user")
            logger.info(f"Retrieved username: {username}")
        except Exception as e:
            logger.warning(f"Could not get username: {e}")
            username = "user"
        # Generate the QR code image using the helper function
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

# MFA verification route
@auth_services_routes.route("/verify-mfa", methods=["OPTIONS", "POST"])
def verify_mfa():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    data = request.json
    session = data.get('session')
    code = data.get('code')
    username = data.get('username')
    if not (session and code and username):
        return jsonify({"detail": "Session, username, and code are required"}), 400
    try:
        logger.info(f"Verifying MFA for user: {username} with code: {code}")
        secret_hash = generate_client_secret_hash(username)
        logger.info(f"Generated secret hash for MFA verification")
        current_time = int(time.time())
        debug_logger.info(f"Server time: {current_time}s, position in window: {current_time % 30}s")
        start_time = time.time()
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
        debug_logger.info(f"MFA verification completed in {time.time() - start_time:.2f} seconds")
        logger.info("MFA verification successful")
        auth_result = response.get("AuthenticationResult", {})
        return jsonify({
            "id_token": auth_result.get("IdToken"),
            "access_token": auth_result.get("AccessToken"),
            "refresh_token": auth_result.get("RefreshToken"),
            "token_type": auth_result.get("TokenType"),
            "expires_in": auth_result.get("ExpiresIn")
        })
    except cognito_client.exceptions.CodeMismatchException:
        logger.warning(f"MFA code mismatch for user: {username}")
        debug_logger.warning(f"CodeMismatchException for code: {code}")
        return jsonify({"detail": "Invalid code"}), 401
    except Exception as e:
        logger.error(f"MFA verification failed: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": "MFA verification failed"}), 401

# MFA Setup verification route
@auth_services_routes.route("/verify-mfa-setup", methods=["OPTIONS", "POST"])
def verify_mfa_setup():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    data = request.json
    access_token = data.get('access_token')
    code = data.get('code')
    if not access_token or not code:
        return jsonify({"detail": "Access token and code are required"}), 400
    try:
        logger.info(f"Verifying MFA setup with code: {code}")
        current_time = int(time.time())
        debug_logger.info(f"Server time: {current_time}s, position in window: {current_time % 30}s")
        start_time = time.time()
        response = cognito_client.verify_software_token(
            AccessToken=access_token,
            UserCode=code,
            FriendlyDeviceName="EncryptGate Auth App"
        )
        debug_logger.info(f"verify_software_token call completed in {time.time() - start_time:.2f} seconds")
        status = response.get("Status")
        debug_logger.info(f"MFA verification status: {status}")
        if status != "SUCCESS":
            return jsonify({"detail": f"MFA verification failed with status: {status}"}), 400
        try:
            cognito_client.set_user_mfa_preference(
                AccessToken=access_token,
                SoftwareTokenMfaSettings={
                    "Enabled": True,
                    "PreferredMfa": True
                }
            )
            debug_logger.info("MFA preference set successfully")
        except Exception as pref_error:
            logger.warning(f"MFA verified but couldn't set preference: {pref_error}")
            debug_logger.warning(f"MFA preference setting failed: {pref_error}")
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
    except cognito_client.exceptions.CodeMismatchException as code_error:
        debug_logger.warning(f"CodeMismatchException: {code_error}")
        return jsonify({"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}), 400
    except Exception as e:
        logger.error(f"MFA setup verification failed: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": "MFA verification failed"}), 500

# Health check endpoint
@auth_services_routes.route("/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "success", 
        "message": "Authentication service is running",
        "environment": os.environ.get("FLASK_ENV", "production"),
        "region": AWS_REGION,
        "client_id_configured": bool(CLIENT_ID),
        "client_secret_configured": bool(CLIENT_SECRET),
        "user_pool_id_configured": bool(USER_POOL_ID),
        "timestamp": datetime.utcnow().isoformat()
    }), 200
