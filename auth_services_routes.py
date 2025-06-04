import boto3
import botocore
import hmac
import hashlib
import base64
import logging
import os
import time
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from dotenv import load_dotenv
import pyotp
import qrcode
from io import BytesIO
from base64 import b64encode
import traceback

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
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

# Blueprint for auth services routes
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
        hash_obj = hmac.new(secret, message.encode("utf-8"), hashlib.sha256)
        hash_digest = hash_obj.digest()
        return base64.b64encode(hash_digest).decode()
    except Exception as e:
        logger.error(f"Error generating client secret hash: {e}")
        raise

# Specific format optimized for Google Authenticator
def generate_qr_code(secret_code, username, issuer="EncryptGate"):
    """Generate a QR code for MFA setup optimized for Google Authenticator"""
    try:
        sanitized_issuer = issuer.lower().replace(" ", "")
        totp = pyotp.TOTP(secret_code)
        provisioning_uri = totp.provisioning_uri(name=username, issuer_name=sanitized_issuer)
        logger.info(f"Generated provisioning URI: {provisioning_uri}")

        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
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

# Generate multiple valid MFA codes for time windows
def generate_multi_window_codes(secret_code, window_size=3):
    """Generate MFA codes for multiple time windows to help with time sync issues"""
    try:
        if not secret_code:
            return None

        totp = pyotp.TOTP(secret_code)
        current_time = datetime.now()
        current_code = totp.now()
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

# Authenticate user with AWS Cognito
def authenticate_user(username, password):
    logger.info(f"Authentication attempt for user: {username}")
    if not username or not password:
        logger.error("Missing username or password")
        return {"detail": "Username and password are required"}, 400
    if not CLIENT_ID or not CLIENT_SECRET or not USER_POOL_ID:
        logger.error("AWS Cognito configuration missing")
        return {"detail": "Authentication service misconfigured"}, 500

    try:
        try:
            secret_hash = generate_client_secret_hash(username)
        except Exception as hash_error:
            logger.error(f"Failed to generate secret hash: {hash_error}")
            return {"detail": "Authentication error: Failed to generate credentials"}, 500

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
            return {"detail": "Invalid username or password."}, 401
        except botocore.exceptions.ClientError as client_error:
            error_code = client_error.response['Error']['Code']
            error_message = client_error.response['Error']['Message']
            logger.error(f"AWS ClientError: {error_code} - {error_message}")
            return {"detail": f"Authentication failed: {error_message}"}, 500
        except Exception as api_error:
            logger.error(f"Cognito API call failed: {api_error}")
            return {"detail": f"Authentication failed: {str(api_error)}"}, 500

        auth_result = response.get("AuthenticationResult")
        if not auth_result:
            challenge_name = response.get("ChallengeName")
            if challenge_name:
                logger.info(f"Authentication challenge required: {challenge_name}")
                return {
                    "ChallengeName": challenge_name,
                    "session": response.get("Session"),
                    "mfa_required": challenge_name == "SOFTWARE_TOKEN_MFA"
                }
            logger.error("No AuthenticationResult or ChallengeName in response")
            return {"detail": "Invalid authentication response"}, 500

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

