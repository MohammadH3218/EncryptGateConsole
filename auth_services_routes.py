import boto3
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
from flask import Flask
from flask_cors import CORS
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

# Create a separate file handler for MFA-related logs
mfa_logger = logging.getLogger("mfa_operations")
mfa_logger.setLevel(logging.DEBUG)

# AWS Cognito Configuration
AWS_REGION = os.getenv("REGION", "us-east-1")
USER_POOL_ID = os.getenv("COGNITO_USERPOOL_ID")
CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")
CLIENT_SECRET = os.getenv("COGNITO_CLIENT_SECRET")

# Create Cognito client with error handling
try:
    cognito_client = boto3.client("cognito-idp", region_name=AWS_REGION)
    logger.info(f"Successfully initialized Cognito client for region {AWS_REGION}")
except Exception as e:
    logger.error(f"Failed to initialize Cognito client: {e}")
    # Create a dummy client to prevent app crash, but it won't work
    cognito_client = boto3.client("cognito-idp", region_name="us-east-1")

# Blueprint for auth routes
auth_services_routes = Blueprint('auth_services_routes', __name__)

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
    """
    Generate a QR code for MFA setup
    
    Args:
        secret_code (str): The MFA secret code
        username (str): The username for the MFA setup
        issuer (str): The issuer name for the MFA setup
        
    Returns:
        str: Base64 encoded QR code image
    """
    try:
        # Create the OTP auth URI
        totp = pyotp.TOTP(secret_code)
        provisioning_uri = totp.provisioning_uri(name=username, issuer_name=issuer)
        
        mfa_logger.debug(f"Generated provisioning URI: {provisioning_uri}")
        
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
    """
    Debug function to verify if a TOTP code matches the expected value
    """
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
        
        # Log debug information
        mfa_logger.debug(f"TOTP Debug Info:")
        mfa_logger.debug(f"Secret code: {secret_code}")
        mfa_logger.debug(f"User provided code: {user_code}")
        mfa_logger.debug(f"Current expected code: {current_code}")
        mfa_logger.debug(f"Previous window code: {previous_code}")
        mfa_logger.debug(f"Next window code: {next_code}")
        mfa_logger.debug(f"Direct verification result: {is_valid}")
        mfa_logger.debug(f"Current timestamp: {int(time.time())}")
        
        # Return debug info
        return {
            "is_valid": is_valid,
            "current_code": current_code,
            "previous_code": previous_code,
            "next_code": next_code,
            "time_window": totp.interval,
            "timestamp": int(time.time())
        }
    except Exception as e:
        mfa_logger.error(f"Error in TOTP verification: {e}")
        return {"error": str(e)}

