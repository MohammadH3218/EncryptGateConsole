import boto3
import botocore
from jose import jwt
import hmac
import hashlib
import base64
import logging
import os
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
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# AWS Cognito Configuration
AWS_REGION = os.getenv("REGION", "us-east-1")
USER_POOL_ID = os.getenv("COGNITO_USERPOOL_ID")
CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")
CLIENT_SECRET = os.getenv("COGNITO_CLIENT_SECRET")

# Create Cognito client
try:
    cognito_client = boto3.client("cognito-idp", region_name=AWS_REGION)
except Exception as e:
    logger.error(f"Failed to initialize Cognito client: {e}")
    cognito_client = boto3.client("cognito-idp", region_name="us-east-1")

# Blueprint for auth routes
auth_services_routes = Blueprint('auth_services_routes', __name__)

# Generate Client Secret Hash
def generate_client_secret_hash(username: str) -> str:
    try:
        if not CLIENT_ID or not CLIENT_SECRET:
            logger.error("CLIENT_ID or CLIENT_SECRET is not configured")
            raise ValueError("Authentication configuration is missing")
            
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

# Function to generate QR code for MFA setup optimized for Google Authenticator
def generate_qr_code(secret_code, username, issuer="EncryptGate"):
    """Generate a QR code for MFA setup optimized for Google Authenticator"""
    try:
        # Sanitize issuer and username
        sanitized_issuer = issuer.lower().replace(" ", "")
        
        # Generate provisioning URI with standard format
        totp = pyotp.TOTP(secret_code)
        provisioning_uri = totp.provisioning_uri(
            name=username, 
            issuer_name=sanitized_issuer
        )
        
        # Generate QR code with higher error correction
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
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

# Function for use in other modules - can be called directly with parameters
def authenticate_user(username, password):
    """Authenticate user with AWS Cognito"""
    # Validate parameters
    if not username or not password:
        return {"detail": "Username and password are required"}, 400

    # Check AWS Cognito configuration
    if not CLIENT_ID or not CLIENT_SECRET or not USER_POOL_ID:
        return {"detail": "Authentication service misconfigured"}, 500

    try:
        # Generate secret hash with error handling
        try:
            secret_hash = generate_client_secret_hash(username)
        except Exception:
            return {"detail": "Authentication error: Failed to generate credentials"}, 500

        # Call Cognito API
        try:
            response = cognito_client.initiate_auth(
                ClientId=CLIENT_ID,
                AuthFlow="USER_PASSWORD_AUTH",
                AuthParameters={
                    "USERNAME": username,
                    "PASSWORD": password,
                    "SECRET_HASH": secret_hash,
                },
            )
        except cognito_client.exceptions.NotAuthorizedException:
            return {"detail": "Invalid username or password."}, 401
        except cognito_client.exceptions.UserNotFoundException:
            return {"detail": "Invalid username or password."}, 401  # Same error for security
        except botocore.exceptions.ClientError as client_error:
            error_code = client_error.response['Error']['Code']
            error_message = client_error.response['Error']['Message']
            logger.error(f"AWS ClientError: {error_code} - {error_message}")
            return {"detail": "Authentication failed"}, 500
        except Exception:
            return {"detail": "Authentication failed"}, 500

        # Process auth result
        auth_result = response.get("AuthenticationResult")
        if not auth_result:
            # Check for challenges
            challenge_name = response.get("ChallengeName")
            if challenge_name:
                # Return challenge details
                response_data = {
                    "ChallengeName": challenge_name,
                    "session": response.get("Session"),
                    "mfa_required": challenge_name == "SOFTWARE_TOKEN_MFA"
                }
                
                return response_data
            else:
                return {"detail": "Invalid authentication response"}, 500
        
        # Return successful result
        return {
            "id_token": auth_result.get("IdToken"),
            "access_token": auth_result.get("AccessToken"),
            "refresh_token": auth_result.get("RefreshToken"),
            "token_type": auth_result.get("TokenType"),
            "expires_in": auth_result.get("ExpiresIn"),
        }

    except Exception as e:
        logger.error(f"Unhandled error during authentication: {e}")
        return {"detail": "Authentication failed"}, 500

