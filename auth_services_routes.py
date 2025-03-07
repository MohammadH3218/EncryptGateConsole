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

# Create a file handler for detailed logs
file_handler = logging.FileHandler('/tmp/mfa_debug.log', mode='a')
file_handler.setLevel(logging.DEBUG)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
file_handler.setFormatter(formatter)
debug_logger.addHandler(file_handler)

# Add console handler for immediate feedback
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.DEBUG)
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

# Generate Client Secret Hash - THIS IS THE CRITICAL FUNCTION FROM THE WORKING VERSION
def generate_client_secret_hash(username: str) -> str:
    message = username + CLIENT_ID
    secret = CLIENT_SECRET.encode("utf-8")
    hash_result = base64.b64encode(hmac.new(secret, message.encode("utf-8"), hashlib.sha256).digest()).decode()
    return hash_result

# Enhanced CORS preflight handler - ALWAYS RETURNS 200 OK FOR OPTIONS
def handle_cors_preflight():
    response = make_response()
    origin = request.headers.get("Origin", "")
    allowed_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net").split(",")
    allowed_origins = [o.strip() for o in allowed_origins]
    
    # Log the preflight request for debugging
    logger.info(f"CORS preflight request from origin: {origin}")
    
    # Always accept preflight requests with 200 status
    if origin in allowed_origins or "*" in allowed_origins:
        response.headers.add("Access-Control-Allow-Origin", origin)
    else:
        # Default to first allowed origin or wildcard
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

        # Return authentication result
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

# Password change route with enhanced CORS handling
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
    # Make sure OPTIONS requests always get a 200 response with CORS headers
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
        
        # Add username and secret hash to challenge responses
        full_responses = {
            "USERNAME": username,
            "SECRET_HASH": generate_client_secret_hash(username)
        }
        
        # Merge in any additional responses
        for key, value in challenge_responses.items():
            full_responses[key] = value
        
        response = cognito_client.respond_to_auth_challenge(
            ClientId=CLIENT_ID,
            ChallengeName=challenge_name,
            Session=session,
            ChallengeResponses=full_responses
        )
        
        # Check if we got another challenge or auth results
        if response.get("ChallengeName"):
            next_challenge = response.get("ChallengeName")
            logger.info(f"Received next challenge: {next_challenge}")
            return jsonify({
                "ChallengeName": next_challenge,
                "session": response.get("Session"),
                "mfa_required": next_challenge == "SOFTWARE_TOKEN_MFA"
            })
        
        # Otherwise, return auth result
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

# IMPROVED MFA Setup route - Returns QR code image and secret
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
        debug_logger.info(f"MFA setup requested with token starting with: {access_token[:10]}...")
        
        # Call associate_software_token to get secret code
        start_time = time.time()
        associate_response = cognito_client.associate_software_token(
            AccessToken=access_token
        )
        debug_logger.info(f"associate_software_token call completed in {time.time() - start_time:.2f} seconds")
        
        secret_code = associate_response.get("SecretCode")
        
        if not secret_code:
            logger.error("No secret code received from Cognito")
            return jsonify({"detail": "Failed to generate MFA secret code"}), 500
        
        debug_logger.info(f"Received secret code: {secret_code}")
        
        # Get user details
        try:
            user_info = cognito_client.get_user(AccessToken=access_token)
            username = user_info.get("Username", "user")
            logger.info(f"Retrieved username: {username} for MFA setup")
        except Exception as e:
            logger.warning(f"Could not get username: {e}")
            username = "user"
        
        # Generate QR code
        issuer = "EncryptGate"
        otpauth_url = pyotp.totp.TOTP(secret_code).provisioning_uri(name=username, issuer_name=issuer)
        
        debug_logger.info(f"Generated TOTP URL: {otpauth_url}")
        
        # Create QR code image
        qr = qrcode.make(otpauth_url)
        buffer = BytesIO()
        qr.save(buffer, format="PNG")
        buffer.seek(0)
        qr_code_base64 = b64encode(buffer.getvalue()).decode()
        
        debug_logger.info("Successfully generated QR code")
        
        # Test TOTP code to validate the secret works
        try:
            totp = pyotp.TOTP(secret_code)
            test_code = totp.now()
            debug_logger.info(f"Current valid code would be: {test_code}")
            debug_logger.info(f"Time window info: current={int(time.time())}s, position={int(time.time()) % 30}s")
        except Exception as totp_err:
            debug_logger.warning(f"Error testing TOTP code: {totp_err}")
        
        # Create response with both secret code and QR code
        response_data = {
            "secretCode": secret_code,
            "qrCodeImage": f"data:image/png;base64,{qr_code_base64}",
            "message": "MFA setup initiated successfully",
            "username": username
        }
        
        logger.info("Returning full MFA setup data")
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"MFA setup failed: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": f"Failed to setup MFA: {str(e)}"}), 500

# MFA verification - THIS IS THE CRITICAL PART FROM THE WORKING VERSION
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
        debug_logger.info(f"Verifying MFA with session: {session[:10]}... code: {code}")
        
        # Generate secret hash
        secret_hash = generate_client_secret_hash(username)
        
        logger.info(f"Generated secret hash for MFA verification")
        
        # Log timing information for debugging
        current_time = int(time.time())
        debug_logger.info(f"Server time: {current_time}s, position in window: {current_time % 30}s")
        
        # Make the API call to verify MFA
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
        
        # Return auth result
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

# MFA Setup verification with enhanced CORS
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
        debug_logger.info(f"Verifying MFA setup with token: {access_token[:10]}... code: {code}")
        
        # Log timing information for debugging
        current_time = int(time.time())
        debug_logger.info(f"Server time: {current_time}s, position in window: {current_time % 30}s")
        
        # Verify the software token
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
        
        # Set MFA preference
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
        
        # Get user information
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
    # Check AWS credentials availability
    aws_credentials = {
        "region": AWS_REGION,
        "client_id": bool(CLIENT_ID),
        "client_secret": bool(CLIENT_SECRET),
        "user_pool_id": bool(USER_POOL_ID)
    }
    
    # Check Cognito connectivity
    cognito_status = "unknown"
    try:
        # Minimal API call to check connectivity
        cognito_client.list_user_pools(MaxResults=1)
        cognito_status = "connected"
    except Exception as e:
        cognito_status = f"error: {str(e)}"
    
    return jsonify({
        "status": "success", 
        "message": "Authentication service is running",
        "environment": os.environ.get("FLASK_ENV", "production"),
        "aws_credentials": aws_credentials,
        "cognito_status": cognito_status,
        "timestamp": datetime.utcnow().isoformat()
    }), 200

# Debugging endpoint for MFA
@auth_services_routes.route("/debug-mfa", methods=["GET"])
def debug_mfa():
    # Get current TOTP window information
    current_time = int(time.time())
    window = current_time // 30
    position = current_time % 30
    
    return jsonify({
        "server_time": current_time,
        "formatted_time": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
        "totp_window": window,
        "window_position": f"{position}/30 seconds",
        "seconds_to_next_window": 30 - position,
        "cognito_client_configured": bool(cognito_client),
        "aws_region": AWS_REGION,
        "client_id_configured": bool(CLIENT_ID),
        "client_secret_configured": bool(CLIENT_SECRET)
    }), 200