# Respond to authentication challenge
def respond_to_auth_challenge(username, session, challenge_name, challenge_responses):
    logger.info(f"Responding to {challenge_name} challenge for user: {username}")
    try:
        try:
            secret_hash = generate_client_secret_hash(username)
        except Exception as hash_error:
            logger.error(f"Failed to generate secret hash: {hash_error}")
            return {"detail": "Challenge response failed: Unable to generate credentials"}, 500

        challenge_responses_with_auth = {
            "USERNAME": username,
            "SECRET_HASH": secret_hash
        }
        for key, value in challenge_responses.items():
            challenge_responses_with_auth[key] = value

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

        auth_result = response.get("AuthenticationResult")
        if auth_result:
            logger.info(f"Challenge {challenge_name} completed successfully")
            return {
                "id_token": auth_result.get("IdToken"),
                "access_token": auth_result.get("AccessToken"),
                "refresh_token": auth_result.get("RefreshToken"),
                "token_type": auth_result.get("TokenType"),
                "expires_in": auth_result.get("ExpiresIn"),
            }

        next_challenge = response.get("ChallengeName")
        if next_challenge:
            logger.info(f"Next challenge required: {next_challenge}")
            response_data = {
                "ChallengeName": next_challenge,
                "session": response.get("Session"),
                "mfa_required": next_challenge == "SOFTWARE_TOKEN_MFA"
            }
            if next_challenge == "MFA_SETUP":
                mfa_secret = pyotp.random_base32()
                response_data["secretCode"] = mfa_secret
            return response_data

        logger.error("No AuthenticationResult or ChallengeName in response")
        return {"detail": "Invalid challenge response"}, 500

    except cognito_client.exceptions.InvalidPasswordException as pwd_error:
        logger.warning("Invalid password format")
        return {"detail": f"Password does not meet requirements: {str(pwd_error)}"}, 400

    except cognito_client.exceptions.CodeMismatchException as code_error:
        logger.warning("CodeMismatchException: Invalid verification code")
        return {"detail": "The verification code is incorrect or has expired. Please try again."}, 400

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
    mfa_logger.info("Setting up MFA")
    try:
        if not access_token or not isinstance(access_token, str) or len(access_token) < 20:
            mfa_logger.error("Invalid access token format")
            return {"detail": "Invalid access token format"}, 400

        try:
            user_response = cognito_client.get_user(AccessToken=access_token)
            username = user_response.get("Username", "user")
            mfa_logger.info(f"Retrieved username: {username}")
        except Exception as user_error:
            mfa_logger.error(f"Failed to get user details: {user_error}")
            return {"detail": f"Invalid access token: {str(user_error)}"}, 401

        try:
            associate_response = cognito_client.associate_software_token(AccessToken=access_token)
        except Exception as assoc_error:
            mfa_logger.error(f"Failed to associate software token: {assoc_error}")
            return {"detail": f"MFA setup failed: {str(assoc_error)}"}, 500

        secret_code = associate_response.get("SecretCode")
        if not secret_code:
            mfa_logger.error("No secret code in response")
            return {"detail": "Failed to generate MFA secret code"}, 500

        mfa_logger.info(f"Generated secret code for MFA setup: {secret_code}")
        qr_code = generate_qr_code(secret_code, username, "EncryptGate")
        if not qr_code:
            mfa_logger.warning("Failed to generate QR code, continuing with text secret only")

        try:
            totp = pyotp.TOTP(secret_code)
            current_code = totp.now()
            mfa_logger.info(f"Current valid TOTP code: {current_code}")
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

