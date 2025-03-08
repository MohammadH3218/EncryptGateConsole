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
from flask import Flask
from flask_cors import CORS
import traceback
import json

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
debug_logger = logging.getLogger('cognito_mfa_debug')
debug_logger.setLevel(logging.INFO)
mfa_logger = logging.getLogger("mfa_operations")
mfa_logger.setLevel(logging.INFO)

# Configure file handler for logs
file_handler = logging.FileHandler('/tmp/cognito_mfa_debug.log')
file_handler.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
file_handler.setFormatter(formatter)
debug_logger.addHandler(file_handler)
mfa_logger.addHandler(file_handler)

# Add console handler
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(formatter)
debug_logger.addHandler(console_handler)
mfa_logger.addHandler(console_handler)

# AWS Cognito Configuration
AWS_REGION = os.getenv("REGION", "us-east-1")
USER_POOL_ID = os.getenv("COGNITO_USERPOOL_ID")
CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")
CLIENT_SECRET = os.getenv("COGNITO_CLIENT_SECRET")

# Create Cognito client
try:
    cognito_client = boto3.client("cognito-idp", region_name=AWS_REGION)
    logger.info(f"Successfully initialized Cognito client for region {AWS_REGION}")
except Exception as e:
    logger.error(f"Failed to initialize Cognito client: {e}")
    cognito_client = boto3.client("cognito-idp", region_name="us-east-1")

# Blueprint for auth routes
auth_services_routes = Blueprint('auth_services_routes', __name__)

# Helper function to log session information
def log_session_info(step_name, session_token):
    """Log detailed session token information for debugging"""
    if not session_token:
        logger.info(f"[SESSION DEBUG] {step_name}: No session token available")
        return
    
    try:
        logger.info(f"[SESSION DEBUG] {step_name}: Session token length: {len(session_token)}")
        logger.info(f"[SESSION DEBUG] {step_name}: First 20 chars: {session_token[:20]}")
        logger.info(f"[SESSION DEBUG] {step_name}: Last 20 chars: {session_token[-20:]}")
    except Exception as e:
        logger.error(f"[SESSION DEBUG] Error logging session info: {str(e)}")

# Generate Client Secret Hash
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
        
        # Compute the hash
        hash_obj = hmac.new(secret, message.encode("utf-8"), hashlib.sha256)
        hash_digest = hash_obj.digest()
        hash_result = base64.b64encode(hash_digest).decode()
        
        return hash_result
    except Exception as e:
        logger.error(f"Error generating client secret hash: {e}")
        raise

# Function to generate QR code for MFA setup
def generate_qr_code(secret_code, username, issuer="EncryptGate"):
    """Generate a QR code for MFA setup"""
    try:
        # Create the OTP auth URI
        totp = pyotp.TOTP(secret_code)
        provisioning_uri = totp.provisioning_uri(name=username, issuer_name=issuer)
        
        # Generate QR code
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(provisioning_uri)
        qr.make(fit=True)
        
        # Create image
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convert to base64
        buffered = BytesIO()
        img.save(buffered)
        img_str = b64encode(buffered.getvalue()).decode()
        
        return f"data:image/png;base64,{img_str}"
    except Exception as e:
        logger.error(f"Error generating QR code: {e}")
        return None

# Debug function to verify TOTP code matches
def debug_totp_verification(secret_code, user_code):
    """Debug function to verify if a TOTP code matches the expected value"""
    try:
        totp = pyotp.TOTP(secret_code)
        now = datetime.now()
        
        # Get current code
        current_code = totp.now()
        
        # Get codes for adjacent time windows
        previous_code = totp.at(now - timedelta(seconds=30))
        next_code = totp.at(now + timedelta(seconds=30))
        
        # Verify the code directly
        is_valid = totp.verify(user_code)
        
        # Return debug info
        return {
            "is_valid": is_valid,
            "current_code": current_code,
            "previous_code": previous_code,
            "next_code": next_code,
            "time_window": totp.interval,
            "timestamp": int(time.time()),
            "window_position": f"{int(time.time()) % 30}/30 seconds"
        }
    except Exception as e:
        return {"error": str(e)}

