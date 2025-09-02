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
mfa_logger = logging.getLogger("mfa_operations")
mfa_logger.setLevel(logging.INFO)

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

# Generate Client Secret Hash (following ChatGPT's pattern)
def _calculate_secret_hash(username: str, client_id: str, client_secret: str) -> str:
    """
    Helper to calculate Cognito secret hash, required when using an app client with a client secret.
    """
    message = (username + client_id).encode('utf-8')
    key = client_secret.encode('utf-8')
    secret_hash = base64.b64encode(hmac.new(key, message, digestmod=hashlib.sha256).digest()).decode('utf-8')
    return secret_hash

# Legacy function for backward compatibility
def generate_client_secret_hash(username: str) -> str:
    try:
        if not CLIENT_ID:
            logger.error("CLIENT_ID is not configured")
            raise ValueError("CLIENT_ID is missing")
            
        if not CLIENT_SECRET:
            logger.error("CLIENT_SECRET is not configured")
            raise ValueError("CLIENT_SECRET is missing")
            
        return _calculate_secret_hash(username, CLIENT_ID, CLIENT_SECRET)
    except Exception as e:
        logger.error(f"Error generating client secret hash: {e}")
        raise

# Specific format optimized for Google Authenticator
def generate_qr_code(secret_code, username, issuer="EncryptGate"):
    """Generate a QR code for MFA setup optimized for Google Authenticator"""
    try:
        # Create the OTP auth URI with specific formatting for Google Authenticator
        # Use lowercase and no spaces in issuer name for better compatibility
        sanitized_issuer = issuer.lower().replace(" ", "")
        
        # Generate provisioning URI with standard format
        totp = pyotp.TOTP(secret_code)
        provisioning_uri = totp.provisioning_uri(
            name=username, 
            issuer_name=sanitized_issuer
        )
        
        logger.info(f"Generated provisioning URI: {provisioning_uri}")
        
        # Generate QR code with higher error correction
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,  # Medium error correction
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

