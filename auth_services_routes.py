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
from flask import Flask
from flask_cors import CORS
import traceback

# Load environment variables
load_dotenv()

# Logging Configuration
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# AWS Cognito Configuration
AWS_REGION = os.getenv("REGION", "us-east-1")
USER_POOL_ID = os.getenv("COGNITO_USERPOOL_ID")
CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")
CLIENT_SECRET = os.getenv("COGNITO_CLIENT_SECRET")

# Log Cognito configuration status
logger.info("=== Cognito Configuration Status ===")
logger.info(f"AWS_REGION: {'Configured' if AWS_REGION else 'MISSING'}")
logger.info(f"USER_POOL_ID: {'Configured' if USER_POOL_ID else 'MISSING'}")
logger.info(f"CLIENT_ID: {'Configured' if CLIENT_ID else 'MISSING'}")
logger.info(f"CLIENT_SECRET: {'Configured' if CLIENT_SECRET else 'MISSING'}")

# Create Cognito client with error handling
try:
    logger.info(f"Initializing Cognito client with region: {AWS_REGION}")
    cognito_client = boto3.client("cognito-idp", region_name=AWS_REGION)
    logger.info("Cognito client initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize Cognito client: {e}")
    logger.error(traceback.format_exc())
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
            
        logger.debug(f"Generating client secret hash for username: {username}")
        message = username + CLIENT_ID
        secret = CLIENT_SECRET.encode("utf-8")
        
        # Compute the hash
        hash_obj = hmac.new(secret, message.encode("utf-8"), hashlib.sha256)
        hash_digest = hash_obj.digest()
        hash_result = base64.b64encode(hash_digest).decode()
        
        logger.debug("Client secret hash generated successfully")
        return hash_result
    except Exception as e:
        logger.error(f"Error generating client secret hash: {e}")
        logger.error(traceback.format_exc())
        raise

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
    logger.info(f"Authentication function called for user: {username}")
    
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
            logger.debug("Generating client secret hash")
            secret_hash = generate_client_secret_hash(username)
            logger.debug("Secret hash generated successfully")
        except Exception as hash_error:
            logger.error(f"Failed to generate secret hash: {hash_error}")
            return {"detail": f"Authentication error: Failed to generate credentials"}, 500

        # Log initiate auth attempt
        logger.info(f"Initiating Cognito authentication for user: {username}")
        logger.debug(f"Using CLIENT_ID: {CLIENT_ID[:4]}...{CLIENT_ID[-4:] if CLIENT_ID and len(CLIENT_ID) > 8 else 'invalid'}")
        
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
            logger.info("Cognito authentication API call successful")
            logger.debug(f"Response keys: {list(response.keys())}")
        except cognito_client.exceptions.NotAuthorizedException as auth_error:
            logger.error(f"NotAuthorizedException: {auth_error}")
            return {"detail": "Invalid username or password."}, 401
        except cognito_client.exceptions.UserNotFoundException as user_error:
            logger.error(f"UserNotFoundException: {user_error}")
            return {"detail": "Invalid username or password."}, 401  # Same error for security
        except Exception as api_error:
            logger.error(f"Cognito API call failed: {api_error}")
            logger.error(traceback.format_exc())
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
        logger.info("Authentication successful, returning tokens")
        return {
            "id_token": auth_result.get("IdToken"),
            "access_token": auth_result.get("AccessToken"),
            "refresh_token": auth_result.get("RefreshToken"),
            "token_type": auth_result.get("TokenType"),
            "expires_in": auth_result.get("ExpiresIn"),
        }

    except Exception as e:
        logger.error(f"Unhandled error during authentication: {e}")
        logger.error(traceback.format_exc())
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
        
        # Make the API call
        response = cognito_client.respond_to_auth_challenge(
            ClientId=CLIENT_ID,
            ChallengeName=challenge_name,
            Session=session,
            ChallengeResponses=challenge_responses_with_auth
        )
        
        logger.info(f"Challenge response successful. Response keys: {list(response.keys())}")
        
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
        logger.error(f"Invalid password format: {pwd_error}")
        return {"detail": f"Password does not meet requirements: {str(pwd_error)}"}, 400
        
    except Exception as e:
        logger.error(f"Challenge response error: {e}")
        logger.error(traceback.format_exc())
        return {"detail": f"Challenge response failed: {str(e)}"}, 500