# Function for use in other modules - can be called directly with parameters
def authenticate_user(username, password):
    """Authenticate user with AWS Cognito"""
    logger.info(f"Authentication attempt for user: {username}")
    
    # Validate parameters
    if not username or not password:
        logger.error("Missing username or password")
        return {"detail": "Username and password are required"}, 400

    # Check AWS Cognito configuration
    if not CLIENT_ID or not CLIENT_SECRET or not USER_POOL_ID:
        logger.error("AWS Cognito configuration missing")
        return {"detail": "Authentication service misconfigured"}, 500

    try:
        # Generate secret hash with error handling
        try:
            secret_hash = generate_client_secret_hash(username)
        except Exception as hash_error:
            logger.error(f"Failed to generate secret hash: {hash_error}")
            return {"detail": f"Authentication error: Failed to generate credentials"}, 500

        # Call Cognito API
        try:
            logger.info(f"Initiating Cognito authentication for user: {username}")
            
            response = cognito_client.initiate_auth(
                ClientId=CLIENT_ID,
                AuthFlow="USER_PASSWORD_AUTH",
                AuthParameters={
                    "USERNAME": username,
                    "PASSWORD": password,
                    "SECRET_HASH": secret_hash,
                },
            )
            
            logger.info(f"Cognito authentication response received - keys: {list(response.keys())}")
        except cognito_client.exceptions.NotAuthorizedException:
            logger.warning("Authentication failed: Invalid credentials")
            return {"detail": "Invalid username or password."}, 401
        except cognito_client.exceptions.UserNotFoundException:
            logger.warning("Authentication failed: User not found")
            return {"detail": "Invalid username or password."}, 401  # Same error for security
        except botocore.exceptions.ClientError as client_error:
            error_code = client_error.response['Error']['Code']
            error_message = client_error.response['Error']['Message']
            logger.error(f"AWS ClientError: {error_code} - {error_message}")
            return {"detail": f"Authentication failed: {error_message}"}, 500
        except Exception as api_error:
            logger.error(f"Cognito API call failed: {api_error}")
            return {"detail": f"Authentication failed: {str(api_error)}"}, 500

        # Process auth result
        auth_result = response.get("AuthenticationResult")
        if not auth_result:
            # Check for challenges
            challenge_name = response.get("ChallengeName")
            if challenge_name:
                logger.info(f"Authentication challenge required: {challenge_name}")
                
                # Return challenge details
                response_data = {
                    "ChallengeName": challenge_name,
                    "session": response.get("Session"),
                    "mfa_required": challenge_name == "SOFTWARE_TOKEN_MFA"
                }
                
                # Log session for debugging
                session_value = response.get("Session", "")
                log_session_info("Initial auth session", session_value)
                
                return response_data
            else:
                logger.error("No AuthenticationResult or ChallengeName in response")
                return {"detail": "Invalid authentication response"}, 500
        
        # Return successful result
        logger.info("Authentication successful")
        return {
            "id_token": auth_result.get("IdToken"),
            "access_token": auth_result.get("AccessToken"),
            "refresh_token": auth_result.get("RefreshToken"),
            "token_type": auth_result.get("TokenType"),
            "expires_in": auth_result.get("ExpiresIn"),
        }

    except Exception as e:
        logger.error(f"Unhandled error during authentication: {e}")
        return {"detail": f"Authentication failed: {str(e)}"}, 500

