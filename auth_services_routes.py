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
from flask import Blueprint, request, jsonify
from dotenv import load_dotenv
import pyotp
import qrcode
from io import BytesIO
from base64 import b64encode
import traceback
import json

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

try:
    cognito_client = boto3.client("cognito-idp", region_name=os.getenv("REGION", "us-east-1"))
    logger.info("Successfully initialized Cognito client")
except Exception as e:
    logger.error(f"Failed to initialize Cognito client: {e}")
    cognito_client = boto3.client("cognito-idp", region_name="us-east-1")

auth_services_routes = Blueprint('auth_services_routes', __name__)

def generate_client_secret_hash(username: str) -> str:
    if not os.getenv("COGNITO_CLIENT_ID"):
        logger.error("CLIENT_ID is not configured")
        raise ValueError("CLIENT_ID is missing")
    if not os.getenv("COGNITO_CLIENT_SECRET"):
        logger.error("CLIENT_SECRET is not configured")
        raise ValueError("CLIENT_SECRET is missing")
    message = username + os.getenv("COGNITO_CLIENT_ID")
    secret = os.getenv("COGNITO_CLIENT_SECRET").encode("utf-8")
    hash_obj = hmac.new(secret, message.encode("utf-8"), hashlib.sha256)
    hash_result = base64.b64encode(hash_obj.digest()).decode()
    return hash_result

def generate_qr_code(secret_code, username, issuer="EncryptGate"):
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

