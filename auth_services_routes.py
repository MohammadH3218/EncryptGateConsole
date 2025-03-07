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

# Enhanced Logging Configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create a dedicated debug logger for MFA operations
debug_logger = logging.getLogger('cognito_mfa_debug')
debug_logger.setLevel(logging.DEBUG)

# Create a file handler for detailed logs
file_handler = logging.FileHandler('/tmp/cognito_mfa_debug.log')
file_handler.setLevel(logging.DEBUG)

# Create a formatter that includes all details
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
file_handler.setFormatter(formatter)
debug_logger.addHandler(file_handler)

# Also log to console for immediate feedback
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
        
        debug_logger.debug(f"Generated secret hash for {username} with first 10 chars: {hash_result[:10]}...")
        return hash_result
    except Exception as e:
        logger.error(f"Error generating client secret hash: {e}")
        debug_logger.error(f"Secret hash generation failed: {e}\n{traceback.format_exc()}")
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
        debug_logger.error(f"QR code generation failed: {e}\n{traceback.format_exc()}")
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
        debug_logger.debug(f"TOTP Debug Info:")
        debug_logger.debug(f"Secret code: {secret_code}")
        debug_logger.debug(f"User provided code: {user_code}")
        debug_logger.debug(f"Current expected code: {current_code}")
        debug_logger.debug(f"Previous window code: {previous_code}")
        debug_logger.debug(f"Next window code: {next_code}")
        debug_logger.debug(f"Direct verification result: {is_valid}")
        debug_logger.debug(f"Current timestamp: {int(time.time())}")
        debug_logger.debug(f"Seconds into current window: {int(time.time()) % 30}")
        debug_logger.debug(f"Seconds until next window: {30 - (int(time.time()) % 30)}")
        
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
        debug_logger.error(f"Error in TOTP verification: {e}\n{traceback.format_exc()}")
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
    debug_logger.info(f"Authentication attempt initiated for: {username}")
    
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
            debug_logger.info(f"Calling initiate_auth with username: {username}")
            start_time = time.time()
            
            response = cognito_client.initiate_auth(
                ClientId=CLIENT_ID,
                AuthFlow="USER_PASSWORD_AUTH",
                AuthParameters={
                    "USERNAME": username,
                    "PASSWORD": password,
                    "SECRET_HASH": secret_hash,
                },
            )
            
            api_call_time = time.time() - start_time
            logger.info(f"Cognito authentication response received - keys: {list(response.keys())}")
            debug_logger.info(f"initiate_auth call completed in {api_call_time:.2f} seconds with response keys: {list(response.keys())}")
        except cognito_client.exceptions.NotAuthorizedException as auth_error:
            logger.warning(f"Authentication failed: Invalid credentials")
            debug_logger.warning(f"NotAuthorizedException: {auth_error}")
            return {"detail": "Invalid username or password."}, 401
        except cognito_client.exceptions.UserNotFoundException as user_error:
            logger.warning(f"Authentication failed: User not found")
            debug_logger.warning(f"UserNotFoundException: {user_error}")
            return {"detail": "Invalid username or password."}, 401  # Same error for security
        except botocore.exceptions.ClientError as client_error:
            error_code = client_error.response['Error']['Code']
            error_message = client_error.response['Error']['Message']
            logger.error(f"AWS ClientError: {error_code} - {error_message}")
            debug_logger.error(f"AWS ClientError in authentication: {error_code} - {error_message}")
            return {"detail": f"Authentication failed: {error_message}"}, 500
        except Exception as api_error:
            logger.error(f"Cognito API call failed: {api_error}")
            debug_logger.error(f"Cognito API call failed: {api_error}\n{traceback.format_exc()}")
            return {"detail": f"Authentication failed: {str(api_error)}"}, 500

        # Process auth result
        auth_result = response.get("AuthenticationResult")
        if not auth_result:
            # Check for challenges
            challenge_name = response.get("ChallengeName")
            if challenge_name:
                logger.info(f"Authentication challenge required: {challenge_name}")
                debug_logger.info(f"Authentication challenge received: {challenge_name}")
                
                # Return challenge details
                response_data = {
                    "ChallengeName": challenge_name,
                    "session": response.get("Session"),
                    "mfa_required": challenge_name == "SOFTWARE_TOKEN_MFA"
                }
                
                return response_data
            else:
                logger.error("No AuthenticationResult or ChallengeName in response")
                debug_logger.error(f"Invalid authentication response - no AuthenticationResult or ChallengeName. Response keys: {list(response.keys())}")
                return {"detail": "Invalid authentication response"}, 500
        
        # Return successful result
        logger.info("Authentication successful")
        debug_logger.info(f"Authentication successful for {username}")
        return {
            "id_token": auth_result.get("IdToken"),
            "access_token": auth_result.get("AccessToken"),
            "refresh_token": auth_result.get("RefreshToken"),
            "token_type": auth_result.get("TokenType"),
            "expires_in": auth_result.get("ExpiresIn"),
        }

    except Exception as e:
        logger.error(f"Unhandled error during authentication: {e}")
        debug_logger.error(f"Unhandled error during authentication: {e}\n{traceback.format_exc()}")
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
    debug_logger.info(f"Responding to {challenge_name} challenge for user: {username}")
    
    try:
        # Generate secret hash
        try:
            secret_hash = generate_client_secret_hash(username)
        except Exception as hash_error:
            logger.error(f"Failed to generate secret hash: {hash_error}")
            debug_logger.error(f"Secret hash generation failed: {hash_error}")
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
        debug_logger.info(f"Sending challenge response: {safe_responses}")
        
        # Measure API call time
        start_time = time.time()
        
        # Make the API call
        try:
            response = cognito_client.respond_to_auth_challenge(
                ClientId=CLIENT_ID,
                ChallengeName=challenge_name,
                Session=session,
                ChallengeResponses=challenge_responses_with_auth
            )
            
            api_call_time = time.time() - start_time
            logger.info(f"Challenge response received - keys: {list(response.keys())}")
            debug_logger.info(f"respond_to_auth_challenge call completed in {api_call_time:.2f} seconds with response keys: {list(response.keys())}")
        except Exception as api_error:
            logger.error(f"Cognito API call failed: {api_error}")
            debug_logger.error(f"respond_to_auth_challenge API call failed: {api_error}\n{traceback.format_exc()}")
            return {"detail": f"Challenge response failed: {str(api_error)}"}, 500
        
        # Process response
        auth_result = response.get("AuthenticationResult")
        if auth_result:
            # Authentication completed successfully
            logger.info(f"Challenge {challenge_name} completed successfully")
            debug_logger.info(f"Challenge {challenge_name} completed successfully for {username}")
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
            debug_logger.info(f"Next challenge required: {next_challenge}")
            
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
                debug_logger.info(f"Generated MFA secret for setup: {mfa_secret}")
                
            return response_data
        
        # If we get here, something unexpected happened
        logger.error("No AuthenticationResult or ChallengeName in response")
        debug_logger.error(f"Invalid challenge response - no AuthenticationResult or ChallengeName. Response keys: {list(response.keys())}")
        return {"detail": "Invalid challenge response"}, 500
        
    except cognito_client.exceptions.InvalidPasswordException as pwd_error:
        logger.warning(f"Invalid password format")
        debug_logger.warning(f"InvalidPasswordException: {pwd_error}")
        return {"detail": f"Password does not meet requirements: {str(pwd_error)}"}, 400
        
    except cognito_client.exceptions.CodeMismatchException as code_error:
        logger.warning(f"CodeMismatchException: Invalid verification code: {str(code_error)}")
        debug_logger.warning(f"CodeMismatchException: {code_error}")
        return {"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}, 400
        
    except botocore.exceptions.ClientError as client_error:
        error_code = client_error.response['Error']['Code']
        error_message = client_error.response['Error']['Message']
        logger.error(f"AWS ClientError: {error_code} - {error_message}")
        debug_logger.error(f"AWS ClientError in challenge response: {error_code} - {error_message}")
        return {"detail": f"Challenge response failed: {error_message}"}, 500
        
    except Exception as e:
        logger.error(f"Challenge response error: {e}\n{traceback.format_exc()}")
        debug_logger.error(f"Unhandled error in challenge response: {e}\n{traceback.format_exc()}")
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
    debug_logger.info("MFA setup requested with access token")
    
    try:
        # Validate token format
        if not access_token or not isinstance(access_token, str) or len(access_token) < 20:
            mfa_logger.error(f"Invalid access token format: {type(access_token)}")
            debug_logger.error(f"Invalid access token format: {type(access_token)}, length: {len(access_token) if isinstance(access_token, str) else 'N/A'}")
            return {"detail": "Invalid access token format"}, 400
            
        try:
            # Get user details first to validate token and get username
            debug_logger.info("Attempting to get user details to validate token")
            user_response = cognito_client.get_user(
                AccessToken=access_token
            )
            username = user_response.get("Username", "user")
            mfa_logger.info(f"Retrieved username: {username} from access token")
            debug_logger.info(f"Retrieved username: {username}, token appears valid")
        except Exception as user_error:
            mfa_logger.error(f"Failed to get user details: {user_error}")
            debug_logger.error(f"Failed to get user details: {user_error}\n{traceback.format_exc()}")
            return {"detail": f"Invalid access token: {str(user_error)}"}, 401
            
        # Make the API call to associate software token
        try:
            debug_logger.info("Calling associate_software_token API")
            start_time = time.time()
            
            associate_response = cognito_client.associate_software_token(
                AccessToken=access_token
            )
            
            api_call_time = time.time() - start_time
            mfa_logger.info("Software token association successful")
            debug_logger.info(f"associate_software_token call completed in {api_call_time:.2f} seconds")
        except botocore.exceptions.ClientError as client_error:
            error_code = client_error.response['Error']['Code']
            error_message = client_error.response['Error']['Message']
            mfa_logger.error(f"AWS ClientError: {error_code} - {error_message}")
            debug_logger.error(f"AWS ClientError in associate_software_token: {error_code} - {error_message}")
            return {"detail": f"MFA setup failed: {error_message}"}, 500
        except Exception as assoc_error:
            mfa_logger.error(f"Failed to associate software token: {assoc_error}")
            debug_logger.error(f"Failed to associate software token: {assoc_error}\n{traceback.format_exc()}")
            return {"detail": f"MFA setup failed: {str(assoc_error)}"}, 500
        
        # Get the secret code
        secret_code = associate_response.get("SecretCode")
        if not secret_code:
            mfa_logger.error("No secret code in response")
            debug_logger.error(f"No secret code in associate_software_token response. Response keys: {list(associate_response.keys())}")
            return {"detail": "Failed to generate MFA secret code"}, 500
        
        mfa_logger.info(f"Generated secret code: {secret_code}")
        debug_logger.info(f"Secret code generated: {secret_code}")
        
        # Generate QR code
        qr_code = generate_qr_code(secret_code, username)
        if not qr_code:
            mfa_logger.warning("Failed to generate QR code, continuing with text secret only")
            debug_logger.warning("QR code generation failed, continuing with text secret only")
        
        # Verify the secret is in correct Base32 format
        try:
            # Basic validation that the secret is valid Base32
            if not all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567' for c in secret_code):
                mfa_logger.warning(f"Secret code is not valid Base32 format: {secret_code}")
                debug_logger.warning(f"Secret code may not be valid Base32 format: {secret_code}")
            else:
                debug_logger.info("Secret code is valid Base32 format")
        except Exception as format_error:
            mfa_logger.warning(f"Error validating secret format: {format_error}")
            debug_logger.warning(f"Error validating secret format: {format_error}")
        
        # Generate a test TOTP code to validate the secret works
        try:
            totp = pyotp.TOTP(secret_code)
            test_code = totp.now()
            mfa_logger.info(f"Generated test TOTP code: {test_code} for verification")
            debug_logger.info(f"Current TOTP code for this secret would be: {test_code}")
            debug_logger.info(f"TOTP time info: window={totp.interval}s, current_position={int(time.time()) % 30}s, next_code_in={30 - (int(time.time()) % 30)}s")
        except Exception as totp_error:
            mfa_logger.error(f"Failed to generate test TOTP code: {totp_error}")
            debug_logger.error(f"Failed to generate test TOTP code: {totp_error}")
        
        return {
            "secretCode": secret_code,
            "qrCodeImage": qr_code,
            "message": "MFA setup initiated successfully",
            "username": username  # Include username for better frontend experience
        }
        
    except Exception as e:
        mfa_logger.error(f"Error setting up MFA: {e}\n{traceback.format_exc()}")
        debug_logger.error(f"Unhandled error in MFA setup: {e}\n{traceback.format_exc()}")
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
    debug_logger.info("=== Starting MFA Setup Verification ===")
    debug_logger.info(f"Verifying MFA setup with code: {code}")
    
    # Input validation
    if not code or not isinstance(code, str):
        mfa_logger.error(f"Invalid code format: {type(code)}")
        debug_logger.error(f"Invalid code format: {type(code)}")
        return {"detail": "Verification code must be a 6-digit number"}, 400
        
    # Ensure code is exactly 6 digits
    code = code.strip()
    if not code.isdigit() or len(code) != 6:
        mfa_logger.error(f"Invalid code format: {code}")
        debug_logger.error(f"Invalid code format: {code}")
        return {"detail": "Verification code must be exactly 6 digits"}, 400
    
    try:
        # Validate token format
        if not access_token or not isinstance(access_token, str) or len(access_token) < 20:
            debug_logger.error(f"Invalid access token format: {type(access_token)}, length: {len(access_token) if isinstance(access_token, str) else 'N/A'}")
            return {"detail": "Invalid access token format"}, 400
            
        # Get user info for logging
        try:
            user_info = cognito_client.get_user(AccessToken=access_token)
            username = user_info.get("Username", "unknown")
            mfa_logger.info(f"Verifying MFA setup for user: {username}")
            debug_logger.info(f"Retrieved username: {username}, token appears valid")
        except Exception as user_error:
            mfa_logger.warning(f"Could not get username: {user_error}")
            debug_logger.warning(f"Could not get username: {user_error}")
            username = "unknown"
        
        # Try to get the secret code from the user's MFA settings for debugging
        try:
            # This call fails if no MFA is associated - just for debugging
            mfa_settings = cognito_client.get_user_mfa_setting(AccessToken=access_token)
            mfa_logger.debug(f"Current MFA settings: {mfa_settings}")
            debug_logger.debug(f"Current MFA settings: {json.dumps(mfa_settings)}")
        except Exception as mfa_error:
            # Expected to fail if no MFA is set up yet
            debug_logger.info(f"No existing MFA settings found, which is expected for initial setup: {str(mfa_error)}")
        
        # Log timing information for TOTP window
        try:
            current_time = int(time.time())
            totp_step = 30  # Standard TOTP time step
            current_window = current_time // totp_step
            seconds_in_window = current_time % totp_step
            seconds_remaining = totp_step - seconds_in_window
            
            debug_logger.info(f"TOTP timing information:")
            debug_logger.info(f"  - Server timestamp: {current_time} ({datetime.fromtimestamp(current_time).strftime('%Y-%m-%d %H:%M:%S')})")
            debug_logger.info(f"  - Current TOTP window: {current_window}")
            debug_logger.info(f"  - Position in window: {seconds_in_window}/{totp_step}s")
            debug_logger.info(f"  - Time until next window: {seconds_remaining}s")
        except Exception as time_error:
            debug_logger.warning(f"Error calculating TOTP timing: {time_error}")
            
        # Make the API call to verify software token
        mfa_logger.info(f"Calling verify_software_token with code: {code}")
        debug_logger.info(f"Calling verify_software_token for user {username} with code {code}")
        
        start_time = time.time()
        
        try:
            response = cognito_client.verify_software_token(
                AccessToken=access_token,
                UserCode=code,
                FriendlyDeviceName="EncryptGate Auth App"
            )
            
            api_call_time = time.time() - start_time
            debug_logger.info(f"verify_software_token call completed in {api_call_time:.2f} seconds")
            
            # Check the status
            status = response.get("Status")
            mfa_logger.info(f"MFA verification status: {status}")
            debug_logger.info(f"MFA verification status: {status}")
            
            if status == "SUCCESS":
                # Set the user's MFA preference to require TOTP
                try:
                    mfa_logger.info("Setting MFA preference")
                    debug_logger.info("Setting MFA preference to enable TOTP")
                    
                    pref_response = cognito_client.set_user_mfa_preference(
                        AccessToken=access_token,
                        SoftwareTokenMfaSettings={
                            "Enabled": True,
                            "PreferredMfa": True
                        }
                    )
                    mfa_logger.info("MFA preference set successfully")
                    debug_logger.info(f"MFA preference set successfully: {json.dumps(pref_response)}")
                except Exception as pref_error:
                    mfa_logger.warning(f"MFA verified but couldn't set preference: {pref_error}")
                    debug_logger.warning(f"MFA verified but couldn't set preference: {pref_error}\n{traceback.format_exc()}")
                    # Continue anyway since the token was verified
                
                debug_logger.info("=== MFA Setup Verification Completed Successfully ===")
                return {
                    "message": "MFA setup verified successfully",
                    "status": status
                }
            else:
                mfa_logger.warning(f"Verification returned non-SUCCESS status: {status}")
                debug_logger.warning(f"Verification returned non-SUCCESS status: {status}")
                return {"detail": f"MFA verification failed with status: {status}"}, 400
            
        except cognito_client.exceptions.EnableSoftwareTokenMFAException as e:
            mfa_logger.error(f"Error enabling MFA: {e}")
            debug_logger.error(f"EnableSoftwareTokenMFAException: {e}")
            return {"detail": "Error enabling MFA. Try again or contact support."}, 400
            
        except cognito_client.exceptions.CodeMismatchException as code_error:
            end_time = time.time()
            mfa_logger.warning(f"CodeMismatchException: {code_error}")
            debug_logger.warning(f"CodeMismatchException: {code_error}")
            debug_logger.info(f"API call time to failure: {end_time - start_time:.2f} seconds")
            
            # Try to get the secret code for debugging current TOTP
            try:
                debug_logger.info("Attempting to associate new token for debugging")
                assoc_response = cognito_client.associate_software_token(
                    AccessToken=access_token
                )
                debug_secret = assoc_response.get("SecretCode")
                
                if debug_secret:
                    debug_info = debug_totp_verification(debug_secret, code)
                    debug_logger.info(f"TOTP Debug Info for code mismatch:")
                    debug_logger.info(f"  New secret: {debug_secret}")
                    for key, value in debug_info.items():
                        debug_logger.info(f"  - {key}: {value}")
                else:
                    debug_logger.warning("Could not get debug secret for TOTP verification")
            except Exception as debug_error:
                debug_logger.error(f"Failed to get debug info: {debug_error}")
            
            debug_logger.info("=== MFA Setup Verification Failed with CodeMismatchException ===")
            return {"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}, 400
            
        except botocore.exceptions.ClientError as client_error:
            error_code = client_error.response['Error']['Code']
            error_message = client_error.response['Error']['Message']
            mfa_logger.error(f"AWS ClientError: {error_code} - {error_message}")
            debug_logger.error(f"AWS ClientError in verify_software_token: {error_code} - {error_message}")
            return {"detail": f"MFA verification failed: {error_message}"}, 500
            
    except Exception as e:
        mfa_logger.error(f"Error verifying MFA setup: {e}\n{traceback.format_exc()}")
        debug_logger.error(f"Unhandled error in MFA verification: {e}\n{traceback.format_exc()}")
        debug_logger.info("=== MFA Setup Verification Failed with Exception ===")
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
    debug_logger.info(f"MFA verification initiated for user: {username} with code: {code}")
    
    # Input validation
    if not code or not isinstance(code, str):
        logger.error(f"Invalid code format: {type(code)}")
        debug_logger.error(f"Invalid code format: {type(code)}")
        return {"detail": "Verification code must be a 6-digit number"}, 400
        
    # Ensure code is exactly 6 digits
    code = code.strip()
    if not code.isdigit() or len(code) != 6:
        logger.error(f"Invalid code format: {code}")
        debug_logger.error(f"Invalid code format: {code}")
        return {"detail": "Verification code must be exactly 6 digits"}, 400
    
    # Validate session format
    if not session or not isinstance(session, str) or len(session) < 20:
        debug_logger.error(f"Invalid session format: {type(session)}, length: {len(session) if isinstance(session, str) else 'N/A'}")
        return {"detail": "Invalid session format"}, 400
    
    try:
        # Generate secret hash
        try:
            secret_hash = generate_client_secret_hash(username)
        except Exception as hash_error:
            logger.error(f"Failed to generate secret hash for MFA: {hash_error}")
            debug_logger.error(f"Failed to generate secret hash for MFA: {hash_error}")
            return {"detail": "MFA verification failed: Unable to generate credentials"}, 500
        
        # Prepare challenge responses    
        challenge_responses = {
            "USERNAME": username,
            "SOFTWARE_TOKEN_MFA_CODE": code,
            "SECRET_HASH": secret_hash
        }
        
        logger.info(f"Sending MFA verification with code: {code}")
        debug_logger.info(f"Sending MFA verification with code: {code}")
        
        # Log timing information for TOTP window
        try:
            current_time = int(time.time())
            totp_step = 30  # Standard TOTP time step
            current_window = current_time // totp_step
            seconds_in_window = current_time % totp_step
            seconds_remaining = totp_step - seconds_in_window
            
            debug_logger.info(f"TOTP timing information:")
            debug_logger.info(f"  - Server timestamp: {current_time} ({datetime.fromtimestamp(current_time).strftime('%Y-%m-%d %H:%M:%S')})")
            debug_logger.info(f"  - Current TOTP window: {current_window}")
            debug_logger.info(f"  - Position in window: {seconds_in_window}/{totp_step}s")
            debug_logger.info(f"  - Time until next window: {seconds_remaining}s")
        except Exception as time_error:
            debug_logger.warning(f"Error calculating TOTP timing: {time_error}")
        
        # Measure API call time
        start_time = time.time()
        
        # Make the API call
        try:
            response = cognito_client.respond_to_auth_challenge(
                ClientId=CLIENT_ID,
                ChallengeName="SOFTWARE_TOKEN_MFA",
                Session=session,
                ChallengeResponses=challenge_responses
            )
            
            api_call_time = time.time() - start_time
            logger.info(f"MFA verification response received - keys: {list(response.keys())}")
            debug_logger.info(f"respond_to_auth_challenge call completed in {api_call_time:.2f} seconds with response keys: {list(response.keys())}")
        except Exception as api_error:
            logger.error(f"Cognito API call failed: {api_error}")
            debug_logger.error(f"respond_to_auth_challenge API call failed: {api_error}\n{traceback.format_exc()}")
            return {"detail": f"MFA verification failed: {str(api_error)}"}, 500
        
        auth_result = response.get("AuthenticationResult")
        if not auth_result:
            logger.error("No AuthenticationResult in MFA response")
            debug_logger.error(f"Invalid MFA response - no AuthenticationResult. Response keys: {list(response.keys())}")
            return {"detail": "Invalid MFA response from server"}, 500
            
        logger.info("MFA verification successful")
        debug_logger.info(f"MFA verification successful for user: {username}")
        return {
            "id_token": auth_result.get("IdToken"),
            "access_token": auth_result.get("AccessToken"),
            "refresh_token": auth_result.get("RefreshToken"),
            "token_type": auth_result.get("TokenType"),
            "expires_in": auth_result.get("ExpiresIn"),
        }
        
    except cognito_client.exceptions.CodeMismatchException as code_error:
        logger.warning(f"MFA code mismatch: {code_error}")
        debug_logger.warning(f"MFA code mismatch: {code_error}")
        return {"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}, 400
        
    except cognito_client.exceptions.ExpiredCodeException as expired_error:
        logger.warning(f"MFA code expired: {expired_error}")
        debug_logger.warning(f"MFA code expired: {expired_error}")
        return {"detail": "The verification code has expired. Please generate a new code from your authenticator app."}, 400
        
    except botocore.exceptions.ClientError as client_error:
        error_code = client_error.response['Error']['Code']
        error_message = client_error.response['Error']['Message']
        logger.error(f"AWS ClientError: {error_code} - {error_message}")
        debug_logger.error(f"AWS ClientError in MFA verification: {error_code} - {error_message}")
        return {"detail": f"MFA verification failed: {error_message}"}, 500
        
    except Exception as e:
        logger.error(f"MFA verification error: {e}\n{traceback.format_exc()}")
        debug_logger.error(f"Unhandled error in MFA verification: {e}\n{traceback.format_exc()}")
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
    debug_logger.info(f"Initiating forgot password flow for user: {username}")
    
    try:
        # Generate secret hash
        try:
            secret_hash = generate_client_secret_hash(username)
        except Exception as hash_error:
            logger.error(f"Failed to generate secret hash: {hash_error}")
            debug_logger.error(f"Failed to generate secret hash: {hash_error}")
            return {"detail": "Failed to generate credentials"}, 500
            
        # Call Cognito API
        try:
            response = cognito_client.forgot_password(
                ClientId=CLIENT_ID,
                Username=username,
                SecretHash=secret_hash
            )
            
            logger.info("Forgot password initiated successfully")
            debug_logger.info(f"Forgot password initiated successfully for user: {username}")
            return {
                "message": "Password reset initiated. Check your email for verification code.",
                "delivery": response.get("CodeDeliveryDetails"),
            }
        except Exception as api_error:
            logger.error(f"Cognito API call failed: {api_error}")
            debug_logger.error(f"forgot_password API call failed: {api_error}\n{traceback.format_exc()}")
            return {"detail": f"Failed to initiate password reset: {str(api_error)}"}, 500
        
    except cognito_client.exceptions.UserNotFoundException:
        # For security, don't reveal if user exists or not
        logger.warning(f"User not found during forgot password: {username}")
        debug_logger.warning(f"UserNotFoundException in forgot password but suppressing for security: {username}")
        return {
            "message": "Password reset initiated. Check your email for verification code."
        }
        
    except botocore.exceptions.ClientError as client_error:
        error_code = client_error.response['Error']['Code']
        error_message = client_error.response['Error']['Message']
        logger.error(f"AWS ClientError: {error_code} - {error_message}")
        debug_logger.error(f"AWS ClientError in forgot password: {error_code} - {error_message}")
        return {"detail": f"Failed to initiate password reset: {error_message}"}, 500
        
    except Exception as e:
        logger.error(f"Error initiating forgot password: {e}")
        debug_logger.error(f"Unhandled error in forgot password: {e}\n{traceback.format_exc()}")
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
    debug_logger.info(f"Confirming forgot password for user: {username}")
    
    try:
        # Generate secret hash
        try:
            secret_hash = generate_client_secret_hash(username)
        except Exception as hash_error:
            logger.error(f"Failed to generate secret hash: {hash_error}")
            debug_logger.error(f"Failed to generate secret hash: {hash_error}")
            return {"detail": "Failed to generate credentials"}, 500
            
        # Call Cognito API
        try:
            start_time = time.time()
            
            cognito_client.confirm_forgot_password(
                ClientId=CLIENT_ID,
                Username=username,
                ConfirmationCode=confirmation_code,
                Password=new_password,
                SecretHash=secret_hash
            )
            
            api_call_time = time.time() - start_time
            logger.info("Password reset successfully")
            debug_logger.info(f"Password reset successfully for user: {username} in {api_call_time:.2f} seconds")
            return {
                "message": "Password has been reset successfully."
            }
        except Exception as api_error:
            logger.error(f"Cognito API call failed: {api_error}")
            debug_logger.error(f"confirm_forgot_password API call failed: {api_error}\n{traceback.format_exc()}")
            return {"detail": f"Failed to reset password: {str(api_error)}"}, 500
        
    except cognito_client.exceptions.CodeMismatchException:
        logger.warning("Invalid verification code")
        debug_logger.warning(f"CodeMismatchException in confirm forgot password for user: {username}")
        return {"detail": "Invalid verification code. Please try again."}, 400
        
    except cognito_client.exceptions.InvalidPasswordException as e:
        logger.warning(f"Invalid password format: {e}")
        debug_logger.warning(f"InvalidPasswordException in confirm forgot password: {e}")
        return {"detail": f"Password does not meet requirements: {str(e)}"}, 400
        
    except botocore.exceptions.ClientError as client_error:
        error_code = client_error.response['Error']['Code']
        error_message = client_error.response['Error']['Message']
        logger.error(f"AWS ClientError: {error_code} - {error_message}")
        debug_logger.error(f"AWS ClientError in confirm forgot password: {error_code} - {error_message}")
        return {"detail": f"Failed to reset password: {error_message}"}, 500
        
    except Exception as e:
        logger.error(f"Error confirming forgot password: {e}")
        debug_logger.error(f"Unhandled error in confirm forgot password: {e}\n{traceback.format_exc()}")
        return {"detail": f"Failed to reset password: {str(e)}"}, 500

# Confirm User Signup
def confirm_signup(email, temp_password, new_password):
    """
    Confirms a user's signup by setting a new permanent password.
    """
    try:
        logger.info(f"Confirming signup for {email}")
        debug_logger.info(f"Confirming signup for {email}")
        
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
            debug_logger.error(f"Error during initiate_auth for signup confirmation: {auth_error}\n{traceback.format_exc()}")
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
                debug_logger.info(f"Signup confirmation successful for {email}")
                return response
            except Exception as challenge_error:
                logger.error(f"Error during respond_to_auth_challenge for signup confirmation: {challenge_error}")
                debug_logger.error(f"Error during respond_to_auth_challenge for signup confirmation: {challenge_error}\n{traceback.format_exc()}")
                return None

        logger.error("Unexpected signup flow state")
        debug_logger.error("Unexpected signup flow state - ChallengeName was not NEW_PASSWORD_REQUIRED")
        return None
    except cognito_client.exceptions.NotAuthorizedException:
        logger.warning("Invalid temporary password provided")
        debug_logger.warning(f"NotAuthorizedException - Invalid temporary password for user: {email}")
        return None
    except Exception as e:
        logger.error(f"Error confirming signup: {e}")
        debug_logger.error(f"Unhandled error in confirm signup: {e}\n{traceback.format_exc()}")
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
    
    debug_logger.debug(f"CORS request from origin: {origin}, allowed origins: {allowed_origins}")
    
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
        debug_logger.error(f"Unhandled error in authenticate_user_route: {e}\n{traceback.format_exc()}")
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
        debug_logger.error(f"Unhandled error in respond_to_challenge_endpoint: {e}\n{traceback.format_exc()}")
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
        
        debug_logger.info(f"MFA setup requested with token: {access_token[:10]}...")
            
        # Call the setup_mfa function
        response = setup_mfa(access_token)
        
        # Check if it's an error response (tuple with status code)
        if isinstance(response, tuple):
            return jsonify(response[0]), response[1]
        
        # Otherwise, it's a successful response
        return jsonify(response)
    except Exception as e:
        logger.error(f"Error in setup_mfa_endpoint: {e}")
        debug_logger.error(f"Unhandled error in setup_mfa_endpoint: {e}\n{traceback.format_exc()}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

# Updated route to verify MFA setup with better error handling for CodeMismatchException
@auth_services_routes.route("/verify-mfa-setup", methods=["POST", "OPTIONS"])
def verify_mfa_setup_endpoint():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    try:
        debug_logger.info("=== verify-mfa-setup endpoint called ===")
        
        data = request.json
        if not data:
            debug_logger.error("No JSON data provided")
            return jsonify({"detail": "No JSON data provided"}), 400
            
        access_token = data.get('access_token')
        code = data.get('code')
        
        debug_logger.info(f"MFA verification requested with token: {access_token[:10] if access_token else 'None'}, code: {code}")
        
        # Enhanced error message with more details
        if not access_token:
            debug_logger.warning("Missing access_token in request")
            return jsonify({"detail": "Access token is required. Make sure you're properly authenticated."}), 400
            
        if not code:
            debug_logger.warning("Missing verification code in request")
            return jsonify({"detail": "Verification code is required"}), 400
        
        # Log request details
        debug_logger.info({
            "endpoint": "verify-mfa-setup",
            "token_prefix": access_token[:5] + "..." if access_token else None,
            "token_length": len(access_token) if access_token else 0,
            "code": code,
            "code_length": len(code),
            "server_time": int(time.time()),
            "formatted_time": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
            "totp_window": int(time.time()) // 30,
            "position_in_window": int(time.time()) % 30,
            "seconds_to_next_window": 30 - (int(time.time()) % 30)
        })
        
        # Call the verify_software_token_setup function
        response = verify_software_token_setup(access_token, code)
    
        # Check if it's an error response (tuple with status code)
        if isinstance(response, tuple):
            debug_logger.info(f"Returning error response: {response[0]} with status {response[1]}")
            return jsonify(response[0]), response[1]
        
        # Otherwise, it's a successful response
        debug_logger.info(f"Returning successful response: {response}")
        return jsonify(response)
        
    except cognito_client.exceptions.CodeMismatchException as code_error:
        debug_logger.warning(f"CodeMismatchException: {code_error}")
        return jsonify({"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}), 400
    except Exception as e:
        debug_logger.error(f"Error in verify_mfa_setup_endpoint: {e}\n{traceback.format_exc()}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

# Updated route with more flexible parameter handling and improved error handling for CodeMismatchException
@auth_services_routes.route("/confirm-mfa-setup", methods=["POST", "OPTIONS"])
def confirm_mfa_setup_endpoint():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    debug_logger.info("=== Starting MFA Confirmation with Detailed Debugging ===")
    
    try:
        data = request.json
        if not data:
            debug_logger.error("No JSON data provided in request body")
            return jsonify({"detail": "No JSON data provided"}), 400
            
        username = data.get('username')
        session = data.get('session')
        code = data.get('code')
        access_token = data.get('access_token')
        
        # Log all input parameters (redact sensitive parts of session/token)
        debug_logger.info(f"MFA setup parameters received:")
        debug_logger.info(f"  - Username: {username}")
        debug_logger.info(f"  - Code: {code}")
        debug_logger.info(f"  - Session present: {bool(session)}")
        if session:
            debug_logger.info(f"  - Session starts with: {session[:20]}...")
        debug_logger.info(f"  - Access token present: {bool(access_token)}")
        if access_token:
            debug_logger.info(f"  - Access token starts with: {access_token[:20]}...")
        
        # Validate input parameters
        if not code:
            debug_logger.error("MFA code is missing")
            return jsonify({"detail": "Verification code is required"}), 400
        
        # Log client information for time drift detection
        try:
            client_time = int(time.time())
            server_time = int(time.time())
            debug_logger.info(f"Time synchronization check:")
            debug_logger.info(f"  - Server time: {server_time} ({datetime.fromtimestamp(server_time).strftime('%Y-%m-%d %H:%M:%S')})")
            debug_logger.info(f"  - Estimated client time: {client_time} ({datetime.fromtimestamp(client_time).strftime('%Y-%m-%d %H:%M:%S')})")
            debug_logger.info(f"  - Time difference: {abs(server_time - client_time)} seconds")
            
            # TOTP window analysis
            totp_step = 30  # Standard TOTP time step
            current_window = server_time // totp_step
            previous_window = current_window - 1
            next_window = current_window + 1
            
            debug_logger.info(f"TOTP time windows:")
            debug_logger.info(f"  - Previous window: {previous_window} ({datetime.fromtimestamp(previous_window * totp_step).strftime('%H:%M:%S')})")
            debug_logger.info(f"  - Current window: {current_window} ({datetime.fromtimestamp(current_window * totp_step).strftime('%H:%M:%S')})")
            debug_logger.info(f"  - Next window: {next_window} ({datetime.fromtimestamp(next_window * totp_step).strftime('%H:%M:%S')})")
            debug_logger.info(f"  - Seconds remaining in current window: {totp_step - (server_time % totp_step)}")
        except Exception as time_error:
            debug_logger.error(f"Error analyzing time: {time_error}")
        
        # AWS SDK version check
        try:
            debug_logger.info(f"AWS SDK Information:")
            debug_logger.info(f"  - Boto3 version: {boto3.__version__}")
            debug_logger.info(f"  - Botocore version: {botocore.__version__}")
        except Exception as version_error:
            debug_logger.error(f"Error checking AWS SDK version: {version_error}")
            
        # Check Cognito client and configuration
        try:
            debug_logger.info(f"Cognito Configuration:")
            debug_logger.info(f"  - Region: {AWS_REGION}")
            debug_logger.info(f"  - User Pool ID configured: {bool(USER_POOL_ID)}")
            debug_logger.info(f"  - Client ID configured: {bool(CLIENT_ID)}")
            debug_logger.info(f"  - Client Secret configured: {bool(CLIENT_SECRET)}")
            
            # Test Cognito connectivity with a minimal call
            try:
                # Use describe_user_pool which is a lightweight call
                debug_response = cognito_client.describe_user_pool(
                    UserPoolId=USER_POOL_ID
                )
                debug_logger.info("  - Cognito connectivity: SUCCESS")
            except Exception as conn_error:
                debug_logger.error(f"  - Cognito connectivity: FAILED - {str(conn_error)}")
                
        except Exception as config_error:
            debug_logger.error(f"Error checking Cognito configuration: {config_error}")
        
        # Check if we have access token (new flow) or session (old flow)
        if access_token:
            debug_logger.info("Using access token flow for MFA verification")
            
            # Verify the access token format
            try:
                if len(access_token) < 20 or '.' not in access_token:
                    debug_logger.warning(f"Access token format may be invalid: {access_token[:10]}...")
                else:
                    debug_logger.info("Access token format appears valid")
            except Exception as token_error:
                debug_logger.error(f"Error validating token format: {token_error}")
            
            # Try to get user details to validate token
            try:
                debug_logger.info("Attempting to get user details with access token")
                user_response = cognito_client.get_user(
                    AccessToken=access_token
                )
                retrieved_username = user_response.get("Username", "unknown")
                debug_logger.info(f"User details retrieved successfully: {retrieved_username}")
                
                # Check user MFA status
                try:
                    mfa_settings = cognito_client.get_user_mfa_setting(
                        AccessToken=access_token
                    )
                    debug_logger.info(f"Current MFA settings: {json.dumps(mfa_settings)}")
                except Exception as mfa_error:
                    debug_logger.info(f"Could not get MFA settings (likely not set up yet): {str(mfa_error)}")
                
            except Exception as user_error:
                debug_logger.error(f"Error retrieving user details: {str(user_error)}")
                # Continue with verification attempt anyway
            
            # Measure API call time
            debug_logger.info("Preparing to verify software token...")
            start_time = time.time()
            
            try:
                debug_logger.info(f"Calling verify_software_token with code: {code}")
                response = cognito_client.verify_software_token(
                    AccessToken=access_token,
                    UserCode=code,
                    FriendlyDeviceName="EncryptGate Auth App"
                )
                
                api_call_time = time.time() - start_time
                debug_logger.info(f"verify_software_token API call completed in {api_call_time:.2f} seconds")
                
                # Log full response for debugging
                debug_logger.info(f"Response from verify_software_token: {json.dumps(response)}")
                
                # Check the status
                status = response.get("Status")
                debug_logger.info(f"MFA verification status: {status}")
                
                if status == "SUCCESS":
                    debug_logger.info("MFA verification successful, setting MFA preference")
                    # Set the user's MFA preference to require TOTP
                    try:
                        pref_response = cognito_client.set_user_mfa_preference(
                            AccessToken=access_token,
                            SoftwareTokenMfaSettings={
                                "Enabled": True,
                                "PreferredMfa": True
                            }
                        )
                        debug_logger.info(f"MFA preference set successfully: {json.dumps(pref_response)}")
                    except Exception as pref_error:
                        debug_logger.warning(f"MFA verified but couldn't set preference: {pref_error}")
                        # Continue anyway since the token was verified
                    
                    return jsonify({
                        "message": "MFA setup verified successfully",
                        "status": status
                    })
                else:
                    debug_logger.warning(f"Verification returned non-SUCCESS status: {status}")
                    return jsonify({"detail": f"MFA verification failed with status: {status}"}), 400
            
            except cognito_client.exceptions.CodeMismatchException as code_error:
                end_time = time.time()
                debug_logger.warning(f"CodeMismatchException: {code_error}")
                debug_logger.info(f"API call time to failure: {end_time - start_time:.2f} seconds")
                
                # If we have the secret, try to generate valid codes for comparison
                try:
                    # Try to get a new secret code for debugging
                    debug_logger.info("Attempting to associate new token for debugging")
                    assoc_response = cognito_client.associate_software_token(
                        AccessToken=access_token
                    )
                    debug_secret = assoc_response.get("SecretCode")
                    
                    if debug_secret:
                        # Calculate valid codes for comparison
                        totp = pyotp.TOTP(debug_secret)
                        now = int(time.time())
                        
                        current_code = totp.at(now)
                        previous_code = totp.at(now - 30)
                        next_code = totp.at(now + 30)
                        
                        debug_logger.info(f"Debug codes for secret: {debug_secret}")
                        debug_logger.info(f"  - Previous valid code: {previous_code}")
                        debug_logger.info(f"  - Current valid code: {current_code}")
                        debug_logger.info(f"  - Next valid code: {next_code}")
                        debug_logger.info(f"  - User provided code: {code}")
                        
                        # Check direct match
                        if code == current_code:
                            debug_logger.info("The user code MATCHES the current window code but still failed!")
                        elif code == previous_code:
                            debug_logger.info("The user code MATCHES the previous window code but still failed!")
                        elif code == next_code:
                            debug_logger.info("The user code MATCHES the next window code but still failed!")
                        else:
                            debug_logger.info("The user code does not match any window code")
                    else:
                        debug_logger.warning("Could not get a debug secret code")
                        
                except Exception as debug_error:
                    debug_logger.error(f"Error generating debug codes: {debug_error}")
                
                return jsonify({"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}), 400
                
            except Exception as e:
                end_time = time.time()
                debug_logger.error(f"Error verifying MFA setup: {e}")
                debug_logger.error(f"Full traceback: {traceback.format_exc()}")
                debug_logger.info(f"API call time to failure: {end_time - start_time:.2f} seconds")
                return jsonify({"detail": f"MFA verification failed: {str(e)}"}), 500
                
        elif session and username and code:
            debug_logger.info(f"Using session flow for MFA verification")
            
            # Generate secret hash
            try:
                secret_hash = generate_client_secret_hash(username)
                debug_logger.info("Generated secret hash successfully")
            except Exception as hash_error:
                debug_logger.error(f"Failed to generate secret hash: {hash_error}")
                return jsonify({"detail": "Failed to generate authentication credentials"}), 500
            
            # Log request details before making Cognito API call
            safe_request = {
                "ClientId": CLIENT_ID[:5] + "..." if CLIENT_ID else "missing",
                "ChallengeName": "SOFTWARE_TOKEN_MFA",
                "Session": session[:20] + "..." if session else "missing", # truncated for logging
                "ChallengeResponses": {
                    "USERNAME": username,
                    "SOFTWARE_TOKEN_MFA_CODE": code,
                    "SECRET_HASH": "***REDACTED***"
                }
            }
            debug_logger.info(f"Preparing respond_to_auth_challenge request: {json.dumps(safe_request)}")
            
            # Measure API call time
            start_time = time.time()
            
            try:
                # Make the API call
                response = cognito_client.respond_to_auth_challenge(
                    ClientId=CLIENT_ID,
                    ChallengeName="SOFTWARE_TOKEN_MFA",
                    Session=session,
                    ChallengeResponses={
                        "USERNAME": username,
                        "SOFTWARE_TOKEN_MFA_CODE": code,
                        "SECRET_HASH": secret_hash
                    }
                )
                
                api_call_time = time.time() - start_time
                debug_logger.info(f"respond_to_auth_challenge API call completed in {api_call_time:.2f} seconds")
                
                # Log limited response info for security
                debug_logger.info(f"Response keys: {list(response.keys())}")
                if "AuthenticationResult" in response:
                    debug_logger.info("Authentication successful - received tokens")
                
                # Process results
                auth_result = response.get("AuthenticationResult")
                if not auth_result:
                    debug_logger.error("No AuthenticationResult in response")
                    if "ChallengeName" in response:
                        debug_logger.info(f"Received another challenge: {response.get('ChallengeName')}")
                    return jsonify({"detail": "Invalid MFA response from server"}), 500
                
                debug_logger.info("MFA verification successful")
                return jsonify({
                    "id_token": auth_result.get("IdToken"),
                    "access_token": auth_result.get("AccessToken"),
                    "refresh_token": auth_result.get("RefreshToken"),
                    "token_type": auth_result.get("TokenType"),
                    "expires_in": auth_result.get("ExpiresIn"),
                })
                
            except cognito_client.exceptions.CodeMismatchException as code_error:
                end_time = time.time()
                debug_logger.warning(f"CodeMismatchException: {code_error}")
                debug_logger.info(f"API call time to failure: {end_time - start_time:.2f} seconds")
                return jsonify({"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}), 400
                
            except cognito_client.exceptions.ExpiredCodeException as expired_error:
                debug_logger.warning(f"ExpiredCodeException: {expired_error}")
                return jsonify({"detail": "The verification code has expired. Please generate a new code from your authenticator app."}), 400
                
            except botocore.exceptions.ClientError as client_error:
                error_code = client_error.response['Error']['Code']
                error_message = client_error.response['Error']['Message']
                debug_logger.error(f"AWS ClientError: {error_code} - {error_message}")
                return jsonify({"detail": f"AWS error: {error_message}"}), 500
                
            except Exception as e:
                debug_logger.error(f"Error in session-based MFA verification: {e}")
                debug_logger.error(f"Full traceback: {traceback.format_exc()}")
                return jsonify({"detail": f"MFA verification failed: {str(e)}"}), 500
        else:
            missing_params = []
            if not access_token and not session:
                missing_params.append("access_token or session")
            if not username and not access_token:
                missing_params.append("username")
            if not code:
                missing_params.append("code")
                
            error_msg = f"Missing required parameters: {', '.join(missing_params)}"
            debug_logger.warning(error_msg)
            return jsonify({"detail": error_msg}), 400
            
    except Exception as e:
        debug_logger.error(f"Unhandled exception in confirm_mfa_setup_endpoint: {e}")
        debug_logger.error(f"Full traceback: {traceback.format_exc()}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500
    finally:
        debug_logger.info("=== MFA Confirmation Request Completed ===")

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
        debug_logger.error(f"Unhandled error in forgot_password_endpoint: {e}\n{traceback.format_exc()}")
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
        debug_logger.error(f"Unhandled error in confirm_forgot_password_endpoint: {e}\n{traceback.format_exc()}")
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
        debug_logger.error(f"Signup confirmation failed: {e}\n{traceback.format_exc()}")
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

# Add a server health check endpoint to help diagnose AWS/Cognito issues
@auth_services_routes.route("/diagnose", methods=["GET"])
def diagnose_endpoint():
    """Enhanced diagnostic endpoint to check AWS service health"""
    try:
        results = {
            "timestamp": datetime.utcnow().isoformat(),
            "environment": os.environ.get("FLASK_ENV", "production"),
            "aws_config": {
                "region": AWS_REGION,
                "user_pool_id": USER_POOL_ID[:4] + "****" if USER_POOL_ID else "missing",
                "client_id": CLIENT_ID[:4] + "****" if CLIENT_ID else "missing", 
                "client_secret": "configured" if CLIENT_SECRET else "missing"
            },
            "sdk_versions": {
                "boto3": boto3.__version__,
                "botocore": botocore.__version__,
                "pyotp": pyotp.__version__
            },
            "service_checks": {}
        }
        
        # Check Cognito connectivity
        try:
            start_time = time.time()
            cognito_client.list_user_pools(MaxResults=1)
            cognito_time = time.time() - start_time
            results["service_checks"]["cognito"] = {
                "status": "connected",
                "response_time": f"{cognito_time:.2f}s"
            }
        except Exception as cognito_error:
            results["service_checks"]["cognito"] = {
                "status": "error",
                "message": str(cognito_error)
            }
            
        # Check time synchronization
        results["time"] = {
            "server_time": int(time.time()),
            "server_time_formatted": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
            "totp_window": int(time.time()) // 30,
            "seconds_in_window": int(time.time()) % 30,
            "seconds_remaining": 30 - (int(time.time()) % 30)
        }
        
        # Check for common TOTP verification issues
        if "connected" in str(results["service_checks"].get("cognito", {}).get("status")):
            # Generate a test TOTP code verification
            try:
                test_secret = pyotp.random_base32()
                totp = pyotp.TOTP(test_secret)
                test_code = totp.now()
                
                results["totp_test"] = {
                    "test_secret": test_secret,
                    "test_code": test_code,
                    "verified_locally": totp.verify(test_code),
                    "verification_window": totp.interval
                }
            except Exception as totp_error:
                results["totp_test"] = {
                    "status": "error",
                    "message": str(totp_error)
                }
        
        return jsonify(results), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e),
            "traceback": traceback.format_exc()
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