# Function for use in other modules - can be called directly with parameters
def authenticate_user(username, password):
    """
    Function version of authenticate_user that can be imported and called directly.
    
    Args:
        username (str): User's email or username
        password (str): User's password
        
    Returns:
        dict: Authentication response containing tokens or error information
    """
    logger.info(f"Authentication attempt for user: {username}")
    
    # Validate parameters
    if not username or not password:
        logger.error("Missing username or password")
        return {"detail": "Username and password are required"}, 400

    # Check AWS Cognito configuration
    if not CLIENT_ID:
        logger.error("CLIENT_ID is not configured")
        return {"detail": "Authentication service misconfigured (CLIENT_ID missing)"}, 500
        
    if not CLIENT_SECRET:
        logger.error("CLIENT_SECRET is not configured")
        return {"detail": "Authentication service misconfigured (CLIENT_SECRET missing)"}, 500
        
    if not USER_POOL_ID:
        logger.error("USER_POOL_ID is not configured")
        return {"detail": "Authentication service misconfigured (USER_POOL_ID missing)"}, 500

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
        except cognito_client.exceptions.NotAuthorizedException as auth_error:
            logger.warning(f"Authentication failed: Invalid credentials")
            return {"detail": "Invalid username or password."}, 401
        except cognito_client.exceptions.UserNotFoundException as user_error:
            logger.warning(f"Authentication failed: User not found")
            return {"detail": "Invalid username or password."}, 401  # Same error for security
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
    """
    Responds to an authentication challenge like NEW_PASSWORD_REQUIRED
    
    Args:
        username (str): User's email or username
        session (str): Session from previous authentication attempt
        challenge_name (str): Name of the challenge (e.g., "NEW_PASSWORD_REQUIRED")
        challenge_responses (dict): Challenge-specific responses
        
    Returns:
        dict: Authentication result or next challenge information
    """
    logger.info(f"Responding to {challenge_name} challenge for user: {username}")
    
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
        
        # Log the challenge response details (sanitized)
        safe_responses = challenge_responses_with_auth.copy()
        if "NEW_PASSWORD" in safe_responses:
            safe_responses["NEW_PASSWORD"] = "***REDACTED***"
        if "SOFTWARE_TOKEN_MFA_CODE" in safe_responses:
            # Keep the code for debugging, but mark it
            safe_responses["SOFTWARE_TOKEN_MFA_CODE"] = f"{safe_responses['SOFTWARE_TOKEN_MFA_CODE']} (logged for debugging)"
        
        logger.info(f"Sending challenge response with parameters: {safe_responses}")
        
        # Make the API call
        response = cognito_client.respond_to_auth_challenge(
            ClientId=CLIENT_ID,
            ChallengeName=challenge_name,
            Session=session,
            ChallengeResponses=challenge_responses_with_auth
        )
        
        logger.info(f"Challenge response received - keys: {list(response.keys())}")
        
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
        logger.warning(f"CodeMismatchException: Invalid verification code: {str(code_error)}")
        return {"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}, 400
        
    except Exception as e:
        logger.error(f"Challenge response error: {e}\n{traceback.format_exc()}")
        return {"detail": f"Challenge response failed: {str(e)}"}, 500

# Set up MFA with access token - UPDATED IMPLEMENTATION
def setup_mfa(access_token):
    """
    Set up MFA for a user with access token
    
    Args:
        access_token (str): User's access token from successful authentication
        
    Returns:
        dict: MFA setup information including secret code
    """
    mfa_logger.info("Setting up MFA - starting associate_software_token")
    
    try:
        # Validate token format
        if not access_token or not isinstance(access_token, str) or len(access_token) < 20:
            mfa_logger.error(f"Invalid access token format: {type(access_token)}")
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
            mfa_logger.info("Software token association successful")
        except Exception as assoc_error:
            mfa_logger.error(f"Failed to associate software token: {assoc_error}")
            return {"detail": f"MFA setup failed: {str(assoc_error)}"}, 500
        
        # Get the secret code
        secret_code = associate_response.get("SecretCode")
        if not secret_code:
            mfa_logger.error("No secret code in response")
            return {"detail": "Failed to generate MFA secret code"}, 500
        
        mfa_logger.info(f"Generated secret code: {secret_code}")
        
        # Generate QR code
        qr_code = generate_qr_code(secret_code, username)
        if not qr_code:
            mfa_logger.warning("Failed to generate QR code, continuing with text secret only")
        
        # Verify the secret is in correct Base32 format
        try:
            # Basic validation that the secret is valid Base32
            if not all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567' for c in secret_code):
                mfa_logger.warning(f"Secret code is not valid Base32 format: {secret_code}")
        except Exception as format_error:
            mfa_logger.warning(f"Error validating secret format: {format_error}")
        
        # Generate a test TOTP code to validate the secret works
        try:
            totp = pyotp.TOTP(secret_code)
            test_code = totp.now()
            mfa_logger.info(f"Generated test TOTP code: {test_code} for verification")
        except Exception as totp_error:
            mfa_logger.error(f"Failed to generate test TOTP code: {totp_error}")
        
        return {
            "secretCode": secret_code,
            "qrCodeImage": qr_code,
            "message": "MFA setup initiated successfully",
            "username": username  # Include username for better frontend experience
        }
        
    except Exception as e:
        mfa_logger.error(f"Error setting up MFA: {e}\n{traceback.format_exc()}")
        return {"detail": f"Failed to setup MFA: {str(e)}"}, 500

# Verify MFA setup with access token - UPDATED IMPLEMENTATION
def verify_software_token_setup(access_token, code):
    """
    Verify MFA setup with access token and verification code
    
    Args:
        access_token (str): User's access token from successful authentication
        code (str): The verification code from authenticator app
        
    Returns:
        dict: Success message or error
    """
    mfa_logger.info("Verifying MFA setup")
    
    # Input validation
    if not code or not isinstance(code, str):
        mfa_logger.error(f"Invalid code format: {type(code)}")
        return {"detail": "Verification code must be a 6-digit number"}, 400
        
    # Ensure code is exactly 6 digits
    code = code.strip()
    if not code.isdigit() or len(code) != 6:
        mfa_logger.error(f"Invalid code format: {code}")
        return {"detail": "Verification code must be exactly 6 digits"}, 400
    
    try:
        # Get user info for logging
        try:
            user_info = cognito_client.get_user(AccessToken=access_token)
            username = user_info.get("Username", "unknown")
            mfa_logger.info(f"Verifying MFA setup for user: {username}")
        except Exception as user_error:
            mfa_logger.warning(f"Could not get username: {user_error}")
            username = "unknown"
        
        # Try to get the secret code from the user's MFA settings for debugging
        try:
            # This call fails if no MFA is associated - just for debugging
            mfa_settings = cognito_client.get_user_mfa_setting(AccessToken=access_token)
            mfa_logger.debug(f"Current MFA settings: {mfa_settings}")
        except Exception:
            # Expected to fail if no MFA is set up yet
            pass
            
        # Make the API call to verify software token
        mfa_logger.info(f"Calling verify_software_token with code: {code}")
        
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
                cognito_client.set_user_mfa_preference(
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
        
        # Call debug function to help troubleshoot
        try:
            # Try to get the secret code from a new association
            debug_assoc = cognito_client.associate_software_token(
                AccessToken=access_token
            )
            secret_code = debug_assoc.get("SecretCode")
            
            if secret_code:
                debug_info = debug_totp_verification(secret_code, code)
                mfa_logger.debug(f"TOTP Debug Info for code mismatch: {debug_info}")
        except Exception as debug_error:
            mfa_logger.error(f"Failed to get debug info: {debug_error}")
        
        return {"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}, 400
        
    except Exception as e:
        mfa_logger.error(f"Error verifying MFA setup: {e}\n{traceback.format_exc()}")
        return {"detail": f"MFA verification failed: {str(e)}"}, 500

# Verify MFA function
def verify_mfa(session, code, username):
    """
    Verifies a multi-factor authentication code.
    
    Args:
        session (str): The session from the initial authentication
        code (str): The MFA code provided by the user
        username (str): The username of the user
        
    Returns:
        dict: Authentication result or error information
    """
    logger.info(f"MFA verification initiated for user: {username}")
    
    # Input validation
    if not code or not isinstance(code, str):
        logger.error(f"Invalid code format: {type(code)}")
        return {"detail": "Verification code must be a 6-digit number"}, 400
        
    # Ensure code is exactly 6 digits
    code = code.strip()
    if not code.isdigit() or len(code) != 6:
        logger.error(f"Invalid code format: {code}")
        return {"detail": "Verification code must be exactly 6 digits"}, 400
    
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
        response = cognito_client.respond_to_auth_challenge(
            ClientId=CLIENT_ID,
            ChallengeName="SOFTWARE_TOKEN_MFA",
            Session=session,
            ChallengeResponses=challenge_responses
        )
        
        logger.info(f"MFA verification response received - keys: {list(response.keys())}")
        
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
        
    except Exception as e:
        logger.error(f"MFA verification error: {e}\n{traceback.format_exc()}")
        return {"detail": f"MFA verification failed: {e}"}, 401

# Initiate forgot password flow
def initiate_forgot_password(username):
    """
    Initiates the forgot password flow for a user
    
    Args:
        username (str): User's email or username
        
    Returns:
        dict: Success message or error
    """
    logger.info(f"Initiating forgot password flow for user: {username}")
    
    try:
        # Generate secret hash
        try:
            secret_hash = generate_client_secret_hash(username)
        except Exception as hash_error:
            logger.error(f"Failed to generate secret hash: {hash_error}")
            return {"detail": "Failed to generate credentials"}, 500
            
        # Call Cognito API
        response = cognito_client.forgot_password(
            ClientId=CLIENT_ID,
            Username=username,
            SecretHash=secret_hash
        )
        
        logger.info("Forgot password initiated successfully")
        return {
            "message": "Password reset initiated. Check your email for verification code.",
            "delivery": response.get("CodeDeliveryDetails"),
        }
        
    except cognito_client.exceptions.UserNotFoundException:
        # For security, don't reveal if user exists or not
        logger.warning(f"User not found during forgot password: {username}")
        return {
            "message": "Password reset initiated. Check your email for verification code."
        }
        
    except Exception as e:
        logger.error(f"Error initiating forgot password: {e}")
        return {"detail": f"Failed to initiate password reset: {str(e)}"}, 500

# Complete forgot password flow
def confirm_forgot_password(username, confirmation_code, new_password):
    """
    Completes the forgot password flow by confirming code and setting new password
    
    Args:
        username (str): User's email or username
        confirmation_code (str): Verification code sent to user's email
        new_password (str): New password to set
        
    Returns:
        dict: Success message or error
    """
    logger.info(f"Confirming forgot password for user: {username}")
    
    try:
        # Generate secret hash
        try:
            secret_hash = generate_client_secret_hash(username)
        except Exception as hash_error:
            logger.error(f"Failed to generate secret hash: {hash_error}")
            return {"detail": "Failed to generate credentials"}, 500
            
        # Call Cognito API
        cognito_client.confirm_forgot_password(
            ClientId=CLIENT_ID,
            Username=username,
            ConfirmationCode=confirmation_code,
            Password=new_password,
            SecretHash=secret_hash
        )
        
        logger.info("Password reset successfully")
        return {
            "message": "Password has been reset successfully."
        }
        
    except cognito_client.exceptions.CodeMismatchException:
        logger.warning("Invalid verification code")
        return {"detail": "Invalid verification code. Please try again."}, 400
        
    except cognito_client.exceptions.InvalidPasswordException as e:
        logger.warning(f"Invalid password format: {e}")
        return {"detail": f"Password does not meet requirements: {str(e)}"}, 400
        
    except Exception as e:
        logger.error(f"Error confirming forgot password: {e}")
        return {"detail": f"Failed to reset password: {str(e)}"}, 500

# Confirm User Signup
def confirm_signup(email, temp_password, new_password):
    """
    Confirms a user's signup by setting a new permanent password.
    """
    try:
        logger.info(f"Confirming signup for {email}")
        
        # Authenticate user to confirm signup
        auth_response = cognito_client.initiate_auth(
            ClientId=CLIENT_ID,
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={
                "USERNAME": email,
                "PASSWORD": temp_password,
                "SECRET_HASH": generate_client_secret_hash(email),
            },
        )

        # Check if a new password is required
        if auth_response.get("ChallengeName") == "NEW_PASSWORD_REQUIRED":
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
    
    logger.debug(f"CORS request from origin: {origin}, allowed origins: {allowed_origins}")
    
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

# Authenticate User Route - Keep for backward compatibility
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

# Route for responding to auth challenges (handles password change)
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
    except Exception as e:
        logger.error(f"Error in respond_to_challenge_endpoint: {e}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

# New route to initiate MFA setup
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
        
        mfa_logger.info(f"MFA setup requested with token: {access_token[:10]}...")
            
        # Call the setup_mfa function
        response = setup_mfa(access_token)
        
        # Check if it's an error response (tuple with status code)
        if isinstance(response, tuple):
            return jsonify(response[0]), response[1]
        
        # Otherwise, it's a successful response
        return jsonify(response)
    except Exception as e:
        mfa_logger.error(f"Error in setup_mfa_endpoint: {e}\n{traceback.format_exc()}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

# Updated route to verify MFA setup with better error handling for CodeMismatchException
@auth_services_routes.route("/verify-mfa-setup", methods=["POST", "OPTIONS"])
def verify_mfa_setup_endpoint():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    try:
        data = request.json
        if not data:
            mfa_logger.error("No JSON data provided")
            return jsonify({"detail": "No JSON data provided"}), 400
            
        access_token = data.get('access_token')
        code = data.get('code')
        
        mfa_logger.info(f"MFA verification requested with token: {access_token[:10] if access_token else 'None'}, code: {code}")
        
        # Enhanced error message with more details
        if not access_token:
            mfa_logger.warning("Missing access_token in request")
            return jsonify({"detail": "Access token is required. Make sure you're properly authenticated."}), 400
            
        if not code:
            mfa_logger.warning("Missing verification code in request")
            return jsonify({"detail": "Verification code is required"}), 400
        
        # Call the verify_software_token_setup function
        response = verify_software_token_setup(access_token, code)
    
        # Check if it's an error response (tuple with status code)
        if isinstance(response, tuple):
            return jsonify(response[0]), response[1]
        
        # Otherwise, it's a successful response
        return jsonify(response)
            
    except cognito_client.exceptions.CodeMismatchException as code_error:
        mfa_logger.warning(f"CodeMismatchException: {code_error}")
        return jsonify({"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}), 400
    except Exception as e:
        mfa_logger.error(f"Error in verify_mfa_setup_endpoint: {e}\n{traceback.format_exc()}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

# Updated route with more flexible parameter handling and improved error handling for CodeMismatchException
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
        access_token = data.get('access_token')
        
        mfa_logger.info(f"MFA setup confirmation requested - username present: {bool(username)}, session present: {bool(session)}, code present: {bool(code)}, access_token present: {bool(access_token)}")
        
        # Check if we have access token (new flow) or session (old flow)
        if access_token:
            mfa_logger.info("Using access token flow for MFA verification")
            # Call the verify_software_token_setup function
            response = verify_software_token_setup(access_token, code)
        elif session and username and code:
            mfa_logger.info(f"Using session flow for MFA verification")
            # Use the respond_to_auth_challenge function
            response = respond_to_auth_challenge(
                username, 
                session, 
                "SOFTWARE_TOKEN_MFA", 
                {"SOFTWARE_TOKEN_MFA_CODE": code}
            )
        else:
            missing_params = []
            if not access_token and not session:
                missing_params.append("access_token or session")
            if not username and not access_token:
                missing_params.append("username")
            if not code:
                missing_params.append("code")
                
            error_msg = f"Missing required parameters: {', '.join(missing_params)}"
            mfa_logger.warning(error_msg)
            return jsonify({"detail": error_msg}), 400
            
        # Check if it's an error response (tuple with status code)
        if isinstance(response, tuple):
            return jsonify(response[0]), response[1]
        
        # Otherwise, it's a successful response
        return jsonify(response)
    except cognito_client.exceptions.CodeMismatchException as code_error:
        mfa_logger.warning(f"CodeMismatchException in confirm_mfa_setup_endpoint: {code_error}")
        return jsonify({"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}), 400
    except Exception as e:
        mfa_logger.error(f"Error in confirm_mfa_setup_endpoint: {e}\n{traceback.format_exc()}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

# Route for initiating forgot password
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
            
        # Call the initiate_forgot_password function
        response = initiate_forgot_password(username)
        
        # Check if it's an error response (tuple with status code)
        if isinstance(response, tuple):
            return jsonify(response[0]), response[1]
        
        # Otherwise, it's a successful response
        return jsonify(response)
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
            
        # Call the confirm_forgot_password function
        response = confirm_forgot_password(username, confirmation_code, new_password)
        
        # Check if it's an error response (tuple with status code)
        if isinstance(response, tuple):
            return jsonify(response[0]), response[1]
        
        # Otherwise, it's a successful response
        return jsonify(response)
    except Exception as e:
        logger.error(f"Error in confirm_forgot_password_endpoint: {e}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

# Route to confirm signup (Uses the confirm_signup function)
@auth_services_routes.route("/confirm-signup", methods=["POST", "OPTIONS"])
def confirm_signup_endpoint():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    data = request.json
    email = data.get('email')
    temp_password = data.get('temporary_password')
    new_password = data.get('new_password')

    if not (email and temp_password and new_password):
        return jsonify({"detail": "All fields are required"}), 400

    try:
        signup_response = confirm_signup(email, temp_password, new_password)
        if not signup_response:
            return jsonify({"detail": "Failed to confirm sign-up"}), 400
    except Exception as e:
        logger.error(f"Signup confirmation failed: {e}")
        return jsonify({"detail": f"Signup confirmation failed: {e}"}), 400

    return jsonify({"message": "Password changed successfully"}), 200

# Route for MFA verification
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

# MFA debugging routes - only available in development
@auth_services_routes.route("/test-mfa-process", methods=["POST"])
def test_mfa_process():
    """Test endpoint to debug MFA setup process"""
    if os.environ.get("FLASK_ENV") != "development":
        return jsonify({"detail": "This endpoint is only available in development mode"}), 403
        
    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400
            
        access_token = data.get('access_token')
        code = data.get('code')
        
        if not access_token:
            return jsonify({"detail": "Access token is required"}), 400
            
        try:
            # Step 1: Try getting user attributes to check token validity
            try:
                user_attr_response = cognito_client.get_user(
                    AccessToken=access_token
                )
                username = user_attr_response.get("Username", "unknown")
            except Exception as attr_error:
                return jsonify({
                    "phase": "token_validation",
                    "error": str(attr_error),
                    "status": "Token appears to be invalid"
                }), 200
                
            # Step 2: Associate software token (start MFA setup)
            try:
                associate_response = cognito_client.associate_software_token(
                    AccessToken=access_token
                )
                secret_code = associate_response.get("SecretCode")
                
                if not secret_code:
                    return jsonify({
                        "phase": "associate_token",
                        "error": "No secret code returned",
                        "status": "Failed to get secret code"
                    }), 200
                    
            except Exception as assoc_error:
                return jsonify({
                    "phase": "associate_token",
                    "error": str(assoc_error),
                    "status": "Failed to associate software token"
                }), 200
                
            # Step 3: If code provided, verify software token
            if code:
                try:
                    verify_response = cognito_client.verify_software_token(
                        AccessToken=access_token,
                        UserCode=code
                    )
                    
                    status = verify_response.get("Status")
                    
                    if status == "SUCCESS":
                        # Step 4: Set user MFA preference
                        try:
                            pref_response = cognito_client.set_user_mfa_preference(
                                AccessToken=access_token,
                                SoftwareTokenMfaSettings={
                                    "Enabled": True,
                                    "PreferredMfa": True
                                }
                            )
                            
                            return jsonify({
                                "phase": "complete",
                                "status": "SUCCESS",
                                "message": "MFA setup completed successfully",
                                "secret_code": secret_code,
                                "username": username,
                                "debug_totp": debug_totp_verification(secret_code, code)
                            }), 200
                            
                        except Exception as pref_error:
                            return jsonify({
                                "phase": "set_mfa_preference",
                                "error": str(pref_error),
                                "status": "Failed to set MFA preference"
                            }), 200
                    else:
                        return jsonify({
                            "phase": "verify_token",
                            "status": status,
                            "message": "Code verification not successful",
                            "debug_totp": debug_totp_verification(secret_code, code)
                        }), 200
                        
                except Exception as verify_error:
                    return jsonify({
                        "phase": "verify_token",
                        "error": str(verify_error),
                        "status": "Failed to verify token",
                        "debug_totp": debug_totp_verification(secret_code, code) if secret_code else "No secret available"
                    }), 200
            
            # If no code provided, just return the generated secret
            return jsonify({
                "phase": "setup_ready",
                "status": "SUCCESS",
                "message": "MFA setup initialized successfully",
                "secret_code": secret_code,
                "username": username,
                "next_step": "Enter this secret in your authenticator app and provide a code to complete setup",
                "test_code": pyotp.TOTP(secret_code).now() if secret_code else "No secret available"
            }), 200
                
        except Exception as e:
            return jsonify({
                "phase": "unknown",
                "error": str(e),
                "status": "Error in MFA process"
            }), 200
            
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

# Helper route to inspect user MFA status - only available in development
@auth_services_routes.route("/check-user-mfa-status", methods=["POST"])
def check_user_mfa_status():
    """Check a user's MFA status"""
    if os.environ.get("FLASK_ENV") != "development":
        return jsonify({"detail": "This endpoint is only available in development mode"}), 403
        
    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400
            
        access_token = data.get('access_token')
        
        if not access_token:
            return jsonify({"detail": "Access token is required"}), 400
            
        try:
            # Get user attributes
            user_attr_response = cognito_client.get_user(
                AccessToken=access_token
            )
            
            # Check if user has MFA enabled
            try:
                mfa_response = cognito_client.get_user_mfa_setting(
                    AccessToken=access_token
                )
                
                return jsonify({
                    "status": "success",
                    "username": user_attr_response.get("Username"),
                    "user_attributes": user_attr_response.get("UserAttributes"),
                    "mfa_settings": mfa_response,
                    "message": "User MFA status retrieved successfully"
                }), 200
                
            except Exception as mfa_error:
                return jsonify({
                    "status": "error",
                    "username": user_attr_response.get("Username"),
                    "user_attributes": user_attr_response.get("UserAttributes"),
                    "mfa_error": str(mfa_error),
                    "message": "Failed to get MFA settings"
                }), 200
                
        except Exception as user_error:
            return jsonify({
                "status": "error",
                "error": str(user_error),
                "message": "Failed to get user information"
            }), 200
            
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

# Universal debug endpoint - only available in development
@auth_services_routes.route("/debug", methods=["POST"])
def debug_endpoint():
    """Universal debug endpoint for troubleshooting"""
    if os.environ.get("FLASK_ENV") != "development":
        return jsonify({"detail": "This endpoint is only available in development mode"}), 403
        
    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400
            
        debug_type = data.get('type')
        if not debug_type:
            return jsonify({"detail": "Debug type is required"}), 400
            
        # Debug TOTP code generation/verification
        if debug_type == "totp":
            secret = data.get('secret')
            code = data.get('code')
            
            if not secret:
                # Generate a new secret if not provided
                secret = pyotp.random_base32()
                
            debug_info = {
                "secret": secret,
                "issuer": "EncryptGate Debug",
                "uri": pyotp.TOTP(secret).provisioning_uri("debug@example.com", issuer_name="EncryptGate Debug"),
                "current_code": pyotp.TOTP(secret).now(),
                "time_remaining": 30 - (int(time.time()) % 30),
                "timestamp": int(time.time())
            }
            
            if code:
                debug_info["verification"] = debug_totp_verification(secret, code)
                
            return jsonify(debug_info), 200
            
        # Debug AWS Cognito configuration
        elif debug_type == "cognito_config":
            return jsonify({
                "region": AWS_REGION,
                "user_pool_id_configured": bool(USER_POOL_ID),
                "client_id_configured": bool(CLIENT_ID),
                "client_secret_configured": bool(CLIENT_SECRET),
                "environment": os.environ.get("FLASK_ENV", "unknown")
            }), 200
            
        else:
            return jsonify({"detail": "Unknown debug type"}), 400
            
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

# Health Check Route with enhanced diagnostics
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
        "timestamp": datetime.utcnow().isoformat(),
        "aws_credentials": {
            "region": AWS_REGION or "missing",
            "user_pool_id": "configured" if USER_POOL_ID else "missing",
            "client_id": "configured" if CLIENT_ID else "missing",
            "client_secret": "configured" if CLIENT_SECRET else "missing"
        },
        "cognito_status": cognito_status,
        "environment": os.environ.get("FLASK_ENV", "production")
    }), 200