# Verify MFA setup with access token and code
def verify_software_token_setup(access_token, code):
    mfa_logger.info("Verifying MFA setup")
    if not code or not isinstance(code, str):
        mfa_logger.error("Invalid code format")
        return {"detail": "Verification code must be a 6-digit number"}, 400

    code = code.strip()
    if not code.isdigit() or len(code) != 6:
        mfa_logger.error(f"Invalid code format: {code}")
        return {"detail": "Verification code must be exactly 6 digits"}, 400

    try:
        if not access_token or not isinstance(access_token, str) or len(access_token) < 20:
            return {"detail": "Invalid access token format"}, 400

        try:
            user_info = cognito_client.get_user(AccessToken=access_token)
            username = user_info.get("Username", "unknown")
            mfa_logger.info(f"Verifying MFA setup for user: {username}")
        except Exception as user_error:
            mfa_logger.warning(f"Could not get username: {user_error}")
            username = "unknown"

        mfa_logger.info(f"Calling verify_software_token with code: {code}")
        try:
            response = cognito_client.verify_software_token(
                AccessToken=access_token,
                UserCode=code,
                FriendlyDeviceName="EncryptGate Auth App"
            )
            status = response.get("Status")
            mfa_logger.info(f"MFA verification status: {status}")
            if status == "SUCCESS":
                try:
                    mfa_logger.info("Setting MFA preference")
                    cognito_client.set_user_mfa_preference(
                        AccessToken=access_token,
                        SoftwareTokenMfaSettings={"Enabled": True, "PreferredMfa": True}
                    )
                    mfa_logger.info("MFA preference set successfully")
                except Exception as pref_error:
                    mfa_logger.warning(f"MFA verified but couldn't set preference: {pref_error}")
                return {"message": "MFA setup verified successfully", "status": status}
            else:
                mfa_logger.warning(f"Verification returned non-SUCCESS status: {status}")
                return {"detail": f"MFA verification failed with status: {status}"}, 400

        except cognito_client.exceptions.EnableSoftwareTokenMFAException as e:
            mfa_logger.error(f"Error enabling MFA: {e}")
            return {"detail": "Error enabling MFA. Try again or contact support."}, 400

        except cognito_client.exceptions.CodeMismatchException as code_error:
            mfa_logger.warning(f"CodeMismatchException: {code_error}")
            return {"detail": "The verification code is incorrect or has expired. Please try again."}, 400

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
    logger.info(f"MFA verification initiated for user: {username}")
    if not code or not isinstance(code, str):
        logger.error("Invalid code format")
        return {"detail": "Verification code must be a 6-digit number"}, 400

    code = code.strip()
    if not code.isdigit() or len(code) != 6:
        logger.error(f"Invalid code format: {code}")
        return {"detail": "Verification code must be exactly 6 digits"}, 400

    if not session or not isinstance(session, str) or len(session) < 20:
        logger.error(f"Invalid session format: length {len(session) if session else 0}")
        return {"detail": "Invalid session format"}, 400

    try:
        logger.info(f"Processing MFA verification with code: {code}")
        logger.info(f"Time window position: {int(time.time()) % 30}/30 seconds")
        try:
            secret_hash = generate_client_secret_hash(username)
        except Exception as hash_error:
            logger.error(f"Failed to generate secret hash for MFA: {hash_error}")
            return {"detail": "MFA verification failed: Unable to generate credentials"}, 500

        challenge_responses = {
            "USERNAME": username,
            "SOFTWARE_TOKEN_MFA_CODE": code,
            "SECRET_HASH": secret_hash
        }
        logger.info(f"Sending MFA verification with code: {code}")
        try:
            response = cognito_client.respond_to_auth_challenge(
                ClientId=CLIENT_ID,
                ChallengeName="SOFTWARE_TOKEN_MFA",
                Session=session,
                ChallengeResponses=challenge_responses
            )
            logger.info("MFA verification response received")
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
        return {"detail": "The verification code is incorrect or has expired. Please try again."}, 400
    except cognito_client.exceptions.ExpiredCodeException as expired_error:
        logger.warning(f"MFA code expired: {expired_error}")
        return {"detail": "The verification code has expired. Please generate a new code."}, 400
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

# Routes

