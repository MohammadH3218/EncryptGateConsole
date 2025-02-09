import boto3
from jose import jwt
import hmac
import hashlib
import base64
import logging
import os
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from dotenv import load_dotenv

# Initialize logger
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Load environment variables from the .env file
load_dotenv()  # This will load variables from the .env file

# Environment-based configuration
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
CLIENT_ID = os.getenv("CLIENT_ID")  # This is retrieved from the environment
CLIENT_SECRET = os.getenv("CLIENT_SECRET")  # This is retrieved from the environment
JWT_PRIVATE_KEY = os.getenv("JWT_PRIVATE_KEY")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "RS256")

# Initialize AWS Cognito client
cognito_client = boto3.client("cognito-idp", region_name=AWS_REGION)

# Define blueprint
auth_services_routes = Blueprint('auth_services_routes', __name__)

# --- Utility Functions ---
def generate_client_secret_hash(username: str) -> str:
    """Generate client secret hash for AWS Cognito."""
    message = username + CLIENT_ID  # Combine username and client ID
    secret = CLIENT_SECRET.encode("utf-8")  # Use CLIENT_SECRET from environment
    hash_result = base64.b64encode(hmac.new(secret, message.encode("utf-8"), hashlib.sha256).digest()).decode()  # Generate the hash
    logger.debug(f"Generated client secret hash: {hash_result}")
    return hash_result

def create_access_token(data: dict, expires_delta: timedelta = timedelta(minutes=30)) -> str:
    """Generate JWT access token."""
    payload = data.copy()
    payload.update({"exp": datetime.utcnow() + expires_delta})
    return jwt.encode(payload, JWT_PRIVATE_KEY, algorithm=JWT_ALGORITHM)

# --- Routes ---
@auth_services_routes.route("/authenticate", methods=["POST"])
def authenticate_user_with_cognito():
    """Authenticate user with AWS Cognito."""
    data = request.json
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        logger.error("Username and password are required.")
        return jsonify({"detail": "Username and password are required"}), 400

    try:
        # Generate client secret hash and initiate authentication
        client_secret_hash = generate_client_secret_hash(username)
        logger.debug(f"Generated client secret hash: {client_secret_hash}")

        # Attempt authentication
        response = cognito_client.initiate_auth(
            ClientId=CLIENT_ID,
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={
                "USERNAME": username,
                "PASSWORD": password,
                "SECRET_HASH": client_secret_hash,
            },
        )

        logger.debug(f"Cognito response: {response}")

        # Handle new password required challenge
        if response.get("ChallengeName") == "NEW_PASSWORD_REQUIRED":
            logger.info("Password change required, session token returned.")
            return jsonify({"new_password_required": True, "session": response["Session"]})

        # Handle MFA challenge response
        if response.get("ChallengeName") == "SOFTWARE_TOKEN_MFA":
            logger.info("MFA is required.")
            return jsonify({"mfa_required": True, "session": response["Session"]})

        # Return authentication result
        authentication_result = response.get("AuthenticationResult")
        if not authentication_result:
            logger.error("Authentication result missing from Cognito response.")
            return jsonify({"detail": "Authentication failed"}), 401

        return jsonify({"authentication_result": authentication_result})

    except cognito_client.exceptions.NotAuthorizedException as e:
        logger.error(f"Authentication failed due to invalid credentials: {e}")
        return jsonify({"detail": "Invalid username or password."}), 401
    except Exception as e:
        logger.error(f"Error during authentication: {e}")
        return jsonify({"detail": "Authentication failed"}), 500

@auth_services_routes.route("/change-password", methods=["POST"])
def change_password():
    """Change password for a user if required."""
    data = request.json
    session = data.get('session')
    new_password = data.get('new_password')
    username = data.get('username')

    if not session or not new_password:
        logger.error("Session and new password are required.")
        return jsonify({"detail": "Session and new password are required"}), 400

    try:
        # Generate the client secret hash for the username
        client_secret_hash = generate_client_secret_hash(username)

        # Respond to new password required challenge
        response = cognito_client.respond_to_auth_challenge(
            ClientId=CLIENT_ID,
            ChallengeName="NEW_PASSWORD_REQUIRED",
            Session=session,
            ChallengeResponses={
                "USERNAME": username,
                "NEW_PASSWORD": new_password,
                "SECRET_HASH": client_secret_hash,  # Include the SECRET_HASH here
            },
        )

        # Handle MFA setup challenge if needed
        if response.get("ChallengeName") == "MFA_SETUP":
            logger.info("MFA setup is required. User must complete MFA setup.")
            return jsonify({
                "message": "MFA setup required. Please complete MFA setup.",
                "session": response["Session"]
            })

        # Ensure the MFA has been completed and check for valid AuthenticationResult
        if "AuthenticationResult" in response:
            logger.debug(f"Password change response: {response}")
            return jsonify({
                "message": "Password changed successfully",
                "token": response["AuthenticationResult"]["IdToken"]
            })

        logger.error("Password change failed: AuthenticationResult not found.")
        return jsonify({"detail": "Password change failed"}), 500

    except cognito_client.exceptions.InvalidParameterException as e:
        logger.error(f"Password change failed due to invalid parameters: {e}")
        return jsonify({"detail": "Invalid parameters for password change."}), 400
    except Exception as e:
        logger.error(f"Password change failed: {e}")
        return jsonify({"detail": "Password change failed"}), 500

@auth_services_routes.route("/verify-mfa", methods=["POST"])
def verify_mfa():
    """Verify MFA code with AWS Cognito."""
    data = request.json
    session = data.get('session')
    code = data.get('code')

    if not (session and code):
        logger.error("Session and MFA code are required.")
        return jsonify({"detail": "Session and code are required"}), 400

    try:
        # Respond to MFA challenge
        response = cognito_client.respond_to_auth_challenge(
            ClientId=CLIENT_ID,
            ChallengeName="SOFTWARE_TOKEN_MFA",
            Session=session,
            ChallengeResponses={
                "USERNAME": "username-placeholder",  # Replace with actual username if needed
                "SOFTWARE_TOKEN_MFA_CODE": code,
            },
        )

        authentication_result = response.get("AuthenticationResult")
        if not authentication_result:
            logger.error("MFA authentication result missing.")
            return jsonify({"detail": "MFA verification failed"}), 401

        # Return JWT token after successful MFA
        return jsonify({"token": authentication_result["IdToken"]})

    except Exception as e:
        logger.error(f"MFA verification failed: {e}")
        return jsonify({"detail": "MFA verification failed"}), 401