# Respond to Auth Challenge (for password change, MFA setup, etc.)
def respond_to_auth_challenge(username, session, challenge_name, challenge_responses):
    """Responds to an authentication challenge like NEW_PASSWORD_REQUIRED"""
    logger.info(f"Responding to {challenge_name} challenge for user: {username}")
    log_session_info("respond_to_auth_challenge input", session)
    
    try:
        # Generate secret hash
        try:
            secret_hash = generate_client_secret_hash(username)
        except Exception as hash_error:
            logger.error(f"Failed to generate secret hash: {hash_error}")
            return {"detail": f"Challenge response failed: Unable to generate credentials"}, 500
            
        # Add username and secret hash to challenge responses
        challenge_responses_with_auth = {
            "USERNAME": username,
            "SECRET_HASH": secret_hash
        }
        
        # Add challenge-specific responses
        for key, value in challenge_responses.items():
            challenge_responses_with_auth[key] = value
        
        # Make the API call
        try:
            response = cognito_client.respond_to_auth_challenge(
                ClientId=CLIENT_ID,
                ChallengeName=challenge_name,
                Session=session,
                ChallengeResponses=challenge_responses_with_auth
            )
            
            logger.info(f"Challenge response received - keys: {list(response.keys())}")
        except Exception as api_error:
            logger.error(f"Cognito API call failed: {api_error}")
            return {"detail": f"Challenge response failed: {str(api_error)}"}, 500
        
        # Process response
        auth_result = response.get("AuthenticationResult")
        if auth_result:
            # Authentication completed successfully
            logger.info(f"Challenge {challenge_name} completed successfully")
            return {
                "id_token": auth_result.get("IdToken"),
                "access_token": auth_result.get("AccessToken"),
                "refresh_token": auth_result.get("RefreshToken"),
                "token_type": auth_result.get("TokenType"),
                "expires_in": auth_result.get("ExpiresIn"),
            }
        
        # If no auth result, check for next challenge
        next_challenge = response.get("ChallengeName")
        if next_challenge:
            logger.info(f"Next challenge required: {next_challenge}")
            
            response_data = {
                "ChallengeName": next_challenge,
                "session": response.get("Session"),
                "mfa_required": next_challenge == "SOFTWARE_TOKEN_MFA"
            }
            
            # Log new session
            log_session_info("New session after challenge response", response.get("Session"))
            
            # Include MFA secret code if this is an MFA setup challenge
            if next_challenge == "MFA_SETUP":
                # For MFA setup, we'd typically generate a secret here
                # This is simplified - in a real implementation, retrieve the actual secret
                mfa_secret = pyotp.random_base32()
                response_data["secretCode"] = mfa_secret
                
            return response_data
        
        # If we get here, something unexpected happened
        logger.error("No AuthenticationResult or ChallengeName in response")
        return {"detail": "Invalid challenge response"}, 500
        
    except cognito_client.exceptions.InvalidPasswordException as pwd_error:
        logger.warning(f"Invalid password format")
        return {"detail": f"Password does not meet requirements: {str(pwd_error)}"}, 400
        
    except cognito_client.exceptions.CodeMismatchException as code_error:
        logger.warning(f"CodeMismatchException: Invalid verification code")
        return {"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}, 400
        
    except botocore.exceptions.ClientError as client_error:
        error_code = client_error.response['Error']['Code']
        error_message = client_error.response['Error']['Message']
        logger.error(f"AWS ClientError: {error_code} - {error_message}")
        return {"detail": f"Challenge response failed: {error_message}"}, 500
        
    except Exception as e:
        logger.error(f"Challenge response error: {e}")
        return {"detail": f"Challenge response failed: {str(e)}"}, 500

# Set up MFA with access token
def setup_mfa(access_token):
    """Set up MFA for a user with access token"""
    mfa_logger.info("Setting up MFA")
    
    try:
        # Validate token format
        if not access_token or not isinstance(access_token, str) or len(access_token) < 20:
            mfa_logger.error(f"Invalid access token format")
            return {"detail": "Invalid access token format"}, 400
            
        try:
            # Get user details first to validate token and get username
            user_response = cognito_client.get_user(
                AccessToken=access_token
            )
            username = user_response.get("Username", "user")
            mfa_logger.info(f"Retrieved username: {username} from access token")
        except Exception as user_error:
            mfa_logger.error(f"Failed to get user details: {user_error}")
            return {"detail": f"Invalid access token: {str(user_error)}"}, 401
            
        # Make the API call to associate software token
        try:
            associate_response = cognito_client.associate_software_token(
                AccessToken=access_token
            )
        except Exception as assoc_error:
            mfa_logger.error(f"Failed to associate software token: {assoc_error}")
            return {"detail": f"MFA setup failed: {str(assoc_error)}"}, 500
        
        # Get the secret code
        secret_code = associate_response.get("SecretCode")
        if not secret_code:
            mfa_logger.error("No secret code in response")
            return {"detail": "Failed to generate MFA secret code"}, 500
        
        mfa_logger.info(f"Generated secret code for MFA setup")
        
        # Generate QR code
        qr_code = generate_qr_code(secret_code, username)
        if not qr_code:
            mfa_logger.warning("Failed to generate QR code, continuing with text secret only")
        
        return {
            "secretCode": secret_code,
            "qrCodeImage": qr_code,
            "message": "MFA setup initiated successfully",
            "username": username
        }
        
    except Exception as e:
        mfa_logger.error(f"Error setting up MFA: {e}")
        return {"detail": f"Failed to setup MFA: {str(e)}"}, 500

# Verify MFA setup with access token
def verify_software_token_setup(access_token, code):
    """Verify MFA setup with access token and verification code"""
    mfa_logger.info("Verifying MFA setup")
    
    # Input validation
    if not code or not isinstance(code, str):
        mfa_logger.error(f"Invalid code format")
        return {"detail": "Verification code must be a 6-digit number"}, 400
        
    # Ensure code is exactly 6 digits
    code = code.strip()
    if not code.isdigit() or len(code) != 6:
        mfa_logger.error(f"Invalid code format: {code}")
        return {"detail": "Verification code must be exactly 6 digits"}, 400
    
    try:
        # Validate token format
        if not access_token or not isinstance(access_token, str) or len(access_token) < 20:
            return {"detail": "Invalid access token format"}, 400
            
        # Get user info for logging
        try:
            user_info = cognito_client.get_user(AccessToken=access_token)
            username = user_info.get("Username", "unknown")
            mfa_logger.info(f"Verifying MFA setup for user: {username}")
        except Exception as user_error:
            mfa_logger.warning(f"Could not get username: {user_error}")
            username = "unknown"
        
        # Make the API call to verify software token
        mfa_logger.info(f"Calling verify_software_token with code: {code}")
        
        try:
            response = cognito_client.verify_software_token(
                AccessToken=access_token,
                UserCode=code,
                FriendlyDeviceName="EncryptGate Auth App"
            )
            
            # Check the status
            status = response.get("Status")
            mfa_logger.info(f"MFA verification status: {status}")
            
            if status == "SUCCESS":
                # Set the user's MFA preference to require TOTP
                try:
                    mfa_logger.info("Setting MFA preference")
                    
                    pref_response = cognito_client.set_user_mfa_preference(
                        AccessToken=access_token,
                        SoftwareTokenMfaSettings={
                            "Enabled": True,
                            "PreferredMfa": True
                        }
                    )
                    mfa_logger.info("MFA preference set successfully")
                except Exception as pref_error:
                    mfa_logger.warning(f"MFA verified but couldn't set preference: {pref_error}")
                    # Continue anyway since the token was verified
                
                return {
                    "message": "MFA setup verified successfully",
                    "status": status
                }
            else:
                mfa_logger.warning(f"Verification returned non-SUCCESS status: {status}")
                return {"detail": f"MFA verification failed with status: {status}"}, 400
            
        except cognito_client.exceptions.EnableSoftwareTokenMFAException as e:
            mfa_logger.error(f"Error enabling MFA: {e}")
            return {"detail": "Error enabling MFA. Try again or contact support."}, 400
            
        except cognito_client.exceptions.CodeMismatchException as code_error:
            mfa_logger.warning(f"CodeMismatchException: {code_error}")
            return {"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}, 400
            
        except botocore.exceptions.ClientError as client_error:
            error_code = client_error.response['Error']['Code']
            error_message = client_error.response['Error']['Message']
            mfa_logger.error(f"AWS ClientError: {error_code} - {error_message}")
            return {"detail": f"MFA verification failed: {error_message}"}, 500
            
    except Exception as e:
        mfa_logger.error(f"Error verifying MFA setup: {e}")
        return {"detail": f"MFA verification failed: {str(e)}"}, 500

# Verify MFA function
def verify_mfa(session, code, username):
    """Verifies a multi-factor authentication code."""
    logger.info(f"MFA verification initiated for user: {username}")
    log_session_info("verify_mfa input session", session)
    
    # Input validation
    if not code or not isinstance(code, str):
        logger.error(f"Invalid code format")
        return {"detail": "Verification code must be a 6-digit number"}, 400
        
    # Ensure code is exactly 6 digits
    code = code.strip()
    if not code.isdigit() or len(code) != 6:
        logger.error(f"Invalid code format: {code}")
        return {"detail": "Verification code must be exactly 6 digits"}, 400
    
    # Validate session format
    if not session or not isinstance(session, str) or len(session) < 20:
        logger.error(f"Invalid session format: length {len(session) if session else 0}")
        return {"detail": "Invalid session format"}, 400
    
    try:
        # Generate secret hash
        try:
            secret_hash = generate_client_secret_hash(username)
        except Exception as hash_error:
            logger.error(f"Failed to generate secret hash for MFA: {hash_error}")
            return {"detail": "MFA verification failed: Unable to generate credentials"}, 500
        
        # Prepare challenge responses    
        challenge_responses = {
            "USERNAME": username,
            "SOFTWARE_TOKEN_MFA_CODE": code,
            "SECRET_HASH": secret_hash
        }
        
        logger.info(f"Sending MFA verification with code: {code}")
        
        # Make the API call
        try:
            response = cognito_client.respond_to_auth_challenge(
                ClientId=CLIENT_ID,
                ChallengeName="SOFTWARE_TOKEN_MFA",
                Session=session,
                ChallengeResponses=challenge_responses
            )
            
            logger.info(f"MFA verification response received")
        except Exception as api_error:
            logger.error(f"Cognito API call failed: {api_error}")
            return {"detail": f"MFA verification failed: {str(api_error)}"}, 500
        
        auth_result = response.get("AuthenticationResult")
        if not auth_result:
            logger.error("No AuthenticationResult in MFA response")
            return {"detail": "Invalid MFA response from server"}, 500
            
        logger.info("MFA verification successful")
        return {
            "id_token": auth_result.get("IdToken"),
            "access_token": auth_result.get("AccessToken"),
            "refresh_token": auth_result.get("RefreshToken"),
            "token_type": auth_result.get("TokenType"),
            "expires_in": auth_result.get("ExpiresIn"),
        }
        
    except cognito_client.exceptions.CodeMismatchException as code_error:
        logger.warning(f"MFA code mismatch: {code_error}")
        return {"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}, 400
        
    except cognito_client.exceptions.ExpiredCodeException as expired_error:
        logger.warning(f"MFA code expired: {expired_error}")
        return {"detail": "The verification code has expired. Please generate a new code from your authenticator app."}, 400
        
    except botocore.exceptions.ClientError as client_error:
        error_code = client_error.response['Error']['Code']
        error_message = client_error.response['Error']['Message']
        logger.error(f"AWS ClientError: {error_code} - {error_message}")
        return {"detail": f"MFA verification failed: {error_message}"}, 500
        
    except Exception as e:
        logger.error(f"MFA verification error: {e}")
        return {"detail": f"MFA verification failed: {e}"}, 401

# Confirm User Signup
def confirm_signup(email, temp_password, new_password):
    """Confirms a user's signup by setting a new permanent password."""
    try:
        logger.info(f"Confirming signup for {email}")
        
        # Authenticate user to confirm signup
        try:
            auth_response = cognito_client.initiate_auth(
                ClientId=CLIENT_ID,
                AuthFlow="USER_PASSWORD_AUTH",
                AuthParameters={
                    "USERNAME": email,
                    "PASSWORD": temp_password,
                    "SECRET_HASH": generate_client_secret_hash(email),
                },
            )
        except Exception as auth_error:
            logger.error(f"Error during initiate_auth for signup confirmation: {auth_error}")
            return None

        # Check if a new password is required
        if auth_response.get("ChallengeName") == "NEW_PASSWORD_REQUIRED":
            try:
                response = cognito_client.respond_to_auth_challenge(
                    ClientId=CLIENT_ID,
                    ChallengeName="NEW_PASSWORD_REQUIRED",
                    Session=auth_response.get("Session"),
                    ChallengeResponses={
                        "USERNAME": email,
                        "NEW_PASSWORD": new_password,
                        "SECRET_HASH": generate_client_secret_hash(email),
                    },
                )
                logger.info(f"Signup confirmation successful for {email}")
                return response
            except Exception as challenge_error:
                logger.error(f"Error during respond_to_auth_challenge for signup confirmation: {challenge_error}")
                return None

        logger.error("Unexpected signup flow state")
        return None
    except cognito_client.exceptions.NotAuthorizedException:
        logger.warning("Invalid temporary password provided")
        return None
    except Exception as e:
        logger.error(f"Error confirming signup: {e}")
        return None

# Enhanced CORS handler for preflight requests
def handle_cors_preflight():
    response = make_response()
    origin = request.headers.get("Origin", "")
    
    # Get allowed origins from environment variable
    allowed_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net").split(",")
    allowed_origins = [o.strip() for o in allowed_origins]
    
    # Add localhost for development
    if os.getenv("FLASK_ENV") == "development":
        allowed_origins.extend(["http://localhost:3000", "http://localhost:8000"])
    
    # Set CORS headers based on origin validation
    if origin in allowed_origins or "*" in allowed_origins:
        response.headers.add("Access-Control-Allow-Origin", origin)
    else:
        response.headers.add("Access-Control-Allow-Origin", "https://console-encryptgate.net")
    
    response.headers.add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    response.headers.add("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Origin")
    response.headers.add("Access-Control-Allow-Credentials", "true")
    response.headers.add("Access-Control-Max-Age", "3600")  # Cache preflight for 1 hour
    return response, 204

@auth_services_routes.route("/authenticate", methods=["OPTIONS", "POST"])
def authenticate_user_route():
    if request.method == "OPTIONS":
        return handle_cors_preflight()

    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400
            
        username = data.get('username')
        password = data.get('password')
        
        # Call the function version and handle the response
        auth_response = authenticate_user(username, password)
        
        # Check if it's an error response (tuple with status code)
        if isinstance(auth_response, tuple):
            return jsonify(auth_response[0]), auth_response[1]
        
        # Otherwise, it's a successful response
        return jsonify(auth_response)
    except Exception as e:
        logger.error(f"Error in authenticate_user_route: {e}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

@auth_services_routes.route("/respond-to-challenge", methods=["POST", "OPTIONS"])
def respond_to_challenge_endpoint():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400
            
        username = data.get('username')
        session = data.get('session')
        challenge_name = data.get('challengeName')
        challenge_responses = data.get('challengeResponses', {})
        
        # Log session information
        log_session_info("respond-to-challenge endpoint", session)
        
        if not (username and session and challenge_name):
            return jsonify({"detail": "Username, session, and challengeName are required"}), 400
            
        # Call the respond_to_auth_challenge function
        response = respond_to_auth_challenge(username, session, challenge_name, challenge_responses)
        
        # Check if it's an error response (tuple with status code)
        if isinstance(response, tuple):
            return jsonify(response[0]), response[1]
        
        # Otherwise, it's a successful response
        return jsonify(response)
    except Exception as e:
        logger.error(f"Error in respond_to_challenge_endpoint: {e}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

@auth_services_routes.route("/setup-mfa", methods=["POST", "OPTIONS"])
def setup_mfa_endpoint():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400
            
        access_token = data.get('access_token')
        
        if not access_token:
            return jsonify({"detail": "Access token is required"}), 400
            
        # Call the setup_mfa function
        response = setup_mfa(access_token)
        
        # Check if it's an error response (tuple with status code)
        if isinstance(response, tuple):
            return jsonify(response[0]), response[1]
        
        # Otherwise, it's a successful response
        return jsonify(response)
    except Exception as e:
        logger.error(f"Error in setup_mfa_endpoint: {e}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

@auth_services_routes.route("/verify-mfa-setup", methods=["POST", "OPTIONS"])
def verify_mfa_setup_endpoint():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400
            
        access_token = data.get('access_token')
        code = data.get('code')
        
        # Enhanced error message with more details
        if not access_token:
            return jsonify({"detail": "Access token is required. Make sure you're properly authenticated."}), 400
            
        if not code:
            return jsonify({"detail": "Verification code is required"}), 400
        
        # Call the verify_software_token_setup function
        response = verify_software_token_setup(access_token, code)
    
        # Check if it's an error response (tuple with status code)
        if isinstance(response, tuple):
            return jsonify(response[0]), response[1]
        
        # Otherwise, it's a successful response
        return jsonify(response)
        
    except cognito_client.exceptions.CodeMismatchException as code_error:
        logger.warning(f"CodeMismatchException: {code_error}")
        return jsonify({"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}), 400
    except Exception as e:
        logger.error(f"Error in verify_mfa_setup_endpoint: {e}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

# Add endpoint to test MFA codes against the secret
@auth_services_routes.route("/test-mfa-code", methods=["POST", "OPTIONS"])
def test_mfa_code_endpoint():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    try:
        data = request.json
        secret = data.get('secret')
        code = data.get('code')
        
        if not secret or not code:
            return jsonify({"valid": False, "error": "Missing secret or code"}), 400
        
        # Create a TOTP object with the secret
        totp = pyotp.TOTP(secret)
        current_time = time.time()
        current_code = totp.now()
        
        # Verify the code with a window
        is_valid = totp.verify(code, valid_window=1)  # Allow 1 step before/after for time sync issues
        
        return jsonify({
            "valid": is_valid,
            "provided_code": code,
            "current_code": current_code,
            "timestamp": int(current_time),
            "time_window": f"{int(current_time) % 30}/30 seconds",
            "server_time": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error in test_mfa_code_endpoint: {e}")
        return jsonify({"valid": False, "error": str(e)}), 500

# Fixed MFA setup implementation that follows the exact PowerShell flow
@auth_services_routes.route("/confirm-mfa-setup", methods=["POST", "OPTIONS"])
def confirm_mfa_setup_endpoint():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    logger.info("Starting MFA Confirmation")
    
    try:
        data = request.json
        if not data:
            logger.error("No JSON data provided in request body")
            return jsonify({"detail": "No JSON data provided"}), 400
            
        username = data.get('username')
        session = data.get('session')
        code = data.get('code')
        password = data.get('password', '')  # Added password parameter
        
        # Enhanced session validation and logging
        log_session_info("confirm-mfa-setup initial session", session)
        logger.info(f"MFA setup parameters: username={username}, code length={len(code) if code else 0}, password provided={bool(password)}")
        
        # Validate input parameters
        if not code:
            logger.error("MFA code is missing")
            return jsonify({"detail": "Verification code is required"}), 400
            
        if not session:
            logger.error("Session token is missing")
            return jsonify({"detail": "Session token is required. Your session may have expired. Please log in again."}), 400
            
        if not username:
            logger.error("Username is missing")
            return jsonify({"detail": "Username is required"}), 400
        
        # Follow EXACTLY the same sequence as your PowerShell commands
        try:
            # Step 1: Call associate_software_token with the session
            logger.info(f"Step 1: Calling associate_software_token with session")
            
            associate_response = cognito_client.associate_software_token(
                Session=session
            )
            
            # Get the secret code and possibly a new session
            secret_code = associate_response.get("SecretCode")
            new_session = associate_response.get("Session")
            
            logger.info(f"Got secret code: {secret_code}")
            log_session_info("Session after associate_software_token", new_session)
            
            if not secret_code:
                logger.error("Failed to get secret code from associate_software_token")
                return jsonify({"detail": "Failed to setup MFA. Please try again."}), 500
            
            # Step 2: Call verify_software_token with the session and code
            logger.info(f"Step 2: Calling verify_software_token with session and code: {code}")
            
            # Add debug info to check TOTP validation directly
            try:
                # Create a TOTP object with the secret
                totp = pyotp.TOTP(secret_code)
                current_code = totp.now()
                is_valid = totp.verify(code, valid_window=1)  # Allow 1 step before/after
                logger.info(f"TOTP Validation: Current code = {current_code}, User code = {code}, Valid = {is_valid}")
                logger.info(f"Time window position: {int(time.time()) % 30}/30 seconds")
                
                # Check adjacent time windows
                prev_window = totp.at(datetime.now() - timedelta(seconds=30))
                next_window = totp.at(datetime.now() + timedelta(seconds=30))
                logger.info(f"Adjacent codes: Previous = {prev_window}, Next = {next_window}")
            except Exception as totp_error:
                logger.error(f"TOTP validation error: {totp_error}")
            
            # Use new session if available, otherwise use original
            verify_session = new_session if new_session else session
            
            verify_response = cognito_client.verify_software_token(
                Session=verify_session,
                UserCode=code
            )
            
            # Check the status
            status = verify_response.get("Status")
            verify_session = verify_response.get("Session")  # Get possibly new session
            
            logger.info(f"MFA verification status: {status}")
            log_session_info("Session after verify_software_token", verify_session)
            
            if status != "SUCCESS":
                logger.warning(f"Verification returned non-SUCCESS status: {status}")
                return jsonify({"detail": f"MFA verification failed with status: {status}"}), 400
                
            # Step 3: For the final step, now use the SOFTWARE_TOKEN_MFA flow if we have a password
            if password:
                # We have the password, so we can complete the full flow
                logger.info(f"Step 3: Final step - initiate_auth with SOFTWARE_TOKEN_MFA flow")
                
                try:
                    # Generate secret hash
                    secret_hash = generate_client_secret_hash(username)
                    
                    # First do USER_PASSWORD_AUTH to get a session
                    logger.info("Step 3a: Initiating auth with USER_PASSWORD_AUTH to get MFA challenge")
                    final_auth_response = cognito_client.initiate_auth(
                        ClientId=CLIENT_ID,
                        AuthFlow="USER_PASSWORD_AUTH",
                        AuthParameters={
                            "USERNAME": username,
                            "PASSWORD": password,
                            "SECRET_HASH": secret_hash
                        }
                    )
                    
                    # Log response keys
                    logger.info(f"initiate_auth response keys: {list(final_auth_response.keys())}")
                    
                    # Check if we got MFA challenge (which we should since MFA is now enabled)
                    if final_auth_response.get("ChallengeName") == "SOFTWARE_TOKEN_MFA":
                        # Now respond to the MFA challenge with a fresh code
                        mfa_session = final_auth_response.get("Session")
                        
                        log_session_info("MFA challenge session", mfa_session)
                        
                        # Get a fresh code from TOTP
                        try:
                            totp = pyotp.TOTP(secret_code)
                            fresh_code = totp.now()
                            logger.info(f"Generated fresh TOTP code: {fresh_code}")
                            # Use the fresh code or the original code if it's still valid
                            verification_code = fresh_code if totp.verify(code) else code
                        except Exception as totp_error:
                            logger.error(f"Error generating fresh TOTP code: {totp_error}")
                            verification_code = code
                        
                        logger.info(f"Step 3b: Responding to MFA challenge with code: {verification_code}")
                        
                        # Respond to the MFA challenge
                        mfa_response = cognito_client.respond_to_auth_challenge(
                            ClientId=CLIENT_ID,
                            ChallengeName="SOFTWARE_TOKEN_MFA",
                            Session=mfa_session,
                            ChallengeResponses={
                                "USERNAME": username,
                                "SOFTWARE_TOKEN_MFA_CODE": verification_code,
                                "SECRET_HASH": secret_hash
                            }
                        )
                        
                        # Check if we got authentication result
                        auth_result = mfa_response.get("AuthenticationResult")
                        if auth_result:
                            logger.info("MFA setup and verification completed successfully with tokens")
                            return jsonify({
                                "message": "MFA setup verified successfully",
                                "status": "SUCCESS",
                                "access_token": auth_result.get("AccessToken"),
                                "id_token": auth_result.get("IdToken"),
                                "refresh_token": auth_result.get("RefreshToken"),
                                "token_type": auth_result.get("TokenType"),
                                "expires_in": auth_result.get("ExpiresIn")
                            })
                        else:
                            logger.warning("MFA verification completed but no tokens received")
                            return jsonify({
                                "message": "MFA setup verified successfully. Please log in again with your MFA code.",
                                "status": "SUCCESS"
                            })
                    else:
                        # Unexpected flow but MFA setup was successful
                        logger.info(f"MFA setup successful, but no MFA challenge received. Response: {final_auth_response}")
                        return jsonify({
                            "message": "MFA setup verified successfully. Please log in again.",
                            "status": "SUCCESS"
                        })
                except Exception as final_auth_error:
                    logger.error(f"Error in final authentication step: {final_auth_error}")
                    logger.error(traceback.format_exc())
                    # MFA setup was still successful
                    return jsonify({
                        "message": "MFA setup verified, but couldn't complete login. Please log in again.",
                        "status": "SUCCESS"
                    })
            else:
                # No password provided, but MFA setup was successful
                return jsonify({
                    "message": "MFA setup verified successfully. Please log in again with your MFA code.",
                    "status": "SUCCESS"
                })
                
        except cognito_client.exceptions.NotAuthorizedException as auth_error:
            logger.error(f"NotAuthorizedException: {auth_error}")
            return jsonify({"detail": "Your session has expired. Please log in again to restart the MFA setup process."}), 401
            
        except cognito_client.exceptions.CodeMismatchException as code_error:
            logger.warning(f"CodeMismatchException: {code_error}")
            logger.warning(traceback.format_exc())
            return jsonify({"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}), 400
            
        except Exception as e:
            logger.error(f"Error in MFA setup process: {e}")
            logger.error(traceback.format_exc())
            return jsonify({"detail": f"MFA verification failed: {str(e)}"}), 500
            
    except Exception as e:
        logger.error(f"Unhandled exception in confirm_mfa_setup_endpoint: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

@auth_services_routes.route("/verify-mfa", methods=["POST", "OPTIONS"])
def verify_mfa_endpoint():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    data = request.json
    session = data.get('session')
    code = data.get('code')
    username = data.get('username')

    # Log session information
    log_session_info("verify-mfa endpoint", session)

    if not (session and code and username):
        return jsonify({"detail": "Session, username, and code are required"}), 400

    # Call the verify_mfa function
    auth_result = verify_mfa(session, code, username)
    
    # Check if it's an error response (tuple with status code)
    if isinstance(auth_result, tuple):
        return jsonify(auth_result[0]), auth_result[1]
    
    # Otherwise, it's a successful response
    return jsonify(auth_result)

# Route for initiate forgot password
@auth_services_routes.route("/forgot-password", methods=["POST", "OPTIONS"])
def forgot_password_endpoint():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400
            
        username = data.get('username')
        
        if not username:
            return jsonify({"detail": "Username is required"}), 400
            
        try:
            # Generate secret hash
            secret_hash = generate_client_secret_hash(username)
                
            # Call Cognito API
            response = cognito_client.forgot_password(
                ClientId=CLIENT_ID,
                Username=username,
                SecretHash=secret_hash
            )
            
            logger.info("Forgot password initiated successfully")
            return jsonify({
                "message": "Password reset initiated. Check your email for verification code.",
                "delivery": response.get("CodeDeliveryDetails"),
            })
        except Exception as api_error:
            logger.error(f"Forgot password API call failed: {api_error}")
            return jsonify({"detail": f"Failed to initiate password reset: {str(api_error)}"}), 500
            
    except Exception as e:
        logger.error(f"Error in forgot_password_endpoint: {e}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

# Route for confirming forgot password
@auth_services_routes.route("/confirm-forgot-password", methods=["POST", "OPTIONS"])
def confirm_forgot_password_endpoint():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400
            
        username = data.get('username')
        confirmation_code = data.get('code')
        new_password = data.get('password')
        
        if not (username and confirmation_code and new_password):
            return jsonify({"detail": "Username, verification code, and new password are required"}), 400
        
        try:
            # Generate secret hash
            secret_hash = generate_client_secret_hash(username)
                
            # Call Cognito API
            cognito_client.confirm_forgot_password(
                ClientId=CLIENT_ID,
                Username=username,
                ConfirmationCode=confirmation_code,
                Password=new_password,
                SecretHash=secret_hash
            )
            
            logger.info("Password reset successfully")
            return jsonify({
                "message": "Password has been reset successfully."
            })
        except cognito_client.exceptions.CodeMismatchException:
            logger.warning("Invalid verification code")
            return jsonify({"detail": "Invalid verification code. Please try again."}), 400
            
        except cognito_client.exceptions.InvalidPasswordException as e:
            logger.warning(f"Invalid password format: {e}")
            return jsonify({"detail": f"Password does not meet requirements: {str(e)}"}), 400
            
        except Exception as api_error:
            logger.error(f"Confirm forgot password API call failed: {api_error}")
            return jsonify({"detail": f"Failed to reset password: {str(api_error)}"}), 500
            
    except Exception as e:
        logger.error(f"Error in confirm_forgot_password_endpoint: {e}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

# Health Check Route
@auth_services_routes.route("/health", methods=["GET"])
def health_check():
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
        "message": "Service is running",
        "cognito_status": cognito_status,
        "environment": os.environ.get("FLASK_ENV", "production")
    }), 200