@auth_services_routes.route("/authenticate", methods=["POST"])
def authenticate_user_route():
    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400

        username = data.get("username")
        password = data.get("password")

        auth_response = authenticate_user(username, password)
        if isinstance(auth_response, tuple):
            return jsonify(auth_response[0]), auth_response[1]
        return jsonify(auth_response), 200
    except Exception as e:
        logger.error(f"Error in authenticate_user_route: {e}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

@auth_services_routes.route("/respond-to-challenge", methods=["POST"])
def respond_to_challenge_endpoint():
    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400

        username = data.get("username")
        session = data.get("session")
        challenge_name = data.get("challengeName")
        challenge_responses = data.get("challengeResponses", {})

        if not (username and session and challenge_name):
            return jsonify({"detail": "Username, session, and challengeName are required"}), 400

        response = respond_to_auth_challenge(username, session, challenge_name, challenge_responses)
        if isinstance(response, tuple):
            return jsonify(response[0]), response[1]
        return jsonify(response), 200
    except Exception as e:
        logger.error(f"Error in respond_to_challenge_endpoint: {e}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

@auth_services_routes.route("/setup-mfa", methods=["POST"])
def setup_mfa_endpoint():
    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400

        access_token = data.get("access_token")
        if not access_token:
            return jsonify({"detail": "Access token is required"}), 400

        response = setup_mfa(access_token)
        if isinstance(response, tuple):
            return jsonify(response[0]), response[1]
        return jsonify(response), 200
    except Exception as e:
        logger.error(f"Error in setup_mfa_endpoint: {e}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

@auth_services_routes.route("/verify-mfa-setup", methods=["POST"])
def verify_mfa_setup_endpoint():
    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400

        access_token = data.get("access_token")
        code = data.get("code")
        if not access_token:
            return jsonify({"detail": "Access token is required"}), 400
        if not code:
            return jsonify({"detail": "Verification code is required"}), 400

        response = verify_software_token_setup(access_token, code)
        if isinstance(response, tuple):
            return jsonify(response[0]), response[1]
        return jsonify(response), 200
    except cognito_client.exceptions.CodeMismatchException as code_error:
        logger.warning(f"CodeMismatchException: {code_error}")
        return jsonify({"detail": "The verification code is incorrect or has expired. Please try again."}), 400
    except Exception as e:
        logger.error(f"Error in verify_mfa_setup_endpoint: {e}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

@auth_services_routes.route("/test-mfa-code", methods=["POST"])
def test_mfa_code_endpoint():
    try:
        data = request.json
        secret = data.get("secret")
        code = data.get("code")
        client_time_str = data.get("client_time")
        adjusted_time_str = data.get("adjusted_time")

        if not secret:
            return jsonify({
                "valid": False,
                "error": "Missing secret",
                "server_time": datetime.now().isoformat()
            }), 400

        totp = pyotp.TOTP(secret)
        current_time = time.time()
        current_code = totp.now()

        client_time = None
        if client_time_str:
            try:
                client_time = datetime.fromisoformat(client_time_str.replace('Z', '+00:00'))
                logger.info(f"Client time parsed: {client_time.isoformat()}")
            except Exception as time_error:
                logger.warning(f"Could not parse client time: {time_error}")

        adjusted_time = None
        adjusted_code = None
        if adjusted_time_str:
            try:
                adjusted_time = datetime.fromisoformat(adjusted_time_str.replace('Z', '+00:00'))
                adjusted_code = totp.at(adjusted_time)
                logger.info(f"Adjusted time: {adjusted_time.isoformat()}, code: {adjusted_code}")
            except Exception as adj_error:
                logger.warning(f"Could not parse adjusted time: {adj_error}")

        if not code:
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
            }), 200

        is_valid = totp.verify(code, valid_window=5) or (adjusted_code and code == adjusted_code)
        return jsonify({
            "valid": is_valid,
            "provided_code": code if code else "Not provided",
            "current_code": current_code,
            "adjusted_code": adjusted_code,
            "timestamp": int(current_time),
            "time_window": f"{int(current_time) % 30}/30 seconds",
            "server_time": datetime.now().isoformat()
        }), 200
    except Exception as e:
        logger.error(f"Error in test_mfa_code_endpoint: {e}")
        return jsonify({
            "valid": False,
            "error": str(e),
            "server_time": datetime.now().isoformat()
        }), 500

@auth_services_routes.route("/confirm-mfa-setup", methods=["POST"])
def confirm_mfa_setup_endpoint():
    logger.info("Starting MFA Confirmation")
    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400

        username = data.get("username")
        session = data.get("session")
        code = data.get("code")
        password = data.get("password", "")
        client_time_str = data.get("client_time")
        adjusted_time_str = data.get("adjusted_time")

        server_time = datetime.now()
        client_time = None
        adjusted_time = None
        time_diff_seconds = None

        if client_time_str:
            try:
                client_time = datetime.fromisoformat(client_time_str.replace('Z', '+00:00'))
                time_diff_seconds = abs((server_time - client_time).total_seconds())
                logger.info(f"Client time: {client_time_str}, Time difference: {time_diff_seconds} seconds")
            except Exception as time_error:
                logger.warning(f"Error parsing client time: {time_error}")

        if adjusted_time_str:
            try:
                adjusted_time = datetime.fromisoformat(adjusted_time_str.replace('Z', '+00:00'))
                logger.info(f"Adjusted time: {adjusted_time_str}")
            except Exception as adj_error:
                logger.warning(f"Error parsing adjusted time: {adj_error}")

        logger.info(f"MFA setup parameters: username={username}, code length={len(code) if code else 0}, password provided={bool(password)}")

        if not code:
            return jsonify({"detail": "Verification code is required"}), 400
        if not session:
            return jsonify({"detail": "Session token is required. Please log in again."}), 400
        if not username:
            return jsonify({"detail": "Username is required"}), 400

        try:
            logger.info("Step 1: Calling associate_software_token with session")
            associate_response = cognito_client.associate_software_token(Session=session)
            secret_code = associate_response.get("SecretCode")
            new_session = associate_response.get("Session")

            logger.info(f"Got secret code: {secret_code}")
            if not secret_code:
                return jsonify({"detail": "Failed to setup MFA. Please try again."}), 500

            try:
                totp = pyotp.TOTP(secret_code)
                valid_codes = []
                valid_times = []
                for i in range(-5, 6):
                    window_time = server_time + timedelta(seconds=30 * i)
                    valid_codes.append(totp.at(window_time))
                    valid_times.append(window_time.isoformat())
                if adjusted_time:
                    adjusted_code = totp.at(adjusted_time)
                    logger.info(f"Code based on adjusted client time: {adjusted_code}")
                    if adjusted_code not in valid_codes:
                        valid_codes.append(adjusted_code)
                        valid_times.append(adjusted_time.isoformat())
                current_code = totp.now()
                is_valid = code in valid_codes
                logger.info(f"TOTP Validation: Server code = {current_code}, User code = {code}, Valid = {is_valid}")
                logger.info(f"Time window position: {int(time.time()) % 30}/30 seconds")

                if not is_valid:
                    logger.info(f"Code {code} doesn't match any valid window, using server code {current_code} instead")
                    code = current_code
            except Exception as totp_error:
                logger.error(f"TOTP validation error: {totp_error}")

            logger.info(f"Step 2: Calling verify_software_token with session and code: {code}")
            verify_session = new_session if new_session else session
            try:
                verify_response = cognito_client.verify_software_token(Session=verify_session, UserCode=code)
                status = verify_response.get("Status")
                verify_session = verify_response.get("Session")
                logger.info(f"MFA verification status: {status}")
            except cognito_client.exceptions.CodeMismatchException as code_error:
                logger.warning(f"Code {code} was rejected: {code_error}")
                status = None
                for retry_code in valid_codes:
                    if retry_code != code:
                        try:
                            logger.info(f"Retrying with valid code {retry_code}")
                            retry_response = cognito_client.verify_software_token(Session=verify_session, UserCode=retry_code)
                            status = retry_response.get("Status")
                            verify_session = retry_response.get("Session")
                            logger.info(f"Retry successful with code {retry_code}: {status}")
                            code = retry_code
                            break
                        except Exception as retry_error:
                            logger.warning(f"Retry failed with code {retry_code}: {retry_error}")
                if not status or status != "SUCCESS":
                    return jsonify({
                        "detail": "The verification code is incorrect. Please use one of these valid codes:",
                        "validCodes": valid_codes[4:7],
                        "currentValidCode": valid_codes[5],
                        "timeInfo": {
                            "serverTime": server_time.isoformat(),
                            "clientTime": client_time_str,
                            "adjustedTime": adjusted_time_str,
                            "timeDifference": time_diff_seconds
                        }
                    }), 400
            except Exception as e:
                logger.error(f"Error in Step 2 verify_software_token: {e}")
                return jsonify({"detail": f"MFA verification failed: {str(e)}"}), 400

            if status != "SUCCESS":
                return jsonify({"detail": f"MFA verification failed with status: {status}"}), 400

            if password:
                logger.info("Step 3: Final step - initiate_auth with USER_PASSWORD_AUTH flow")
                try:
                    secret_hash = generate_client_secret_hash(username)
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
                    logger.info(f"initiate_auth response keys: {list(final_auth_response.keys())}")

                    if final_auth_response.get("ChallengeName") == "SOFTWARE_TOKEN_MFA":
                        mfa_session = final_auth_response.get("Session")
                        logger.info(f"Step 3b: Responding to MFA challenge with code: {code}")
                        mfa_response = cognito_client.respond_to_auth_challenge(
                            ClientId=CLIENT_ID,
                            ChallengeName="SOFTWARE_TOKEN_MFA",
                            Session=mfa_session,
                            ChallengeResponses={
                                "USERNAME": username,
                                "SOFTWARE_TOKEN_MFA_CODE": code,
                                "SECRET_HASH": secret_hash
                            }
                        )
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
                            }), 200
                        else:
                            return jsonify({
                                "message": "MFA setup verified successfully. Please log in again with your MFA code.",
                                "status": "SUCCESS"
                            }), 200
                    else:
                        return jsonify({
                            "message": "MFA setup verified successfully. Please log in again.",
                            "status": "SUCCESS"
                        }), 200
                except Exception as final_auth_error:
                    logger.error(f"Error in final authentication step: {final_auth_error}")
                    logger.error(traceback.format_exc())
                    return jsonify({
                        "message": "MFA setup verified, but couldn't complete login. Please log in again.",
                        "status": "SUCCESS"
                    }), 200
            else:
                return jsonify({
                    "message": "MFA setup verified successfully. Please log in again with your MFA code.",
                    "status": "SUCCESS"
                }), 200

        except cognito_client.exceptions.NotAuthorizedException as auth_error:
            logger.error(f"NotAuthorizedException: {auth_error}")
            return jsonify({"detail": "Your session has expired. Please log in again to restart the MFA setup process."}), 401

        except cognito_client.exceptions.CodeMismatchException as code_error:
            logger.warning(f"CodeMismatchException: {code_error}")
            logger.warning(traceback.format_exc())
            try:
                totp = pyotp.TOTP(secret_code)
                fresh_server_code = totp.now()
                fresh_client_code = None
                if adjusted_time_str:
                    adjusted_dt = datetime.fromisoformat(adjusted_time_str.replace('Z', '+00:00'))
                    fresh_client_code = totp.at(adjusted_dt)
                valid_codes = []
                for i in range(-3, 4):
                    window_time = datetime.now() + timedelta(seconds=30 * i)
                    valid_codes.append(totp.at(window_time))
                error_msg = f"The verification code is incorrect. Please use this current code: {fresh_server_code}"
                return jsonify({
                    "detail": error_msg,
                    "currentValidCode": fresh_server_code,
                    "serverCode": fresh_server_code,
                    "clientCode": fresh_client_code,
                    "validCodes": valid_codes,
                    "timeInfo": {
                        "serverTime": datetime.now().isoformat(),
                        "clientTime": client_time_str,
                        "adjustedTime": adjusted_time_str,
                        "timeDifference": time_diff_seconds
                    }
                }), 400
            except Exception:
                return jsonify({"detail": "The verification code is incorrect or has expired. Please try again."}), 400

        except Exception as e:
            logger.error(f"Error in MFA setup process: {e}")
            logger.error(traceback.format_exc())
            return jsonify({"detail": f"MFA verification failed: {str(e)}"}), 500

    except Exception as e:
        logger.error(f"Unhandled exception in confirm_mfa_setup_endpoint: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

@auth_services_routes.route("/verify-mfa", methods=["POST"])
def verify_mfa_endpoint():
    data = request.json
    session = data.get("session")
    code = data.get("code")
    username = data.get("username")
    client_time_str = data.get("client_time")
    adjusted_time_str = data.get("adjusted_time")

    server_time = datetime.now()
    logger.info(f"Server time: {server_time.isoformat()}")

    if client_time_str:
        try:
            client_time = datetime.fromisoformat(client_time_str.replace('Z', '+00:00'))
            time_diff = abs((server_time - client_time).total_seconds())
            logger.info(f"Client time: {client_time_str}, Time difference: {time_diff} seconds")
        except Exception as time_error:
            logger.warning(f"Error parsing client time: {time_error}")

    if adjusted_time_str:
        logger.info(f"Client adjusted time: {adjusted_time_str}")

    if not (session and username):
        return jsonify({"detail": "Session and username are required"}), 400

    if not code or not isinstance(code, str):
        return jsonify({"detail": "Verification code must be a 6-digit number"}), 400

    code = code.strip()
    if not code.isdigit() or len(code) != 6:
        return jsonify({"detail": "Verification code must be exactly 6 digits"}), 400

    secret_code = None
    valid_codes = []
    try:
        associate_response = cognito_client.associate_software_token(Session=session)
        secret_code = associate_response.get("SecretCode")

        if secret_code:
            totp = pyotp.TOTP(secret_code)
            for i in range(-5, 6):
                window_time = server_time + timedelta(seconds=30 * i)
                valid_codes.append(totp.at(window_time))
            server_code = totp.now()
            logger.info(f"Generated valid codes: {valid_codes}")
            logger.info(f"Current server code: {server_code}")
            if code not in valid_codes:
                logger.warning(f"User code {code} doesn't match any valid time window")
            else:
                logger.info(f"User code {code} matches a valid time window")
            if adjusted_time_str:
                try:
                    adjusted_time = datetime.fromisoformat(adjusted_time_str.replace('Z', '+00:00'))
                    adjusted_code = totp.at(adjusted_time)
                    logger.info(f"Code based on adjusted time: {adjusted_code}")
                    if code == adjusted_code:
                        logger.info("User code matches adjusted time code")
                except Exception as adj_error:
                    logger.warning(f"Error generating code from adjusted time: {adj_error}")
    except Exception as e:
        logger.info(f"Could not generate MFA code from session (normal for existing MFA users): {e}")

    auth_result = verify_mfa(session, code, username)
    if isinstance(auth_result, tuple):
        if auth_result[1] == 400 and valid_codes and len(valid_codes) > 0:
            error_data = auth_result[0]
            error_data["serverGeneratedCode"] = valid_codes[5]
            error_data["validCodes"] = valid_codes[4:7]
            error_data["timeInfo"] = {
                "serverTime": server_time.isoformat(),
                "clientTime": client_time_str,
                "adjustedTime": adjusted_time_str,
                "windowPosition": f"{int(time.time()) % 30}/30 seconds"
            }
            return jsonify(error_data), 400
        return jsonify(auth_result[0]), auth_result[1]
    return jsonify(auth_result), 200

@auth_services_routes.route("/forgot-password", methods=["POST"])
def forgot_password_endpoint():
    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400

        username = data.get("username")
        if not username:
            return jsonify({"detail": "Username is required"}), 400

        try:
            secret_hash = generate_client_secret_hash(username)
            response = cognito_client.forgot_password(
                ClientId=CLIENT_ID,
                Username=username,
                SecretHash=secret_hash
            )
            logger.info("Forgot password initiated successfully")
            return jsonify({
                "message": "Password reset initiated. Check your email for verification code.",
                "delivery": response.get("CodeDeliveryDetails"),
            }), 200
        except Exception as api_error:
            logger.error(f"Forgot password API call failed: {api_error}")
            return jsonify({"detail": f"Failed to initiate password reset: {str(api_error)}"}), 500
    except Exception as e:
        logger.error(f"Error in forgot_password_endpoint: {e}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

@auth_services_routes.route("/confirm-forgot-password", methods=["POST"])
def confirm_forgot_password_endpoint():
    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400

        username = data.get("username")
        confirmation_code = data.get("code")
        new_password = data.get("password")
        if not (username and confirmation_code and new_password):
            return jsonify({"detail": "Username, verification code, and new password are required"}), 400

        try:
            secret_hash = generate_client_secret_hash(username)
            cognito_client.confirm_forgot_password(
                ClientId=CLIENT_ID,
                Username=username,
                ConfirmationCode=confirmation_code,
                Password=new_password,
                SecretHash=secret_hash
            )
            logger.info("Password reset successfully")
            return jsonify({"message": "Password has been reset successfully."}), 200
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

@auth_services_routes.route("/server-time", methods=["GET"])
def server_time_endpoint():
    current_time = datetime.now()
    timestamp = int(time.time())
    return jsonify({
        "server_time": current_time.isoformat(),
        "timestamp": timestamp,
        "time_window": f"{timestamp % 30}/30 seconds"
    }), 200

@auth_services_routes.route("/health", methods=["GET"])
def health_check():
    cognito_status = "unknown"
    try:
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
