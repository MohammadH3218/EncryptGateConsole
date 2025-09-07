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
from boto3.dynamodb.conditions import Key

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
mfa_logger = logging.getLogger("mfa_operations")
mfa_logger.setLevel(logging.INFO)

# AWS Configuration
AWS_REGION = os.getenv("REGION", "us-east-1")
CLOUDSERVICES_TABLE = os.getenv("CLOUDSERVICES_TABLE_NAME", "CloudServices")

# Legacy AWS Cognito Configuration (for backward compatibility)
USER_POOL_ID = os.getenv("COGNITO_USERPOOL_ID")
CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")
CLIENT_SECRET = os.getenv("COGNITO_CLIENT_SECRET")

# Create AWS clients
try:
    cognito_client = boto3.client("cognito-idp", region_name=AWS_REGION)
    ddb = boto3.client('dynamodb', region_name=AWS_REGION)
    logger.info(f"Successfully initialized AWS clients for region {AWS_REGION}")
except Exception as e:
    logger.error(f"Failed to initialize AWS clients: {e}")
    cognito_client = boto3.client("cognito-idp", region_name="us-east-1")
    ddb = boto3.client('dynamodb', region_name="us-east-1")

# Blueprint for auth routes
auth_services_routes = Blueprint('auth_services_routes', __name__)

# Multi-organization support
SERVICE_ALIASES = {"cognito", "aws-cognito", "amazon-cognito"}

def _norm(it: dict) -> dict:
    """Normalize DynamoDB item to standard format"""
    def gv(k): 
        return it.get(k) or ""
    return {
        "orgId": gv("orgId"),
        "serviceType": gv("serviceType"),
        "region": gv("region") or AWS_REGION,
        "userPoolId": gv("userPoolId"),
        "clientId": gv("clientId"),
        "clientSecret": gv("clientSecret"),
    }

def get_org_cognito(org_id: str):
    """Get Cognito configuration for a specific organization"""
    try:
        # Try GSI1 (orgId, serviceType) first if available
        try:
            table = boto3.resource('dynamodb', region_name=AWS_REGION).Table(CLOUDSERVICES_TABLE)
            resp = table.query(
                IndexName="GSI1", 
                KeyConditionExpression=Key("orgId").eq(org_id), 
                Limit=10
            )
            for raw in resp.get("Items", []):
                it = _norm(raw)
                if it["serviceType"] in SERVICE_ALIASES:
                    return it
        except Exception as gsi_error:
            logger.warning(f"GSI query failed, falling back to scan: {gsi_error}")
    
        # Fallback: Scan with filter
        for st in SERVICE_ALIASES:
            resp = ddb.scan(
                TableName=CLOUDSERVICES_TABLE,
                FilterExpression="orgId = :o AND serviceType = :t",
                ExpressionAttributeValues={
                    ":o": {"S": org_id}, 
                    ":t": {"S": st}
                },
                Limit=1,
            )
            items = resp.get("Items", [])
            if items:
                # Unwrap DynamoDB attribute values
                it = {k: (list(v.values())[0] if isinstance(v, dict) else v) for k, v in items[0].items()}
                return _norm(it)
        return None
    except Exception as e:
        logger.error(f"Error getting Cognito config for org {org_id}: {e}")
        return None

# Generate Client Secret Hash
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
    """
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
                challenge_responses[f"userAttributes.custom:{k.split(':',1)[1]}"] = str(v)
            else:
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

def respond_to_mfa_challenge(client, client_id: str, username: str, session: str, mfa_code: str = None, client_secret: str = None):
    """
    Completes the authentication by responding to an MFA challenge.
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
    response.headers.add("Access-Control-Max-Age", "3600")
    return response, 204