# Set up MFA with access token
def setup_mfa(access_token):
    """
    Set up MFA for a user with access token
    
    Args:
        access_token (str): User's access token from successful authentication
        
    Returns:
        dict: MFA setup information including secret code
    """
    logger.info("Setting up MFA")
    
    try:
        # Make the API call to associate software token
        response = cognito_client.associate_software_token(
            AccessToken=access_token
        )
        
        logger.info("Software token association successful")
        
        # Get the secret code
        secret_code = response.get("SecretCode")
        if not secret_code:
            logger.error("No secret code in response")
            return {"detail": "Failed to generate MFA secret code"}, 500
        
        return {
            "secretCode": secret_code,
            "message": "MFA setup initiated successfully"
        }
        
    except Exception as e:
        logger.error(f"Error setting up MFA: {e}")
        logger.error(traceback.format_exc())
        return {"detail": f"Failed to setup MFA: {str(e)}"}, 500

# Verify MFA setup with access token
def verify_software_token_setup(access_token, code):
    """
    Verify MFA setup with access token and verification code
    
    Args:
        access_token (str): User's access token from successful authentication
        code (str): The verification code from authenticator app
        
    Returns:
        dict: Success message or error
    """
    logger.info("Verifying MFA setup")
    
    try:
        # Make the API call to verify software token
        response = cognito_client.verify_software_token(
            AccessToken=access_token,
            UserCode=code
        )
        
        # Check the status
        status = response.get("Status")
        logger.info(f"MFA verification status: {status}")
        
        if status == "SUCCESS":
            return {
                "message": "MFA setup verified successfully",
                "status": status
            }
        else:
            return {"detail": f"MFA verification failed with status: {status}"}, 400
        
    except cognito_client.exceptions.CodeMismatchException:
        logger.error("Invalid verification code")
        return {"detail": "Invalid verification code. Please try again."}, 400
        
    except cognito_client.exceptions.EnableSoftwareTokenMFAException as e:
        logger.error(f"Error enabling MFA: {e}")
        return {"detail": "Error enabling MFA. Try again or contact support."}, 400
        
    except Exception as e:
        logger.error(f"Error verifying MFA setup: {e}")
        logger.error(traceback.format_exc())
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
    
    try:
        # Generate secret hash
        try:
            secret_hash = generate_client_secret_hash(username)
        except Exception as hash_error:
            logger.error(f"Failed to generate secret hash for MFA: {hash_error}")
            return {"detail": "MFA verification failed: Unable to generate credentials"}, 500
            
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
        
        auth_result = response.get("AuthenticationResult")
        if not auth_result:
            logger.error("No AuthenticationResult in MFA response")
            return {"detail": "Invalid MFA response from server"}, 500
            
        return {
            "id_token": auth_result.get("IdToken"),
            "access_token": auth_result.get("AccessToken"),
            "refresh_token": auth_result.get("RefreshToken"),
            "token_type": auth_result.get("TokenType"),
            "expires_in": auth_result.get("ExpiresIn"),
        }
        
    except cognito_client.exceptions.CodeMismatchException:
        logger.error("MFA code mismatch")
        return {"detail": "Invalid MFA code provided."}, 401
        
    except Exception as e:
        logger.error(f"MFA verification error: {e}")
        logger.error(traceback.format_exc())
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
        logger.error(traceback.format_exc())
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
        logger.error("Invalid verification code")
        return {"detail": "Invalid verification code. Please try again."}, 400
        
    except cognito_client.exceptions.InvalidPasswordException as e:
        logger.error(f"Invalid password format: {e}")
        return {"detail": f"Password does not meet requirements: {str(e)}"}, 400
        
    except Exception as e:
        logger.error(f"Error confirming forgot password: {e}")
        logger.error(traceback.format_exc())
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
        logger.error("Invalid temporary password provided")
        return None
    except Exception as e:
        logger.error(f"Error confirming signup: {e}")
        logger.error(traceback.format_exc())
        return None