def authenticate_user(username, password):
    logger.info(f"Authentication attempt for user: {username}")
    if not username or not password:
        logger.error("Missing username or password")
        return {"detail": "Username and password are required"}, 400

    if not os.getenv("COGNITO_CLIENT_ID"):
        logger.error("CLIENT_ID is not configured")
        return {"detail": "Authentication service misconfigured (CLIENT_ID missing)"}, 500
    if not os.getenv("COGNITO_CLIENT_SECRET"):
        logger.error("CLIENT_SECRET is not configured")
        return {"detail": "Authentication service misconfigured (CLIENT_SECRET missing)"}, 500
    if not os.getenv("COGNITO_USERPOOL_ID"):
        logger.error("USER_POOL_ID is not configured")
        return {"detail": "Authentication service misconfigured (USER_POOL_ID missing)"}, 500

    try:
        try:
            secret_hash = generate_client_secret_hash(username)
        except Exception as hash_error:
            logger.error(f"Failed to generate secret hash: {hash_error}")
            return {"detail": "Authentication error: Failed to generate credentials"}, 500

        try:
            logger.info(f"Initiating Cognito authentication for user: {username}")
            start_time = time.time()
            response = cognito_client.initiate_auth(
                ClientId=os.getenv("COGNITO_CLIENT_ID"),
                AuthFlow="USER_PASSWORD_AUTH",
                AuthParameters={
                    "USERNAME": username,
                    "PASSWORD": password,
                    "SECRET_HASH": secret_hash,
                },
            )
            time_taken = time.time() - start_time
            logger.info("Cognito authentication response received")
        except cognito_client.exceptions.NotAuthorizedException:
            logger.warning("Authentication failed: Invalid credentials")
            return {"detail": "Invalid username or password."}, 401
        except cognito_client.exceptions.UserNotFoundException:
            logger.warning("Authentication failed: User not found")
            return {"detail": "Invalid username or password."}, 401
        except botocore.exceptions.ClientError as client_error:
            error_message = client_error.response['Error']['Message']
            logger.error(f"AWS ClientError: {error_message}")
            return {"detail": f"Authentication failed: {error_message}"}, 500
        except Exception as api_error:
            logger.error(f"Cognito API call failed: {api_error}")
            return {"detail": f"Authentication failed: {str(api_error)}"}, 500

        auth_result = response.get("AuthenticationResult")
        if not auth_result:
            challenge_name = response.get("ChallengeName")
            if challenge_name:
                response_data = {
                    "ChallengeName": challenge_name,
                    "session": response.get("Session"),
                    "mfa_required": challenge_name == "SOFTWARE_TOKEN_MFA"
                }
                return response_data
            else:
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

        logger.info(f"Sending challenge response for user: {username}")
        start_time = time.time()
        try:
            response = cognito_client.respond_to_auth_challenge(
                ClientId=os.getenv("COGNITO_CLIENT_ID"),
                ChallengeName=challenge_name,
                Session=session,
                ChallengeResponses=challenge_responses_with_auth
            )
            time_taken = time.time() - start_time
            logger.info("Challenge response received")
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
            response_data = {
                "ChallengeName": next_challenge,
                "session": response.get("Session"),
                "mfa_required": next_challenge == "SOFTWARE_TOKEN_MFA"
            }
            if next_challenge == "MFA_SETUP":
                mfa_secret = pyotp.random_base32()
                response_data["secretCode"] = mfa_secret
                logger.info(f"Generated MFA secret for setup for user: {username}")
            return response_data
        
        logger.error("No AuthenticationResult or ChallengeName in response")
        return {"detail": "Invalid challenge response"}, 500
        
    except cognito_client.exceptions.InvalidPasswordException as pwd_error:
        logger.warning("Invalid password format")
        return {"detail": f"Password does not meet requirements: {str(pwd_error)}"}, 400
        
    except cognito_client.exceptions.CodeMismatchException as code_error:
        logger.warning(f"CodeMismatchException: {code_error}")
        return {"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}, 400
        
    except botocore.exceptions.ClientError as client_error:
        error_message = client_error.response['Error']['Message']
        logger.error(f"AWS ClientError: {error_message}")
        return {"detail": f"Challenge response failed: {error_message}"}, 500
        
    except Exception as e:
        logger.error(f"Challenge response error: {e}")
        return {"detail": f"Challenge response failed: {str(e)}"}, 500

def setup_mfa(access_token):
    logger.info("Setting up MFA")
    try:
        if not access_token or not isinstance(access_token, str) or len(access_token) < 20:
            logger.error("Invalid access token format")
            return {"detail": "Invalid access token format"}, 400
            
        try:
            user_response = cognito_client.get_user(AccessToken=access_token)
            username = user_response.get("Username", "user")
            logger.info(f"Retrieved username: {username}")
        except Exception as user_error:
            logger.error(f"Failed to get user details: {user_error}")
            return {"detail": f"Invalid access token: {str(user_error)}"}, 401
            
        try:
            start_time = time.time()
            associate_response = cognito_client.associate_software_token(
                AccessToken=access_token
            )
            time_taken = time.time() - start_time
            logger.info("Software token association successful")
        except botocore.exceptions.ClientError as client_error:
            error_message = client_error.response['Error']['Message']
            logger.error(f"AWS ClientError: {error_message}")
            return {"detail": f"MFA setup failed: {error_message}"}, 500
        except Exception as assoc_error:
            logger.error(f"Failed to associate software token: {assoc_error}")
            return {"detail": f"MFA setup failed: {str(assoc_error)}"}, 500
        
        secret_code = associate_response.get("SecretCode")
        if not secret_code:
            logger.error("No secret code in response")
            return {"detail": "Failed to generate MFA secret code"}, 500
        
        logger.info(f"Generated secret code: {secret_code}")
        qr_code = generate_qr_code(secret_code, username)
        if not qr_code:
            logger.warning("Failed to generate QR code, continuing with text secret only")
        
        return {
            "secretCode": secret_code,
            "qrCodeImage": qr_code,
            "message": "MFA setup initiated successfully",
            "username": username
        }
        
    except Exception as e:
        logger.error(f"Error setting up MFA: {e}")
        return {"detail": f"Failed to setup MFA: {str(e)}"}, 500

def verify_software_token_setup(access_token, code):
    logger.info("Verifying MFA setup")
    if not code or not isinstance(code, str):
        logger.error("Invalid code format")
        return {"detail": "Verification code must be a 6-digit number"}, 400
        
    code = code.strip()
    if not code.isdigit() or len(code) != 6:
        logger.error(f"Invalid code format: {code}")
        return {"detail": "Verification code must be exactly 6 digits"}, 400
    
    try:
        if not access_token or not isinstance(access_token, str) or len(access_token) < 20:
            logger.error("Invalid access token format")
            return {"detail": "Invalid access token format"}, 400
            
        try:
            user_info = cognito_client.get_user(AccessToken=access_token)
            username = user_info.get("Username", "unknown")
            logger.info(f"Verifying MFA setup for user: {username}")
        except Exception as user_error:
            logger.warning(f"Could not get username: {user_error}")
            username = "unknown"
        
        logger.info(f"Calling verify_software_token with code: {code}")
        start_time = time.time()
        
        try:
            response = cognito_client.verify_software_token(
                AccessToken=access_token,
                UserCode=code,
                FriendlyDeviceName="EncryptGate Auth App"
            )
            time_taken = time.time() - start_time
            logger.info("verify_software_token call completed")
            
            status = response.get("Status")
            logger.info(f"MFA verification status: {status}")
            
            if status == "SUCCESS":
                try:
                    cognito_client.set_user_mfa_preference(
                        AccessToken=access_token,
                        SoftwareTokenMfaSettings={
                            "Enabled": True,
                            "PreferredMfa": True
                        }
                    )
                    logger.info("MFA preference set successfully")
                except Exception as pref_error:
                    logger.warning(f"MFA verified but couldn't set preference: {pref_error}")
                return {
                    "message": "MFA setup verified successfully",
                    "status": status
                }
            else:
                logger.warning(f"Verification returned non-SUCCESS status: {status}")
                return {"detail": f"MFA verification failed with status: {status}"}, 400
            
        except cognito_client.exceptions.EnableSoftwareTokenMFAException as e:
            logger.error(f"Error enabling MFA: {e}")
            return {"detail": "Error enabling MFA. Try again or contact support."}, 400
        except cognito_client.exceptions.CodeMismatchException as code_error:
            logger.warning(f"CodeMismatchException: {code_error}")
            return {"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}, 400
        except botocore.exceptions.ClientError as client_error:
            error_message = client_error.response['Error']['Message']
            logger.error(f"AWS ClientError: {error_message}")
            return {"detail": f"MFA verification failed: {error_message}"}, 500
            
    except Exception as e:
        logger.error(f"Error verifying MFA setup: {e}")
        return {"detail": f"MFA verification failed: {str(e)}"}, 500

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
        logger.error("Invalid session format")
        return {"detail": "Invalid session format"}, 400
    
    try:
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
        
        logger.info(f"Sending MFA verification for user: {username}")
        start_time = time.time()
        
        try:
            response = cognito_client.respond_to_auth_challenge(
                ClientId=os.getenv("COGNITO_CLIENT_ID"),
                ChallengeName="SOFTWARE_TOKEN_MFA",
                Session=session,
                ChallengeResponses=challenge_responses
            )
            time_taken = time.time() - start_time
            logger.info("MFA verification response received")
            
            auth_result = response.get("AuthenticationResult")
            if auth_result:
                logger.info(f"MFA verification successful for user: {username}")
                return {
                    "id_token": auth_result.get("IdToken"),
                    "access_token": auth_result.get("AccessToken"),
                    "refresh_token": auth_result.get("RefreshToken"),
                    "token_type": auth_result.get("TokenType"),
                    "expires_in": auth_result.get("ExpiresIn"),
                }
            else:
                logger.error("No AuthenticationResult in MFA verification response")
                return {"detail": "Invalid MFA verification response"}, 500
        except cognito_client.exceptions.CodeMismatchException as code_error:
            logger.warning(f"CodeMismatchException: {code_error}")
            return {"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}, 400
        except botocore.exceptions.ClientError as client_error:
            error_message = client_error.response['Error']['Message']
            logger.error(f"AWS ClientError: {error_message}")
            return {"detail": f"MFA verification failed: {error_message}"}, 500
    except Exception as e:
        logger.error(f"Error during MFA verification: {e}")
        return {"detail": f"MFA verification failed: {str(e)}"}, 500