@auth_services_routes.route("/authenticate", methods=["OPTIONS", "POST"])
def authenticate_user_route():
    """UPDATED AUTHENTICATION ENDPOINT with multi-org support and fallback"""
    if request.method == "OPTIONS":
        return handle_cors_preflight()

    try:
        data = request.json
        if not data:
            return jsonify({"detail": "No JSON data provided"}), 400
            
        username = data.get('username')
        password = data.get('password')
        orgId = data.get('orgId')
        
        if not username or not password:
            return jsonify({"detail": "Username and password are required"}), 400
        
        # Get organization's Cognito configuration
        if orgId:
            logger.info(f"Looking up Cognito config for org: {orgId}")
            cfg = get_org_cognito(orgId)
            if not cfg:
                return jsonify({
                    "success": False, 
                    "message": f"No Cognito configuration for org {orgId}"
                }), 400
            
        else:
            # Fallback to default organization
            default_org_id = os.getenv("DEFAULT_ORGANIZATION_ID", "company1")
            logger.info(f"No orgId provided, using default organization: {default_org_id}")
            
            cfg = get_org_cognito(default_org_id)
            if not cfg:
                return jsonify({
                    "success": False, 
                    "message": f"Please set up your organization first. No configuration found for {default_org_id}. Visit /setup-organization to get started."
                }), 400
            
            orgId = default_org_id  # Set orgId for response
                
        # Validate required config
        missing = [k for k in ("clientId", "userPoolId") if not cfg.get(k)]
        if missing:
            return jsonify({
                "success": False, 
                "message": f"Cognito config missing: {', '.join(missing)} for org {orgId}"
            }), 400
            
        logger.info(f"Cognito cfg resolved org={orgId} type={cfg['serviceType']} pool={cfg['userPoolId']} clientId={cfg['clientId']} region={cfg['region']}")
        
        # Use org-specific configuration
        client_id = cfg["clientId"]
        client_secret = cfg.get("clientSecret")
        user_pool_id = cfg["userPoolId"]
        region = cfg["region"]
        
        # Create org-specific Cognito client
        org_cognito_client = boto3.client("cognito-idp", region_name=region)
        
        # Step 1: Initiate authentication using the org-specific config
        logger.info(f"=== Starting authentication flow for user: {username} in org: {orgId or 'global'} ===")
        
        try:
            auth_response = initiate_authentication(
                org_cognito_client, client_id, username, password, client_secret
            )
        except Exception as auth_error:
            logger.error(f"Authentication failed: {auth_error}")
            return jsonify({"detail": str(auth_error)}), 401
        
        # Step 2: Handle the response
        if "AuthenticationResult" in auth_response:
            logger.info("User fully authenticated - returning tokens")
            tokens = auth_response["AuthenticationResult"]
            return jsonify({
                "status": "SUCCESS",
                "id_token": tokens.get("IdToken"),
                "access_token": tokens.get("AccessToken"),
                "refresh_token": tokens.get("RefreshToken"),
                "token_type": tokens.get("TokenType"),
                "expires_in": tokens.get("ExpiresIn"),
                "orgId": orgId
            })
        
        elif auth_response.get("ChallengeName"):
            challenge_name = auth_response.get("ChallengeName")
            session = auth_response.get("Session")
            
            logger.info(f"Challenge required: {challenge_name}")
            
            return jsonify({
                "status": "CHALLENGE",
                "challenge": challenge_name,
                "ChallengeName": challenge_name,
                "session": session,
                "orgId": orgId,
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
    """UPDATED CHALLENGE RESPONSE ENDPOINT with multi-org support"""
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
        orgId = data.get('orgId')
        
        # Also accept new format parameters
        newPassword = data.get('newPassword')
        mfaCode = data.get('mfaCode')
        
        if not (username and session):
            return jsonify({"detail": "Username and session are required"}), 400
        
        # Get organization's Cognito configuration
        if orgId:
            cfg = get_org_cognito(orgId)
            if not cfg:
                return jsonify({
                    "success": False, 
                    "message": f"No Cognito configuration for org {orgId}"
                }), 400
                
            client_id = cfg["clientId"]
            client_secret = cfg.get("clientSecret")
            user_pool_id = cfg["userPoolId"]
            region = cfg["region"]
            org_cognito_client = boto3.client("cognito-idp", region_name=region)
        else:
            client_id = CLIENT_ID
            client_secret = CLIENT_SECRET
            user_pool_id = USER_POOL_ID
            org_cognito_client = cognito_client
        
        # Determine challenge name and responses
        if newPassword:
            determined_challenge_name = "NEW_PASSWORD_REQUIRED"
            responses = {"NEW_PASSWORD": newPassword, "USERNAME": username}
        elif mfaCode:
            determined_challenge_name = "SOFTWARE_TOKEN_MFA"
            responses = {"SOFTWARE_TOKEN_MFA_CODE": mfaCode, "USERNAME": username}
        elif challenge_name and challenge_responses:
            determined_challenge_name = challenge_name
            responses = dict(challenge_responses)
            responses["USERNAME"] = username
        else:
            return jsonify({"detail": "Must provide newPassword, mfaCode, or challengeResponses"}), 400
        
        # Add SECRET_HASH if client secret is present
        if client_secret:
            responses["SECRET_HASH"] = _calculate_secret_hash(username, client_id, client_secret)
            logger.info("Including SECRET_HASH for challenge response")
        
        logger.info(f"=== Responding to {determined_challenge_name} challenge for user: {username} in org: {orgId or 'global'} ===")
        
        try:
            response = org_cognito_client.respond_to_auth_challenge(
                ClientId=client_id,
                ChallengeName=determined_challenge_name,
                Session=session,
                ChallengeResponses=responses
            )
        except Exception as challenge_error:
            logger.error(f"Challenge response failed: {challenge_error}")
            return jsonify({"detail": str(challenge_error)}), 400
        
        # Handle the response
        if "AuthenticationResult" in response:
            logger.info("Challenge completed successfully - returning tokens")
            tokens = response["AuthenticationResult"]
            return jsonify({
                "status": "SUCCESS",
                "success": True,
                "access_token": tokens.get("AccessToken"),
                "id_token": tokens.get("IdToken"),
                "refresh_token": tokens.get("RefreshToken"),
                "orgId": orgId
            })
        
        elif response.get("ChallengeName"):
            next_challenge = response.get("ChallengeName")
            new_session = response.get("Session")
            
            logger.info(f"Next challenge required: {next_challenge}")
            
            result = {
                "status": "CHALLENGE",
                "success": True,
                "challenge": next_challenge,
                "ChallengeName": next_challenge,
                "session": new_session,
                "orgId": orgId,
                "mfa_required": next_challenge == "SOFTWARE_TOKEN_MFA"
            }
            
            # For MFA_SETUP challenge, get the secret
            if next_challenge == "MFA_SETUP":
                try:
                    secret_response = org_cognito_client.associate_software_token(Session=new_session)
                    result["secretCode"] = secret_response.get("SecretCode")
                    result["session"] = secret_response.get("Session", new_session)
                    logger.info(f"MFA setup initiated for org {orgId}")
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

# Additional endpoints for forgot password, MFA setup, etc.
@auth_services_routes.route("/forgot-password", methods=["POST", "OPTIONS"])
def forgot_password_endpoint():
    """Forgot password initiation endpoint"""
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
        
        # For now, use global Cognito config - can be enhanced for multi-org later
        if not CLIENT_ID:
            return jsonify({"detail": "Cognito not configured"}), 500
        
        try:
            params = {"ClientId": CLIENT_ID, "Username": username.strip().lower()}
            if CLIENT_SECRET:
                params["SecretHash"] = _calculate_secret_hash(username, CLIENT_ID, CLIENT_SECRET)

            resp = cognito_client.forgot_password(**params)
            delivery_details = resp.get("CodeDeliveryDetails", {})
            logger.info(f"Forgot password initiated successfully, delivery: {delivery_details}")
            
            return jsonify({
                "success": True,
                "message": "If an account with this email exists, you will receive a password reset code shortly.",
                "delivery": delivery_details
            })
            
        except Exception as forgot_error:
            logger.error(f"Forgot password failed: {forgot_error}")
            # Always return success for security
            return jsonify({
                "success": True,
                "message": "If an account with this email exists, you will receive a password reset code shortly."
            })
            
    except Exception as e:
        logger.error(f"Error in forgot password endpoint: {e}")
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

@auth_services_routes.route("/confirm-forgot-password", methods=["POST", "OPTIONS"])
def confirm_forgot_password_endpoint():
    """Confirm forgot password endpoint"""
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
            params = {
                "ClientId": CLIENT_ID,
                "Username": username.strip().lower(),
                "ConfirmationCode": confirmation_code,
                "Password": new_password,
            }
            if CLIENT_SECRET:
                params["SecretHash"] = _calculate_secret_hash(username, CLIENT_ID, CLIENT_SECRET)

            cognito_client.confirm_forgot_password(**params)
            logger.info(f"Password reset completed successfully for user: {username}")
            
            return jsonify({
                "success": True,
                "message": "Password has been reset successfully. You can now log in with your new password."
            })
                
        except Exception as confirm_error:
            logger.error(f"Forgot password confirmation failed: {confirm_error}")
            return jsonify({"detail": str(confirm_error)}), 400
            
    except Exception as e:
        logger.error(f"Error in confirm forgot password endpoint: {e}")
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