# Enhanced CORS handler for preflight requests
def handle_cors_preflight():
    response = make_response()
    origin = request.headers.get("Origin", "")
    
    # Log received headers for debugging
    logger.info(f"Preflight request received. Origin: {origin}")
    
    # Get allowed origins from environment variable
    allowed_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net").split(",")
    allowed_origins = [o.strip() for o in allowed_origins]
    
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
        logger.info("OPTIONS request received on /api/auth/authenticate")
        return handle_cors_preflight()

    logger.info(f"Authentication route accessed from: {request.headers.get('Origin', 'Unknown')}")
    
    try:
        data = request.json
        if not data:
            logger.error("No JSON data in request")
            return jsonify({"detail": "No JSON data provided"}), 400
            
        username = data.get('username')
        password = data.get('password')
        
        logger.info(f"Authentication attempt for user: {username}")

        # Call the function version and handle the response
        auth_response = authenticate_user(username, password)
        
        # Check if it's an error response (tuple with status code)
        if isinstance(auth_response, tuple):
            logger.info(f"Authentication returned error: {auth_response[0]}")
            return jsonify(auth_response[0]), auth_response[1]
        
        # Otherwise, it's a successful response
        logger.info("Authentication successful or challenge required")
        return jsonify(auth_response)
    except Exception as e:
        logger.error(f"Error in authenticate_user_route: {e}")
        logger.error(traceback.format_exc())
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
            
        logger.info(f"Challenge response for {username}: {challenge_name}")
        
        # Call the respond_to_auth_challenge function
        response = respond_to_auth_challenge(username, session, challenge_name, challenge_responses)
        
        # Check if it's an error response (tuple with status code)
        if isinstance(response, tuple):
            return jsonify(response[0]), response[1]
        
        # Otherwise, it's a successful response
        return jsonify(response)
    except Exception as e:
        logger.error(f"Error in respond_to_challenge_endpoint: {e}")
        logger.error(traceback.format_exc())
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
            
        logger.info("Initiating MFA setup with access token")
        
        # Call the setup_mfa function
        response = setup_mfa(access_token)
        
        # Check if it's an error response (tuple with status code)
        if isinstance(response, tuple):
            return jsonify(response[0]), response[1]
        
        # Otherwise, it's a successful response
        return jsonify(response)
    except Exception as e:
        logger.error(f"Error in setup_mfa_endpoint: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

# New route to verify MFA setup
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
        
        if not (access_token and code):
            return jsonify({"detail": "Access token and code are required"}), 400
            
        logger.info("Verifying MFA setup with access token")
        
        # Call the verify_software_token_setup function
        response = verify_software_token_setup(access_token, code)
        
        # Check if it's an error response (tuple with status code)
        if isinstance(response, tuple):
            return jsonify(response[0]), response[1]
        
        # Otherwise, it's a successful response
        return jsonify(response)
    except Exception as e:
        logger.error(f"Error in verify_mfa_setup_endpoint: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

# Route for confirming MFA setup
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
        
        # Check if we have access token (new flow) or session (old flow)
        if access_token:
            logger.info(f"Using new MFA setup flow with access token")
            return verify_mfa_setup_endpoint()
        elif session and username and code:
            logger.info(f"Using old MFA setup flow with session for user: {username}")
            
            # Use the respond_to_auth_challenge function
            response = respond_to_auth_challenge(
                username, 
                session, 
                "SOFTWARE_TOKEN_MFA", 
                {"SOFTWARE_TOKEN_MFA_CODE": code}
            )
            
            # Check if it's an error response (tuple with status code)
            if isinstance(response, tuple):
                return jsonify(response[0]), response[1]
            
            # Otherwise, it's a successful response
            return jsonify(response)
        else:
            return jsonify({"detail": "Missing required parameters"}), 400
            
    except Exception as e:
        logger.error(f"Error in confirm_mfa_setup_endpoint: {e}")
        logger.error(traceback.format_exc())
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
            
        logger.info(f"Forgot password request for user: {username}")
        
        # Call the initiate_forgot_password function
        response = initiate_forgot_password(username)
        
        # Check if it's an error response (tuple with status code)
        if isinstance(response, tuple):
            return jsonify(response[0]), response[1]
        
        # Otherwise, it's a successful response
        return jsonify(response)
    except Exception as e:
        logger.error(f"Error in forgot_password_endpoint: {e}")
        logger.error(traceback.format_exc())
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
            
        logger.info(f"Confirming forgot password for user: {username}")
        
        # Call the confirm_forgot_password function
        response = confirm_forgot_password(username, confirmation_code, new_password)
        
        # Check if it's an error response (tuple with status code)
        if isinstance(response, tuple):
            return jsonify(response[0]), response[1]
        
        # Otherwise, it's a successful response
        return jsonify(response)
    except Exception as e:
        logger.error(f"Error in confirm_forgot_password_endpoint: {e}")
        logger.error(traceback.format_exc())
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
        logger.error(traceback.format_exc())
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

# Health Check Route
@auth_services_routes.route("/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "success", 
        "message": "Service is running",
        "aws_credentials": {
            "region": "configured" if AWS_REGION else "missing",
            "user_pool_id": "configured" if USER_POOL_ID else "missing",
            "client_id": "configured" if CLIENT_ID else "missing",
            "client_secret": "configured" if CLIENT_SECRET else "missing"
        }
    }), 200