# Generate multiple valid MFA codes for time windows
def generate_multi_window_codes(secret_code, window_size=3):
    """Generate MFA codes for multiple time windows to help with time sync issues"""
    try:
        if not secret_code:
            return None
            
        totp = pyotp.TOTP(secret_code)
        current_time = datetime.now()
        current_code = totp.now()
        
        # Generate codes for adjacent windows
        codes = []
        for i in range(-window_size, window_size + 1):
            window_time = current_time + timedelta(seconds=30 * i)
            codes.append({
                "window": i,
                "code": totp.at(window_time),
                "valid_until": (window_time + timedelta(seconds=30)).isoformat()
            })
            
        return {
            "current_code": current_code,
            "server_time": current_time.isoformat(),
            "window_position": f"{int(time.time()) % 30}/30 seconds",
            "time_windows": codes
        }
    except Exception as e:
        logger.error(f"Error generating multi-window codes: {e}")
        return None

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

        # Call Cognito API using admin_initiate_auth for more reliable server-side authentication
        try:
            logger.info(f"Initiating Cognito admin authentication for user: {username}")
            logger.info(f"Using USER_POOL_ID: {USER_POOL_ID}")
            logger.info(f"Using CLIENT_ID: {CLIENT_ID}")
            
            response = cognito_client.admin_initiate_auth(
                UserPoolId=USER_POOL_ID,
                ClientId=CLIENT_ID,
                AuthFlow="ADMIN_NO_SRP_AUTH",
                AuthParameters={
                    "USERNAME": username,
                    "PASSWORD": password,
                    "SECRET_HASH": secret_hash,
                },
            )
            
            logger.info(f"Admin auth response received - keys: {list(response.keys())}")
            if response.get("ChallengeName"):
                logger.info(f"Challenge detected: {response.get('ChallengeName')}")
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
        
        # Make the API call using admin_respond_to_auth_challenge for consistency
        try:
            response = cognito_client.admin_respond_to_auth_challenge(
                UserPoolId=USER_POOL_ID,
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
            
            # Include MFA secret code if this is an MFA setup challenge
            if next_challenge == "MFA_SETUP":
                # Get the actual secret from Cognito associate_software_token
                try:
                    associate_response = cognito_client.associate_software_token(
                        Session=response.get("Session")
                    )
                    actual_secret = associate_response.get("SecretCode")
                    if actual_secret:
                        response_data["secretCode"] = actual_secret
                        response_data["session"] = associate_response.get("Session", response.get("Session"))
                        logger.info(f"Generated MFA secret for setup: {actual_secret}")
                    else:
                        logger.error("Failed to get secret code from associate_software_token")
                except Exception as e:
                    logger.error(f"Error getting MFA secret: {e}")
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
        
        mfa_logger.info(f"Generated secret code for MFA setup: {secret_code}")
        
        # Generate QR code optimized for Google Authenticator
        qr_code = generate_qr_code(secret_code, username, "EncryptGate")
        if not qr_code:
            mfa_logger.warning("Failed to generate QR code, continuing with text secret only")
        
        # Generate current valid TOTP code
        try:
            totp = pyotp.TOTP(secret_code)
            current_code = totp.now()
            mfa_logger.info(f"Current valid TOTP code: {current_code}")
            
            # Generate multiple time windows for better success
            multi_window_codes = generate_multi_window_codes(secret_code, 2)
        except Exception as totp_error:
            mfa_logger.error(f"Failed to generate current TOTP code: {totp_error}")
            current_code = None
            multi_window_codes = None
        
        return {
            "secretCode": secret_code,
            "qrCodeImage": qr_code,
            "message": "MFA setup initiated successfully",
            "username": username,
            "currentCode": current_code,
            "validCodes": multi_window_codes
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
    logger.info(f"MFA verification initiated for user: {username} with code: {code}")
    
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
        except Exception as hash_error:
            logger.error(f"Failed to generate secret hash for MFA: {hash_error}")
            return {"detail": "MFA verification failed: Unable to generate credentials"}, 500
        
        # Prepare challenge responses    
        challenge_responses = {
            "USERNAME": username,
            "SOFTWARE_TOKEN_MFA_CODE": code,
            "SECRET_HASH": secret_hash
        }
        
        logger.info(f"Attempting MFA verification with Cognito for user: {username}")
        
        # Make the API call using admin_respond_to_auth_challenge
        try:
            response = cognito_client.admin_respond_to_auth_challenge(
                UserPoolId=USER_POOL_ID,
                ClientId=CLIENT_ID,
                ChallengeName="SOFTWARE_TOKEN_MFA",
                Session=session,
                ChallengeResponses=challenge_responses
            )
            logger.info("MFA verification successful - received valid response from Cognito")
        except Exception as api_error:
            logger.error(f"Cognito API call failed: {api_error}")
            return {"detail": f"MFA verification failed: {str(api_error)}"}, 500
        
        auth_result = response.get("AuthenticationResult")
        if not auth_result:
            logger.error("No AuthenticationResult in MFA response")
            return {"detail": "Invalid MFA response from server"}, 500
            
        logger.info("MFA verification completed successfully")
        return {
            "id_token": auth_result.get("IdToken"),
            "access_token": auth_result.get("AccessToken"),
            "refresh_token": auth_result.get("RefreshToken"),
            "token_type": auth_result.get("TokenType"),
            "expires_in": auth_result.get("ExpiresIn"),
        }
        
    except cognito_client.exceptions.CodeMismatchException as code_error:
        return {"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}, 400
        
    except cognito_client.exceptions.ExpiredCodeException as expired_error:
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
        
        # Authenticate user to confirm signup using admin API
        try:
            auth_response = cognito_client.admin_initiate_auth(
                UserPoolId=USER_POOL_ID,
                ClientId=CLIENT_ID,
                AuthFlow="ADMIN_NO_SRP_AUTH",
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
                response = cognito_client.admin_respond_to_auth_challenge(
                    UserPoolId=USER_POOL_ID,
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

# ============================================================================
# NEW IMPROVED COGNITO AUTHENTICATION FLOW (following ChatGPT pattern)
# ============================================================================
#
# This section implements a complete, robust Cognito authentication flow that:
# 
# 1. Uses standard CLIENT APIs (not admin APIs) for user authentication
# 2. Handles all authentication challenges systematically:
#    - NEW_PASSWORD_REQUIRED: When user has temporary password
#    - MFA_SETUP: When user needs to configure TOTP for first time  
#    - SOFTWARE_TOKEN_MFA: When user needs to provide MFA code for login
# 3. Proper session management throughout the entire flow
# 4. Clear error handling with specific exception mapping
# 5. Follows AWS best practices for TOTP MFA implementation
#
# Flow Overview:
# - initiate_authentication() -> starts with username/password
# - respond_to_new_password_challenge() -> handles password change
# - associate_mfa_token() -> gets TOTP secret during MFA setup
# - verify_mfa_token() -> verifies user's TOTP code during setup
# - respond_to_mfa_challenge() -> handles both MFA setup completion and login MFA
#
# Key Benefits:
# - Eliminates session reuse issues
# - Prevents secret/time base mismatches
# - Provides consistent error handling
# - Uses proper Cognito authentication patterns
# ============================================================================

def initiate_authentication(client, client_id: str, username: str, password: str, client_secret: str = None):
    """
    Initiates the authentication flow using USER_PASSWORD_AUTH.
    Returns the response which contains either AuthenticationResult (tokens) or a ChallengeName requiring further steps.
    """
    auth_params = {"USERNAME": username, "PASSWORD": password}
    if client_secret:
        auth_params["SECRET_HASH"] = _calculate_secret_hash(username, client_id, client_secret)
    
    logger.info(f"Initiating authentication for user: {username}")
    
    try:
        response = client.initiate_auth(
            ClientId=client_id,
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters=auth_params
        )
        logger.info(f"Authentication response received - keys: {list(response.keys())}")
        if response.get("ChallengeName"):
            logger.info(f"Challenge detected: {response.get('ChallengeName')}")
        return response
    except client.exceptions.NotAuthorizedException:
        logger.warning("Authentication failed: Invalid credentials")
        raise Exception("Authentication failed: Incorrect username or password, or account not authorized.")
    except client.exceptions.UserNotConfirmedException:
        logger.warning("User account is not confirmed")
        raise Exception("User account is not confirmed. Please complete verification before login.")
    except client.exceptions.UserNotFoundException:
        logger.warning("User does not exist")
        raise Exception("User does not exist.")
    except client.exceptions.PasswordResetRequiredException:
        logger.warning("Password reset is required")
        raise Exception("Password reset is required for this user. Use the Forgot Password flow to set a new password.")
    except Exception as e:
        logger.error(f"Unexpected error during authentication: {e}")
        raise

def respond_to_new_password_challenge(client, client_id: str, username: str, new_password: str, session: str, user_attributes: dict = None, client_secret: str = None):
    """
    Responds to a NEW_PASSWORD_REQUIRED challenge with a new permanent password and optional user attributes.
    user_attributes example: {"preferred_username": "Security Admin", "custom:role": "admin"}
    Returns the response which may contain tokens or another challenge (e.g., MFA challenge).
    """
    # Base challenge responses
    challenge_responses = {
        "USERNAME": username,
        "NEW_PASSWORD": new_password
    }
    if client_secret:
        challenge_responses["SECRET_HASH"] = _calculate_secret_hash(username, client_id, client_secret)
    
    # Add user attributes using the required key format
    if user_attributes:
        for k, v in user_attributes.items():
            if k.startswith("custom:"):
                # custom attribute
                challenge_responses[f"userAttributes.custom:{k.split(':',1)[1]}"] = str(v)
            else:
                # standard attribute
                challenge_responses[f"userAttributes.{k}"] = str(v)
        logger.info(f"Setting user attributes: {list(user_attributes.keys())}")
    
    logger.info(f"Responding to NEW_PASSWORD_REQUIRED challenge for user: {username}")
    
    try:
        response = client.respond_to_auth_challenge(
            ClientId=client_id,
            ChallengeName="NEW_PASSWORD_REQUIRED",
            Session=session,
            ChallengeResponses=challenge_responses
        )
        logger.info(f"Password change response received - keys: {list(response.keys())}")
        if response.get("ChallengeName"):
            logger.info(f"Next challenge: {response.get('ChallengeName')}")
        return response
    except client.exceptions.InvalidPasswordException:
        logger.warning("New password does not meet policy requirements")
        raise Exception("New password does not meet the password policy requirements.")
    except client.exceptions.NotAuthorizedException:
        logger.warning("Session invalid or expired during password change")
        raise Exception("Failed to set new password: The session is invalid or expired.")
    except Exception as e:
        logger.error(f"Unexpected error during password change: {e}")
        raise

def associate_mfa_token(client, session: str):
    """
    Initiates TOTP software token setup for MFA (MFA_SETUP challenge).
    Returns a tuple (secret_code, session_for_verify). The secret_code should be shown to the user (e.g., as QR code or text)
    so they can configure their authenticator app. The session_for_verify should be used in verify_mfa_token().
    """
    logger.info("Associating MFA software token")
    
    try:
        response = client.associate_software_token(Session=session)
        secret_code = response.get("SecretCode")
        session_for_verify = response.get("Session")
        
        logger.info(f"MFA token associated successfully, secret: {secret_code[:8]}...")
        return secret_code, session_for_verify
    except client.exceptions.InvalidParameterException:
        logger.error("Invalid parameters for MFA token association")
        raise Exception("Failed to associate MFA token: Invalid parameters or session.")
    except client.exceptions.ResourceNotFoundException:
        logger.error("Resource not found for MFA token association")
        raise Exception("Failed to associate MFA token: Session or user not found.")
    except client.exceptions.NotAuthorizedException:
        logger.error("Not authorized for MFA token association")
        raise Exception("Failed to associate MFA token: Not authorized (invalid session or access token).")
    except Exception as e:
        logger.error(f"Unexpected error during MFA token association: {e}")
        raise

def verify_mfa_token(client, session: str, user_code: str, friendly_name: str = "AuthenticatorApp"):
    """
    Verifies the TOTP code from the user's authenticator app. Use the session from associate_mfa_token().
    Returns a new session string to be used to complete the MFA setup challenge.
    """
    logger.info(f"Verifying MFA token with code: {user_code}")
    
    try:
        response = client.verify_software_token(
            Session=session, 
            UserCode=user_code, 
            FriendlyDeviceName=friendly_name
        )
        status = response.get("Status")
        session_after_verify = response.get("Session")
        
        logger.info(f"MFA token verification status: {status}")
        
        if status != "SUCCESS":
            logger.warning(f"MFA verification failed with status: {status}")
            raise Exception("MFA code verification failed. The code might be incorrect.")
        
        return session_after_verify
    except client.exceptions.CodeMismatchException:
        logger.warning("MFA code mismatch")
        raise Exception("The MFA code is incorrect. Please try again with a new code.")
    except client.exceptions.ExpiredCodeException:
        logger.warning("MFA code expired")
        raise Exception("The MFA code has expired. Please try again with a new code.")
    except client.exceptions.NotAuthorizedException:
        logger.error("Not authorized for MFA token verification")
        raise Exception("Failed to verify MFA code: The session is invalid or user not authorized.")
    except Exception as e:
        logger.error(f"Unexpected error during MFA token verification: {e}")
        raise

def respond_to_mfa_challenge(client, client_id: str, username: str, session: str, mfa_code: str = None, client_secret: str = None):
    """
    Completes the authentication by responding to an MFA challenge.
    If mfa_code is provided, responds to a SOFTWARE_TOKEN_MFA challenge using the given code.
    If mfa_code is None, finalizes an MFA_SETUP challenge (after verify_mfa_token) to complete login.
    Returns the AuthenticationResult (dict with IdToken, AccessToken, RefreshToken, etc.) on success.
    """
    if mfa_code is not None:
        challenge_name = "SOFTWARE_TOKEN_MFA"
        challenge_responses = {
            "USERNAME": username,
            "SOFTWARE_TOKEN_MFA_CODE": mfa_code
        }
        logger.info(f"Responding to SOFTWARE_TOKEN_MFA challenge for user: {username}")
    else:
        challenge_name = "MFA_SETUP"
        challenge_responses = {
            "USERNAME": username
        }
        logger.info(f"Responding to MFA_SETUP challenge for user: {username}")
    
    if client_secret:
        challenge_responses["SECRET_HASH"] = _calculate_secret_hash(username, client_id, client_secret)
    
    try:
        response = client.respond_to_auth_challenge(
            ClientId=client_id,
            ChallengeName=challenge_name,
            Session=session,
            ChallengeResponses=challenge_responses
        )
        
        if "AuthenticationResult" in response:
            logger.info("MFA challenge completed successfully - tokens received")
            return response["AuthenticationResult"]
        else:
            # If there's no AuthenticationResult, we likely have another challenge (which is not expected in this flow)
            challenge = response.get("ChallengeName")
            logger.error(f"Unexpected challenge '{challenge}' returned instead of tokens")
            raise Exception(f"Unexpected challenge '{challenge}' returned instead of tokens.")
    except client.exceptions.CodeMismatchException:
        logger.warning("MFA code mismatch in final challenge")
        raise Exception("MFA code is incorrect or expired, authentication failed.")
    except client.exceptions.NotAuthorizedException:
        logger.warning("Not authorized in final MFA challenge")
        raise Exception("MFA code is incorrect or expired, authentication failed.")
    except client.exceptions.ExpiredCodeException:
        logger.warning("MFA code expired in final challenge")
        raise Exception("MFA code expired. Please provide a new code.")
    except Exception as e:
        logger.error(f"Unexpected error during MFA challenge response: {e}")
        raise

# ============================================================================
# IMPROVED FORGOT PASSWORD FUNCTIONS (following ChatGPT pattern)
# ============================================================================

def start_forgot_password(client, client_id: str, username: str, client_secret: str = None):
    """
    Step 1: Trigger password reset. Cognito sends the user a confirmation code.
    Returns CodeDeliveryDetails (destination & delivery medium) on success.
    """
    # Normalize email to avoid typos (lowercase/trim)
    normalized_username = username.strip().lower()
    
    params = {"ClientId": client_id, "Username": normalized_username}
    if client_secret:
        params["SecretHash"] = _calculate_secret_hash(normalized_username, client_id, client_secret)

    logger.info(f"Starting forgot password process for user: {username}")

    try:
        resp = client.forgot_password(**params)
        delivery_details = resp.get("CodeDeliveryDetails", {})
        logger.info(f"Forgot password initiated successfully, delivery: {delivery_details}")
        return delivery_details
    except client.exceptions.UserNotFoundException:
        logger.warning(f"User not found for forgot password: {username}")
        # For security, treat as success so you don't reveal if the account exists.
        return {"DeliveryMedium": "UNKNOWN", "Destination": "hidden"}
    except client.exceptions.LimitExceededException:
        logger.warning(f"Rate limit exceeded for forgot password: {username}")
        raise Exception("Too many password reset requests. Please wait before trying again.")
    except client.exceptions.TooManyRequestsException:
        logger.warning(f"Too many requests for forgot password: {username}")
        raise Exception("Too many requests. Please wait a few minutes before trying again.")
    except Exception as e:
        logger.error(f"Forgot password failed for {username}: {e}")
        raise Exception(f"Failed to initiate password reset: {str(e)}")

def confirm_forgot_password(client, client_id: str, username: str, confirmation_code: str, new_password: str, client_secret: str = None):
    """
    Step 2: Confirm reset with the received code + new password.
    Returns True on success.
    """
    # Normalize email to avoid typos (lowercase/trim) - must match the original request
    normalized_username = username.strip().lower()
    
    params = {
        "ClientId": client_id,
        "Username": normalized_username,
        "ConfirmationCode": confirmation_code,
        "Password": new_password,
    }
    if client_secret:
        params["SecretHash"] = _calculate_secret_hash(normalized_username, client_id, client_secret)

    logger.info(f"Confirming forgot password for user: {username}")

    try:
        client.confirm_forgot_password(**params)
        logger.info(f"Forgot password confirmed successfully for user: {username}")
        return True
    except client.exceptions.CodeMismatchException:
        logger.warning(f"Invalid confirmation code for forgot password: {username}")
        raise Exception("The confirmation code is incorrect. Please try again.")
    except client.exceptions.ExpiredCodeException:
        logger.warning(f"Expired confirmation code for forgot password: {username}")
        raise Exception("The confirmation code has expired. Request a new one and try again.")
    except client.exceptions.InvalidPasswordException:
        logger.warning(f"Invalid password format for forgot password: {username}")
        raise Exception("New password doesn't meet the policy. Choose a stronger password.")
    except client.exceptions.TooManyFailedAttemptsException:
        logger.warning(f"Too many failed attempts for forgot password: {username}")
        raise Exception("Too many failed attempts. Wait a bit and try again.")
    except client.exceptions.UserNotFoundException:
        logger.warning(f"User not found during forgot password confirmation: {username}")
        # Keep responses generic to avoid user enumeration
        raise Exception("Unable to reset password for this account.")
    except Exception as e:
        logger.error(f"Forgot password confirmation failed for {username}: {e}")
        raise Exception(f"Failed to reset password: {str(e)}")

# ============================================================================
# USER ACTIVITY AND TEAM MEMBERS FUNCTIONS
# ============================================================================

# In-memory storage for user activity (in production, use Redis or database)
user_activity = {}

def update_user_activity(username: str):
    """Update user's last activity timestamp"""
    from datetime import datetime
    user_activity[username] = {
        'last_seen': datetime.utcnow(),
        'status': 'online'
    }
    logger.info(f"Updated activity for user: {username}")

def get_user_status(username: str):
    """Get user's current status based on last activity"""
    from datetime import datetime, timedelta
    
    if username not in user_activity:
        return 'offline'
    
    last_seen = user_activity[username]['last_seen']
    now = datetime.utcnow()
    time_diff = now - last_seen
    
    if time_diff.total_seconds() < 300:  # 5 minutes
        return 'online'
    elif time_diff.total_seconds() < 1800:  # 30 minutes
        return 'away'
    else:
        return 'offline'

def get_last_seen_text(username: str):
    """Get formatted last seen text"""
    from datetime import datetime, timedelta
    
    if username not in user_activity:
        return "Never"
    
    last_seen = user_activity[username]['last_seen']
    now = datetime.utcnow()
    time_diff = now - last_seen
    
    if time_diff.total_seconds() < 300:  # 5 minutes
        return "Online"
    elif time_diff.total_seconds() < 3600:  # 1 hour
        minutes = int(time_diff.total_seconds() / 60)
        return f"Last seen {minutes} minute{'s' if minutes != 1 else ''} ago"
    elif time_diff.total_seconds() < 86400:  # 24 hours
        hours = int(time_diff.total_seconds() / 3600)
        return f"Last seen {hours} hour{'s' if hours != 1 else ''} ago"
    else:
        days = int(time_diff.total_seconds() / 86400)
        return f"Last seen {days} day{'s' if days != 1 else ''} ago"

def list_cognito_users():
    """List all users from Cognito User Pool"""
    try:
        paginator = cognito_client.get_paginator('list_users')
        users = []
        
        for page in paginator.paginate(UserPoolId=USER_POOL_ID):
            for user in page['Users']:
                # Extract user attributes
                attributes = {}
                for attr in user.get('Attributes', []):
                    attributes[attr['Name']] = attr['Value']
                
                # Get display name with fallback
                display_name = (
                    attributes.get('preferred_username') or 
                    attributes.get('name') or 
                    attributes.get('given_name') or 
                    attributes.get('email') or 
                    user.get('Username', 'Unknown')
                )
                
                users.append({
                    'username': user.get('Username'),
                    'email': attributes.get('email', ''),
                    'display_name': display_name,
                    'status': user.get('UserStatus'),
                    'enabled': user.get('Enabled', True),
                    'created': user.get('UserCreateDate').isoformat() if user.get('UserCreateDate') else None,
                    'last_modified': user.get('UserLastModifiedDate').isoformat() if user.get('UserLastModifiedDate') else None,
                })
        
        return users
    except Exception as e:
        logger.error(f"Error listing Cognito users: {e}")
        return []

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
    """NEW IMPROVED AUTHENTICATION ENDPOINT using ChatGPT flow pattern"""
    if request.method == "OPTIONS":
        return handle_cors_preflight()

    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400
            
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            return jsonify({"detail": "Username and password are required"}), 400
        
        # Step 1: Initiate authentication using the new improved flow
        logger.info(f"=== Starting authentication flow for user: {username} ===")
        
        try:
            auth_response = initiate_authentication(
                cognito_client, CLIENT_ID, username, password, CLIENT_SECRET
            )
        except Exception as auth_error:
            logger.error(f"Authentication failed: {auth_error}")
            return jsonify({"detail": str(auth_error)}), 401
        
        # Step 2: Handle the response
        if "AuthenticationResult" in auth_response:
            # User is fully authenticated - return tokens
            logger.info("User fully authenticated - returning tokens")
            tokens = auth_response["AuthenticationResult"]
            return jsonify({
                "id_token": tokens.get("IdToken"),
                "access_token": tokens.get("AccessToken"),
                "refresh_token": tokens.get("RefreshToken"),
                "token_type": tokens.get("TokenType"),
                "expires_in": tokens.get("ExpiresIn")
            })
        
        elif auth_response.get("ChallengeName"):
            # User has a challenge to complete
            challenge_name = auth_response.get("ChallengeName")
            session = auth_response.get("Session")
            
            logger.info(f"Challenge required: {challenge_name}")
            
            return jsonify({
                "ChallengeName": challenge_name,
                "session": session,
                "mfa_required": challenge_name == "SOFTWARE_TOKEN_MFA"
            })
        
        else:
            logger.error("Unexpected authentication response - no result or challenge")
            return jsonify({"detail": "Unexpected authentication response"}), 500
            
    except Exception as e:
        logger.error(f"Error in authenticate endpoint: {e}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

@auth_services_routes.route("/respond-to-challenge", methods=["POST", "OPTIONS"])
def respond_to_challenge_endpoint():
    """NEW IMPROVED CHALLENGE RESPONSE ENDPOINT using ChatGPT flow pattern"""
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
        
        logger.info(f"=== Responding to {challenge_name} challenge for user: {username} ===")
        
        try:
            if challenge_name == "NEW_PASSWORD_REQUIRED":
                new_password = challenge_responses.get('NEW_PASSWORD')
                if not new_password:
                    return jsonify({"detail": "NEW_PASSWORD is required for this challenge"}), 400
                
                # Extract user attributes from challenge responses
                user_attributes = {}
                for key, value in challenge_responses.items():
                    if key.startswith('userAttributes.'):
                        # Remove the 'userAttributes.' prefix
                        attr_key = key.replace('userAttributes.', '')
                        user_attributes[attr_key] = value
                        logger.info(f"Extracted user attribute: {attr_key} = {value}")
                
                # Use the improved password challenge function with user attributes
                response = respond_to_new_password_challenge(
                    cognito_client, CLIENT_ID, username, new_password, session, 
                    user_attributes if user_attributes else None, CLIENT_SECRET
                )
                
            else:
                # For other challenges, fall back to the old method for now
                response = respond_to_auth_challenge(username, session, challenge_name, challenge_responses)
                if isinstance(response, tuple):
                    return jsonify(response[0]), response[1]
                return jsonify(response)
        
        except Exception as challenge_error:
            logger.error(f"Challenge response failed: {challenge_error}")
            return jsonify({"detail": str(challenge_error)}), 400
        
        # Handle the response
        if "AuthenticationResult" in response:
            # Challenge completed - return tokens
            logger.info("Challenge completed successfully - returning tokens")
            tokens = response["AuthenticationResult"]
            return jsonify({
                "id_token": tokens.get("IdToken"),
                "access_token": tokens.get("AccessToken"),
                "refresh_token": tokens.get("RefreshToken"),
                "token_type": tokens.get("TokenType"),
                "expires_in": tokens.get("ExpiresIn")
            })
        
        elif response.get("ChallengeName"):
            # Another challenge is required
            next_challenge = response.get("ChallengeName")
            new_session = response.get("Session")
            
            logger.info(f"Next challenge required: {next_challenge}")
            
            result = {
                "ChallengeName": next_challenge,
                "session": new_session,
                "mfa_required": next_challenge == "SOFTWARE_TOKEN_MFA"
            }
            
            # For MFA_SETUP challenge, get the secret
            if next_challenge == "MFA_SETUP":
                try:
                    secret_code, verify_session = associate_mfa_token(cognito_client, new_session)
                    result["secretCode"] = secret_code
                    result["session"] = verify_session  # Use the session from associate call
                    logger.info(f"MFA setup initiated, secret: {secret_code[:8]}...")
                except Exception as mfa_error:
                    logger.error(f"Failed to setup MFA: {mfa_error}")
                    return jsonify({"detail": f"MFA setup failed: {str(mfa_error)}"}), 500
            
            return jsonify(result)
        
        else:
            logger.error("Unexpected challenge response - no result or next challenge")
            return jsonify({"detail": "Unexpected challenge response"}), 500
            
    except Exception as e:
        logger.error(f"Error in challenge response endpoint: {e}")
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
        client_time_str = data.get('client_time')
        adjusted_time_str = data.get('adjusted_time')
        
        if not secret:
            return jsonify({
                "valid": False, 
                "error": "Missing secret",
                "server_time": datetime.now().isoformat()
            }), 400
        
        # Create a TOTP object with the secret
        totp = pyotp.TOTP(secret)
        current_time = time.time()
        current_code = totp.now()
        
        # Parse client time if provided
        client_time = None
        if client_time_str:
            try:
                client_time = datetime.fromisoformat(client_time_str.replace('Z', '+00:00'))
                logger.info(f"Client time parsed: {client_time.isoformat()}")
            except Exception as time_error:
                logger.warning(f"Could not parse client time: {time_error}")
        
        # Parse adjusted time if provided
        adjusted_time = None
        adjusted_code = None
        if adjusted_time_str:
            try:
                adjusted_time = datetime.fromisoformat(adjusted_time_str.replace('Z', '+00:00'))
                adjusted_code = totp.at(adjusted_time)
                logger.info(f"Adjusted time: {adjusted_time.isoformat()}, code: {adjusted_code}")
            except Exception as adj_error:
                logger.warning(f"Could not parse adjusted time: {adj_error}")
        
        # If no code is provided, just return the current valid code
        if not code:
            # Generate codes for multiple time windows
            codes = []
            now = datetime.now()
            
            for i in range(-5, 6):
                window_time = now + timedelta(seconds=30 * i)
                codes.append({
                    "window": i,
                    "code": totp.at(window_time),
                    "time": window_time.isoformat()
                })
            
            return jsonify({
                "valid": True,
                "current_code": current_code,
                "adjusted_code": adjusted_code,
                "timestamp": int(current_time),
                "time_window": f"{int(current_time) % 30}/30 seconds",
                "server_time": datetime.now().isoformat(),
                "time_windows": codes
            })
        
        # Verify the code with a window if provided
        is_valid = False
        if code:
            is_valid = totp.verify(code, valid_window=5)  # Allow 5 steps before/after for time sync issues
            
            # Also check if the code matches the adjusted time code
            is_valid_adjusted = adjusted_code and code == adjusted_code
            
            is_valid = is_valid or is_valid_adjusted
        else:
            is_valid = True  # If no code is provided, we skip verification
        
        return jsonify({
            "valid": is_valid,
            "provided_code": code if code else "Not provided",
            "current_code": current_code,
            "adjusted_code": adjusted_code,
            "timestamp": int(current_time),
            "time_window": f"{int(current_time) % 30}/30 seconds",
            "server_time": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error in test_mfa_code_endpoint: {e}")
        return jsonify({
            "valid": False, 
            "error": str(e),
            "server_time": datetime.now().isoformat()
        }), 500

# NEW IMPROVED MFA SETUP CONFIRMATION using ChatGPT flow pattern
@auth_services_routes.route("/confirm-mfa-setup", methods=["POST", "OPTIONS"])
def confirm_mfa_setup_endpoint():
    """NEW IMPROVED MFA SETUP CONFIRMATION using ChatGPT flow pattern"""
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400
            
        username = data.get('username')
        session = data.get('session')
        code = data.get('code')
        
        # Validate required fields
        if not all([username, session, code]):
            missing = [field for field, value in [('username', username), ('session', session), ('code', code)] if not value]
            return jsonify({"detail": f"Missing required fields: {', '.join(missing)}"}), 400
        
        # Validate code format
        if not code.isdigit() or len(code) != 6:
            return jsonify({"detail": "MFA code must be exactly 6 digits"}), 400
        
        logger.info(f"=== MFA setup confirmation for user: {username} with code: {code} ===")
        
        try:
            # Step 1: Verify the MFA token using the session from associate_mfa_token
            logger.info("Step 1: Verifying MFA token")
            session_after_verify = verify_mfa_token(cognito_client, session, code)
            
            # Step 2: Complete the MFA setup challenge to finalize authentication
            logger.info("Step 2: Completing MFA setup challenge")
            auth_result = respond_to_mfa_challenge(
                cognito_client, CLIENT_ID, username, session_after_verify, 
                mfa_code=None, client_secret=CLIENT_SECRET
            )
            
            # Step 3: Set MFA preference to enable TOTP for future logins
            logger.info("Step 3: Setting MFA preference")
            try:
                cognito_client.admin_set_user_mfa_preference(
                    UserPoolId=USER_POOL_ID,
                    Username=username,
                    SoftwareTokenMfaSettings={
                        'Enabled': True,
                        'PreferredMfa': True
                    }
                )
                logger.info("MFA preference set successfully")
            except Exception as pref_error:
                logger.warning(f"MFA preference setting failed: {pref_error}")
                # Don't fail the entire flow - user can still login
            
            # Success - return the authentication tokens
            logger.info("MFA setup completed successfully - returning tokens")
            return jsonify({
                "id_token": auth_result.get("IdToken"),
                "access_token": auth_result.get("AccessToken"),
                "refresh_token": auth_result.get("RefreshToken"),
                "token_type": auth_result.get("TokenType"),
                "expires_in": auth_result.get("ExpiresIn"),
                "message": "MFA setup completed successfully",
                "status": "SUCCESS"
            }), 200
            
        except Exception as setup_error:
            logger.error(f"MFA setup failed: {setup_error}")
            return jsonify({"detail": str(setup_error)}), 400
            
    except Exception as e:
        logger.error(f"Error in MFA setup confirmation endpoint: {e}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

@auth_services_routes.route("/verify-mfa", methods=["POST", "OPTIONS"])
def verify_mfa_endpoint():
    """NEW IMPROVED MFA VERIFICATION using ChatGPT flow pattern"""
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400
        
        session = data.get('session')
        code = data.get('code')
        username = data.get('username')
        
        # Validate required fields
        if not all([session, username, code]):
            missing = [field for field, value in [('session', session), ('username', username), ('code', code)] if not value]
            return jsonify({"detail": f"Missing required fields: {', '.join(missing)}"}), 400
        
        # Validate code format
        if not code.isdigit() or len(code) != 6:
            return jsonify({"detail": "MFA code must be exactly 6 digits"}), 400
        
        logger.info(f"=== MFA verification for user: {username} with code: {code} ===")
        
        try:
            # Use the improved MFA challenge response function
            auth_result = respond_to_mfa_challenge(
                cognito_client, CLIENT_ID, username, session, 
                mfa_code=code, client_secret=CLIENT_SECRET
            )
            
            # Return the authentication tokens
            logger.info("MFA verification successful - returning tokens")
            return jsonify({
                "id_token": auth_result.get("IdToken"),
                "access_token": auth_result.get("AccessToken"),
                "refresh_token": auth_result.get("RefreshToken"),
                "token_type": auth_result.get("TokenType"),
                "expires_in": auth_result.get("ExpiresIn")
            })
            
        except Exception as mfa_error:
            logger.error(f"MFA verification failed: {mfa_error}")
            return jsonify({"detail": str(mfa_error)}), 400
            
    except Exception as e:
        logger.error(f"Error in MFA verification endpoint: {e}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500


# NEW IMPROVED FORGOT PASSWORD ENDPOINT using ChatGPT pattern
@auth_services_routes.route("/forgot-password", methods=["POST", "OPTIONS"])
def forgot_password_endpoint():
    """NEW IMPROVED FORGOT PASSWORD INITIATION using ChatGPT pattern"""
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400
            
        username = data.get('username')
        
        if not username:
            return jsonify({"detail": "Email address is required"}), 400
            
        logger.info(f"=== Starting forgot password for user: {username} ===")
        
        try:
            # Use the improved forgot password function
            delivery_details = start_forgot_password(
                cognito_client, CLIENT_ID, username, CLIENT_SECRET
            )
            
            # Always return success message for security (don't reveal if user exists)
            return jsonify({
                "message": "If an account with this email exists, you will receive a password reset code shortly.",
                "delivery": delivery_details
            })
            
        except Exception as forgot_error:
            logger.error(f"Forgot password failed: {forgot_error}")
            return jsonify({"detail": str(forgot_error)}), 400
            
    except Exception as e:
        logger.error(f"Error in forgot password endpoint: {e}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

# NEW IMPROVED CONFIRM FORGOT PASSWORD ENDPOINT using ChatGPT pattern
@auth_services_routes.route("/confirm-forgot-password", methods=["POST", "OPTIONS"])
def confirm_forgot_password_endpoint():
    """NEW IMPROVED FORGOT PASSWORD CONFIRMATION using ChatGPT pattern"""
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400
            
        username = data.get('username')
        confirmation_code = data.get('code')
        new_password = data.get('password')
        
        if not all([username, confirmation_code, new_password]):
            missing = [field for field, value in [('username', username), ('code', confirmation_code), ('password', new_password)] if not value]
            return jsonify({"detail": f"Missing required fields: {', '.join(missing)}"}), 400
        
        logger.info(f"=== Confirming forgot password for user: {username} ===")
        
        try:
            # Use the improved confirm forgot password function
            success = confirm_forgot_password(
                cognito_client, CLIENT_ID, username, confirmation_code, new_password, CLIENT_SECRET
            )
            
            if success:
                logger.info("Password reset completed successfully")
                return jsonify({
                    "message": "Password has been reset successfully. You can now log in with your new password."
                })
            else:
                logger.error("Forgot password confirmation returned False")
                return jsonify({"detail": "Failed to reset password"}), 500
                
        except Exception as confirm_error:
            logger.error(f"Forgot password confirmation failed: {confirm_error}")
            return jsonify({"detail": str(confirm_error)}), 400
            
    except Exception as e:
        logger.error(f"Error in confirm forgot password endpoint: {e}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

# TEAM MEMBERS AND ACTIVITY TRACKING ENDPOINTS
@auth_services_routes.route("/team-members", methods=["GET", "OPTIONS"])
def get_team_members():
    """Get list of team members with their activity status"""
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    try:
        # Get all Cognito users
        users = list_cognito_users()
        
        # Add activity status to each user
        team_members = []
        for user in users:
            if user['enabled'] and user['status'] in ['CONFIRMED', 'FORCE_CHANGE_PASSWORD']:
                username = user['email'] or user['username']  # Use email as identifier
                
                team_member = {
                    'id': user['username'],
                    'name': user['display_name'],
                    'email': user['email'],
                    'avatar': ''.join([word[0].upper() for word in user['display_name'].split()[:2]]),
                    'status': get_user_status(username),
                    'last_seen': get_last_seen_text(username),
                    'created': user['created'],
                }
                team_members.append(team_member)
        
        # Sort by status priority (online, away, offline) then by name
        status_priority = {'online': 0, 'away': 1, 'offline': 2}
        team_members.sort(key=lambda x: (status_priority.get(x['status'], 3), x['name']))
        
        logger.info(f"Retrieved {len(team_members)} team members")
        return jsonify({
            "team_members": team_members,
            "total": len(team_members)
        })
        
    except Exception as e:
        logger.error(f"Error getting team members: {e}")
        return jsonify({"detail": f"Failed to get team members: {str(e)}"}), 500

@auth_services_routes.route("/activity/heartbeat", methods=["POST", "OPTIONS"])
def update_activity():
    """Update user's activity timestamp (heartbeat)"""
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    try:
        # Get username from JWT token or request body
        auth_header = request.headers.get('Authorization')
        username = None
        
        if auth_header and auth_header.startswith('Bearer '):
            try:
                token = auth_header.split(' ')[1]
                payload = __import__('jwt').decode(token, options={"verify_signature": False})
                username = payload.get('email') or payload.get('username')
            except Exception as token_error:
                logger.warning(f"Could not decode token for activity update: {token_error}")
        
        # Fallback to request body
        if not username:
            data = request.json or {}
            username = data.get('username')
        
        if not username:
            return jsonify({"detail": "Username required for activity tracking"}), 400
        
        # Update activity
        update_user_activity(username)
        
        return jsonify({
            "message": "Activity updated",
            "username": username,
            "status": get_user_status(username)
        })
        
    except Exception as e:
        logger.error(f"Error updating user activity: {e}")
        return jsonify({"detail": f"Failed to update activity: {str(e)}"}), 500

# USER PROFILE ENDPOINT
@auth_services_routes.route("/me", methods=["GET", "OPTIONS"])
def get_current_user():
    """Get current user information from access token"""
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    try:
        # Get access token from Authorization header
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"detail": "Authorization token required"}), 401
        
        access_token = auth_header.split(' ')[1]
        
        # Decode the access token to get username
        try:
            payload = __import__('jwt').decode(access_token, options={"verify_signature": False})
            username = payload.get('username') or payload.get('email')
            if not username:
                return jsonify({"detail": "Invalid token: no username found"}), 401
        except Exception as token_error:
            logger.error(f"Failed to decode access token: {token_error}")
            return jsonify({"detail": "Invalid access token"}), 401
        
        # Get user details from Cognito
        try:
            response = cognito_client.admin_get_user(
                UserPoolId=USER_POOL_ID,
                Username=username
            )
            
            # Extract user attributes
            attributes = {}
            for attr in response.get('UserAttributes', []):
                attributes[attr['Name']] = attr['Value']
            
            # Build user info response
            user_info = {
                'username': username,
                'email': attributes.get('email', ''),
                'preferred_username': attributes.get('preferred_username', ''),
                'name': attributes.get('name', ''),
                'given_name': attributes.get('given_name', ''),
                'family_name': attributes.get('family_name', ''),
                'display_name': (
                    attributes.get('preferred_username') or 
                    attributes.get('name') or 
                    attributes.get('given_name') or 
                    attributes.get('email') or 
                    username
                ),
                'user_status': response.get('UserStatus'),
                'enabled': response.get('Enabled', True),
            }
            
            return jsonify(user_info)
            
        except cognito_client.exceptions.UserNotFoundException:
            logger.warning(f"User not found: {username}")
            return jsonify({"detail": "User not found"}), 404
        except Exception as cognito_error:
            logger.error(f"Failed to get user from Cognito: {cognito_error}")
            return jsonify({"detail": "Failed to get user information"}), 500
        
    except Exception as e:
        logger.error(f"Error in get current user endpoint: {e}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

# Helper endpoint to get server time
@auth_services_routes.route("/server-time", methods=["GET"])
def server_time_endpoint():
    current_time = datetime.now()
    timestamp = int(time.time())
    return jsonify({
        "server_time": current_time.isoformat(),
        "timestamp": timestamp,
        "time_window": f"{timestamp % 30}/30 seconds"
    })

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
        "environment": os.environ.get("FLASK_ENV", "production"),
        "server_time": datetime.now().isoformat()
    }), 200