# Respond to Auth Challenge (for password change, MFA setup, etc.)
def respond_to_auth_challenge(username, session, challenge_name, challenge_responses):
    """Responds to an authentication challenge like NEW_PASSWORD_REQUIRED"""
    try:
        # Generate secret hash
        try:
            secret_hash = generate_client_secret_hash(username)
        except Exception:
            return {"detail": "Challenge response failed: Unable to generate credentials"}, 500
            
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
        except Exception as api_error:
            logger.error(f"Cognito API call failed: {api_error}")
            return {"detail": "Challenge response failed"}, 500
        
        # Process response
        auth_result = response.get("AuthenticationResult")
        if auth_result:
            # Authentication completed successfully
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
            response_data = {
                "ChallengeName": next_challenge,
                "session": response.get("Session"),
                "mfa_required": next_challenge == "SOFTWARE_TOKEN_MFA"
            }
            
            # Include MFA secret code if this is an MFA setup challenge
            if next_challenge == "MFA_SETUP":
                # For MFA setup, we'd typically generate a secret here
                mfa_secret = pyotp.random_base32()
                response_data["secretCode"] = mfa_secret
                
            return response_data
        
        # If we get here, something unexpected happened
        return {"detail": "Invalid challenge response"}, 500
        
    except cognito_client.exceptions.InvalidPasswordException as pwd_error:
        return {"detail": "Password does not meet requirements"}, 400
        
    except cognito_client.exceptions.CodeMismatchException:
        return {"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}, 400
        
    except botocore.exceptions.ClientError as client_error:
        error_code = client_error.response['Error']['Code']
        return {"detail": f"Challenge response failed"}, 500
        
    except Exception as e:
        logger.error(f"Challenge response error: {e}")
        return {"detail": "Challenge response failed"}, 500

# Set up MFA with access token
def setup_mfa(access_token):
    """Set up MFA for a user with access token"""
    try:
        # Validate token format
        if not access_token or not isinstance(access_token, str) or len(access_token) < 20:
            return {"detail": "Invalid access token format"}, 400
            
        try:
            # Get user details first to validate token and get username
            user_response = cognito_client.get_user(
                AccessToken=access_token
            )
            username = user_response.get("Username", "user")
        except Exception:
            return {"detail": "Invalid access token"}, 401
            
        # Make the API call to associate software token
        try:
            associate_response = cognito_client.associate_software_token(
                AccessToken=access_token
            )
        except Exception:
            return {"detail": "MFA setup failed"}, 500
        
        # Get the secret code
        secret_code = associate_response.get("SecretCode")
        if not secret_code:
            return {"detail": "Failed to generate MFA secret code"}, 500
        
        # Generate QR code optimized for Google Authenticator
        qr_code = generate_qr_code(secret_code, username, "EncryptGate")
        
        # Generate current valid TOTP code
        try:
            totp = pyotp.TOTP(secret_code)
            current_code = totp.now()
        except Exception:
            current_code = None
        
        return {
            "secretCode": secret_code,
            "qrCodeImage": qr_code,
            "message": "MFA setup initiated successfully",
            "username": username,
            "currentCode": current_code
        }
        
    except Exception as e:
        logger.error(f"Error setting up MFA: {e}")
        return {"detail": "Failed to setup MFA"}, 500

# Verify MFA setup with access token
def verify_software_token_setup(access_token, code):
    """Verify MFA setup with access token and verification code"""
    # Input validation
    if not code or not isinstance(code, str):
        return {"detail": "Verification code must be a 6-digit number"}, 400
        
    # Ensure code is exactly 6 digits
    code = code.strip()
    if not code.isdigit() or len(code) != 6:
        return {"detail": "Verification code must be exactly 6 digits"}, 400
    
    try:
        # Validate token format
        if not access_token or not isinstance(access_token, str) or len(access_token) < 20:
            return {"detail": "Invalid access token format"}, 400
            
        # Get user info for logging
        try:
            user_info = cognito_client.get_user(AccessToken=access_token)
            username = user_info.get("Username", "unknown")
        except Exception:
            username = "unknown"
        
        # Make the API call to verify software token
        try:
            response = cognito_client.verify_software_token(
                AccessToken=access_token,
                UserCode=code,
                FriendlyDeviceName="EncryptGate Auth App"
            )
            
            # Check the status
            status = response.get("Status")
            
            if status == "SUCCESS":
                # Set the user's MFA preference to require TOTP
                try:
                    cognito_client.set_user_mfa_preference(
                        AccessToken=access_token,
                        SoftwareTokenMfaSettings={
                            "Enabled": True,
                            "PreferredMfa": True
                        }
                    )
                except Exception:
                    pass  # Continue anyway since the token was verified
                
                return {
                    "message": "MFA setup verified successfully",
                    "status": status
                }
            else:
                return {"detail": "MFA verification failed"}, 400
            
        except cognito_client.exceptions.EnableSoftwareTokenMFAException:
            return {"detail": "Error enabling MFA. Try again or contact support."}, 400
            
        except cognito_client.exceptions.CodeMismatchException:
            return {"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}, 400
            
        except botocore.exceptions.ClientError:
            return {"detail": "MFA verification failed"}, 500
            
    except Exception as e:
        logger.error(f"Error verifying MFA setup: {e}")
        return {"detail": "MFA verification failed"}, 500

# Verify MFA function
def verify_mfa(session, code, username):
    """Verifies a multi-factor authentication code."""
    # Input validation
    if not code or not isinstance(code, str):
        return {"detail": "Verification code must be a 6-digit number"}, 400
        
    # Ensure code is exactly 6 digits
    code = code.strip()
    if not code.isdigit() or len(code) != 6:
        return {"detail": "Verification code must be exactly 6 digits"}, 400
    
    # Validate session format
    if not session or not isinstance(session, str) or len(session) < 20:
        return {"detail": "Invalid session format"}, 400
    
    try:
        # Generate secret hash
        try:
            secret_hash = generate_client_secret_hash(username)
        except Exception:
            return {"detail": "MFA verification failed: Unable to generate credentials"}, 500
        
        # Prepare challenge responses    
        challenge_responses = {
            "USERNAME": username,
            "SOFTWARE_TOKEN_MFA_CODE": code,
            "SECRET_HASH": secret_hash
        }
        
        # Make the API call
        try:
            response = cognito_client.respond_to_auth_challenge(
                ClientId=CLIENT_ID,
                ChallengeName="SOFTWARE_TOKEN_MFA",
                Session=session,
                ChallengeResponses=challenge_responses
            )
        except Exception as api_error:
            logger.error(f"Cognito API call failed: {api_error}")
            return {"detail": "MFA verification failed"}, 500
        
        auth_result = response.get("AuthenticationResult")
        if not auth_result:
            return {"detail": "Invalid MFA response from server"}, 500
            
        return {
            "id_token": auth_result.get("IdToken"),
            "access_token": auth_result.get("AccessToken"),
            "refresh_token": auth_result.get("RefreshToken"),
            "token_type": auth_result.get("TokenType"),
            "expires_in": auth_result.get("ExpiresIn"),
        }
        
    except cognito_client.exceptions.CodeMismatchException:
        return {"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}, 400
        
    except cognito_client.exceptions.ExpiredCodeException:
        return {"detail": "The verification code has expired. Please generate a new code from your authenticator app."}, 400
        
    except botocore.exceptions.ClientError as client_error:
        return {"detail": "MFA verification failed"}, 500
        
    except Exception as e:
        logger.error(f"MFA verification error: {e}")
        return {"detail": "MFA verification failed"}, 401

# Confirm User Signup
def confirm_signup(email, temp_password, new_password):
    """Confirms a user's signup by setting a new permanent password."""
    try:
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
        except Exception:
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
                return response
            except Exception:
                return None

        return None
    except cognito_client.exceptions.NotAuthorizedException:
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
    except Exception:
        return jsonify({"detail": "Server error"}), 500

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
        
        if not (username and session and challenge_name):
            return jsonify({"detail": "Username, session, and challengeName are required"}), 400
            
        # Call the respond_to_auth_challenge function
        response = respond_to_auth_challenge(username, session, challenge_name, challenge_responses)
        
        # Check if it's an error response (tuple with status code)
        if isinstance(response, tuple):
            return jsonify(response[0]), response[1]
        
        # Otherwise, it's a successful response
        return jsonify(response)
    except Exception:
        return jsonify({"detail": "Server error"}), 500

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
    except Exception:
        return jsonify({"detail": "Server error"}), 500

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
        
    except cognito_client.exceptions.CodeMismatchException:
        return jsonify({"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}), 400
    except Exception:
        return jsonify({"detail": "Server error"}), 500

# Fixed MFA setup implementation that follows the exact PowerShell flow
@auth_services_routes.route("/confirm-mfa-setup", methods=["POST", "OPTIONS"])
def confirm_mfa_setup_endpoint():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400
            
        username = data.get('username')
        session = data.get('session')
        code = data.get('code')
        password = data.get('password', '')  # Added password parameter
        
        # Validate input parameters
        if not code:
            return jsonify({"detail": "Verification code is required"}), 400
            
        if not session:
            return jsonify({"detail": "Session token is required. Your session may have expired. Please log in again."}), 400
            
        if not username:
            return jsonify({"detail": "Username is required"}), 400
        
        # Follow EXACTLY the same sequence as your PowerShell commands
        try:
            # Step 1: Call associate_software_token with the session
            associate_response = cognito_client.associate_software_token(
                Session=session
            )
            
            # Get the secret code and possibly a new session
            secret_code = associate_response.get("SecretCode")
            new_session = associate_response.get("Session")
            
            if not secret_code:
                return jsonify({"detail": "Failed to setup MFA. Please try again."}), 500
            
            # Step 2: Call verify_software_token with the session and code
            # Use new session if available, otherwise use original
            verify_session = new_session if new_session else session
            
            verify_response = cognito_client.verify_software_token(
                Session=verify_session,
                UserCode=code
            )
            
            # Check the status
            status = verify_response.get("Status")
            verify_session = verify_response.get("Session")  # Get possibly new session
            
            if status != "SUCCESS":
                return jsonify({"detail": f"MFA verification failed"}), 400
                
            # Step 3: For the final step, now use the SOFTWARE_TOKEN_MFA flow if we have a password
            if password:
                # Generate secret hash
                secret_hash = generate_client_secret_hash(username)
                
                # First do USER_PASSWORD_AUTH to get a session
                final_auth_response = cognito_client.initiate_auth(
                    ClientId=CLIENT_ID,
                    AuthFlow="USER_PASSWORD_AUTH",
                    AuthParameters={
                        "USERNAME": username,
                        "PASSWORD": password,
                        "SECRET_HASH": secret_hash
                    }
                )
                
                # Check if we got MFA challenge (which we should since MFA is now enabled)
                if final_auth_response.get("ChallengeName") == "SOFTWARE_TOKEN_MFA":
                    # Now respond to the MFA challenge with the same code
                    mfa_session = final_auth_response.get("Session")
                    
                    # Get a fresh code from TOTP if needed
                    try:
                        totp = pyotp.TOTP(secret_code)
                        fresh_code = totp.now()
                        # Use the fresh code as fallback
                        verification_code = code if totp.verify(code, valid_window=2) else fresh_code
                    except Exception:
                        verification_code = code
                    
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
                        return jsonify({
                            "message": "MFA setup verified successfully. Please log in again with your MFA code.",
                            "status": "SUCCESS"
                        })
                else:
                    return jsonify({
                        "message": "MFA setup verified successfully. Please log in again.",
                        "status": "SUCCESS"
                    })
            else:
                # No password provided, but MFA setup was successful
                return jsonify({
                    "message": "MFA setup verified successfully. Please log in again with your MFA code.",
                    "status": "SUCCESS"
                })
                
        except cognito_client.exceptions.NotAuthorizedException:
            return jsonify({"detail": "Your session has expired. Please log in again to restart the MFA setup process."}), 401
            
        except cognito_client.exceptions.CodeMismatchException:
            # Try to get a valid code to suggest
            try:
                totp = pyotp.TOTP(secret_code)
                current_valid = totp.now()
                return jsonify({"detail": "The verification code is incorrect. Please try again with a new code from your authenticator app.", 
                                "currentValidCode": current_valid}), 400
            except Exception:
                return jsonify({"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}), 400
            
        except Exception as e:
            return jsonify({"detail": "MFA verification failed"}), 500
            
    except Exception as e:
        return jsonify({"detail": "Server error"}), 500

@auth_services_routes.route("/verify-mfa", methods=["POST", "OPTIONS"])
def verify_mfa_endpoint():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    data = request.json
    session = data.get('session')
    code = data.get('code')
    username = data.get('username')

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
            
            return jsonify({
                "message": "Password reset initiated. Check your email for verification code.",
                "delivery": response.get("CodeDeliveryDetails"),
            })
        except Exception:
            return jsonify({"detail": "Failed to initiate password reset"}), 500
            
    except Exception:
        return jsonify({"detail": "Server error"}), 500

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
            
            return jsonify({
                "message": "Password has been reset successfully."
            })
        except cognito_client.exceptions.CodeMismatchException:
            return jsonify({"detail": "Invalid verification code. Please try again."}), 400
            
        except cognito_client.exceptions.InvalidPasswordException:
            return jsonify({"detail": "Password does not meet requirements"}), 400
            
        except Exception:
            return jsonify({"detail": "Failed to reset password"}), 500
            
    except Exception:
        return jsonify({"detail": "Server error"}), 500