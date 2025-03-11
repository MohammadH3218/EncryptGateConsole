import logging
import os
import sys
import traceback
import requests
import jwt
import time
import boto3
import botocore
import hmac
import hashlib
import base64
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone
import importlib.util
import pyotp
import qrcode
from io import BytesIO
from base64 import b64encode

# Load environment variables
load_dotenv()

# Initialize the Flask app (Global for Gunicorn)
app = Flask(__name__)

# === Logging Setup ===
def setup_comprehensive_logging():
    try:
        log_dir = "/var/log/encryptgate"
        try:
            os.makedirs(log_dir, exist_ok=True)
        except PermissionError:
            # Fall back to a directory we can write to
            log_dir = "/tmp/encryptgate_logs"
            os.makedirs(log_dir, exist_ok=True)
            print(f"WARNING: Could not access /var/log/encryptgate, using {log_dir} instead")

        logging.basicConfig(
            level=logging.DEBUG,
            format="%(asctime)s [%(levelname)s] %(pathname)s:%(lineno)d - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
            handlers=[
                logging.StreamHandler(sys.stdout),
                logging.FileHandler(os.path.join(log_dir, "application_debug.log"), mode='a')
            ]
        )

        # Capture unhandled exceptions
        def handle_unhandled_exception(exc_type, exc_value, exc_traceback):
            if issubclass(exc_type, KeyboardInterrupt):
                sys.__excepthook__(exc_type, exc_value, exc_traceback)
                return
            logging.error("Uncaught exception", exc_info=(exc_type, exc_value, exc_traceback))

        sys.excepthook = handle_unhandled_exception
    except Exception as e:
        # Ensure setup_comprehensive_logging never fails the application startup
        print(f"WARNING: Could not set up comprehensive logging: {e}")
        logging.basicConfig(
            level=logging.DEBUG,
            format="%(asctime)s [%(levelname)s] %(pathname)s:%(lineno)d - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
            handlers=[
                logging.StreamHandler(sys.stdout)
            ]
        )

setup_comprehensive_logging()
logger = logging.getLogger(__name__)

# === Log Environment Details ===
def log_environment_details():
    logger.info("=== Environment and System Details ===")
    logger.info(f"Python Executable: {sys.executable}")
    logger.info(f"Python Version: {sys.version}")
    logger.info(f"Current Working Directory: {os.getcwd()}")

    logger.info("Python Path:")
    for path in sys.path:
        logger.info(f"  {path}")

    logger.info("Environment Variables:")
    for key, value in os.environ.items():
        if key.lower() not in ['password', 'secret', 'token', 'aws_secret_access_key']:
            logger.info(f"  {key}: {value}")

log_environment_details()

# === Ensure Required Directories Exist ===
try:
    pid_dir = "/var/pids"
    os.makedirs(pid_dir, exist_ok=True)
    logger.info(f"PID directory set: {pid_dir}")
except PermissionError:
    pid_dir = "/tmp/pids"
    os.makedirs(pid_dir, exist_ok=True)
    logger.info(f"Could not use /var/pids, using {pid_dir} instead")
except Exception as e:
    logger.error(f"Error setting up PID directory: {e}")

# === API URL Configuration ===
API_URL = os.getenv("API_URL", "http://localhost:8080")
logger.info(f"API URL: {API_URL}")

# === CORS Configuration ===
cors_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net")
allowed_origins = [origin.strip() for origin in cors_origins.split(",")]
logger.info(f"CORS Origins: {allowed_origins}")

# Apply CORS to all routes with expanded configuration
CORS(app, 
     resources={r"/*": {"origins": allowed_origins}},  # Changed from /api/* to /* to cover all routes
     supports_credentials=True,
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Authorization", "Content-Type", "Accept", "Origin"])

# Global after_request handler to ensure CORS headers are added to all responses
@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin", "")
    logger.debug(f"Processing response for origin: {origin}")
    
    if origin in allowed_origins or "*" in allowed_origins:
        response.headers.set("Access-Control-Allow-Origin", origin)
    else:
        # Default to the primary domain if origin is not in allowed list
        response.headers.set("Access-Control-Allow-Origin", "https://console-encryptgate.net")
    
    # Set other CORS headers
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Origin")
    response.headers.set("Access-Control-Allow-Credentials", "true")
    
    return response

# Add debug logger for CORS issues
@app.after_request
def log_cors_debug_info(response):
    origin = request.headers.get("Origin", "None")
    method = request.method
    path = request.path
    
    logger.info(f"CORS Debug - Request: {method} {path} from Origin: {origin}")
    logger.info(f"CORS Debug - Response Headers: {dict(response.headers)}")
    
    # Check if CORS headers are set correctly
    has_cors_origin = "Access-Control-Allow-Origin" in response.headers
    logger.info(f"CORS Debug - Has Allow-Origin Header: {has_cors_origin}")
    
    # Log allowed origins for reference
    logger.info(f"CORS Debug - Configured Allowed Origins: {allowed_origins}")
    
    return response

# Get the absolute path of the current directory
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)
    logger.info(f"Added {current_dir} to Python path")

# === Helper function for normalized ISO 8601 datetime parsing ===
def parse_iso_datetime(datetime_str):
    """
    Parse ISO 8601 datetime string to timezone-aware datetime object
    Handles both formats with or without 'Z' timezone indicator
    """
    if not datetime_str:
        return None
        
    try:
        # Replace Z with +00:00 for better compatibility
        if datetime_str.endswith('Z'):
            datetime_str = datetime_str[:-1] + '+00:00'
        
        # If no timezone info, assume UTC
        if '+' not in datetime_str and '-' not in datetime_str[10:]:
            datetime_str += '+00:00'
            
        # Parse datetime with timezone info
        dt = datetime.fromisoformat(datetime_str)
        
        # Ensure timezone awareness
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
            
        return dt
    except Exception as e:
        logger.warning(f"Error parsing datetime: {datetime_str} - {e}")
        return None

# === Helper function to get current time in UTC ===
def get_current_utc_datetime():
    """Get current time as timezone-aware UTC datetime"""
    return datetime.now(timezone.utc)

# === Helper function to calculate time difference in seconds ===
def get_time_difference_seconds(dt1, dt2):
    """
    Calculate time difference in seconds between two datetime objects
    Ensures both datetimes are timezone-aware
    """
    if dt1 is None or dt2 is None:
        return None
        
    # Ensure timezone awareness
    if dt1.tzinfo is None:
        dt1 = dt1.replace(tzinfo=timezone.utc)
    if dt2.tzinfo is None:
        dt2 = dt2.replace(tzinfo=timezone.utc)
        
    try:
        diff = abs((dt1 - dt2).total_seconds())
        return diff
    except Exception as e:
        logger.warning(f"Error calculating time difference: {e}")
        return None

# === AWS Cognito Configuration ===
COGNITO_REGION = os.getenv("REGION", "us-east-1")
COGNITO_USERPOOL_ID = os.getenv("COGNITO_USERPOOL_ID")
COGNITO_CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")
COGNITO_CLIENT_SECRET = os.getenv("COGNITO_CLIENT_SECRET")

logger.info(f"Cognito Region: {COGNITO_REGION}")
logger.info(f"Cognito UserPool ID: {COGNITO_USERPOOL_ID}")

# === Helper function for CORS preflight requests ===
def handle_preflight_request():
    response = jsonify({"status": "success"})
    origin = request.headers.get("Origin", "")
    logger.info(f"Handling CORS preflight for origin: {origin}")
    
    if origin in allowed_origins or "*" in allowed_origins:
        response.headers.set("Access-Control-Allow-Origin", origin)
    else:
        response.headers.set("Access-Control-Allow-Origin", "https://console-encryptgate.net")
        
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Origin")
    response.headers.set("Access-Control-Allow-Credentials", "true")
    response.headers.set("Access-Control-Max-Age", "3600")  # Cache preflight for 1 hour
    
    return response, 204

# === Basic Health Check Route ===
@app.route("/", methods=["GET"])
def root():
    return jsonify({"status": "success", "message": "EncryptGate API Root"}), 200

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy", 
        "message": "EncryptGate API is Running!",
        "timestamp": get_current_utc_datetime().isoformat()
    }), 200

# === Direct fallback for test-mfa-code with improved time handling ===
@app.route("/api/auth/test-mfa-code", methods=["POST", "OPTIONS"])
def direct_test_mfa_code():
    """Direct fallback for MFA code testing with improved time handling"""
    logger.info(f"test-mfa-code endpoint accessed with method: {request.method}")
    
    if request.method == "OPTIONS":
        logger.info("Handling OPTIONS preflight request")
        return handle_preflight_request()
    
    try:
        # Log request body
        try:
            data = request.json
            logger.info(f"Request body (test-mfa-code): {data}")
        except Exception as e:
            logger.info(f"Could not parse request body: {e}")
            data = {}
            
        secret = data.get('secret', '')
        code = data.get('code', '')
        client_time_str = data.get('client_time')
        adjusted_time_str = data.get('adjusted_time')
        
        # Get current server time (timezone-aware)
        server_time = get_current_utc_datetime()
        logger.info(f"Server time (UTC): {server_time.isoformat()}")
        
        # Parse client times with proper timezone handling
        client_time = parse_iso_datetime(client_time_str)
        adjusted_time = parse_iso_datetime(adjusted_time_str)
        
        # Calculate time differences in seconds
        client_time_diff = get_time_difference_seconds(server_time, client_time) if client_time else None
        adjusted_time_diff = get_time_difference_seconds(server_time, adjusted_time) if adjusted_time else None
        
        # Log time differences
        if client_time_diff is not None:
            logger.info(f"Client time difference: {client_time_diff} seconds")
        if adjusted_time_diff is not None:
            logger.info(f"Adjusted time difference: {adjusted_time_diff} seconds")
        
        if not secret:
            return jsonify({
                "valid": False, 
                "error": "Missing secret",
                "server_time": server_time.isoformat()
            }), 400
        
        # Create a TOTP object with the secret
        try:
            totp = pyotp.TOTP(secret)
            current_time_unix = time.time()
            
            # Generate codes using different time sources
            server_code = totp.now()  # Using server time
            
            # Current server-calculated code
            current_code = server_code
            
            # Generate codes for adjacent time windows
            prev_code = totp.at(server_time - timedelta(seconds=30))
            next_code = totp.at(server_time + timedelta(seconds=30))
            
            # Generate code using client time if provided
            client_code = None
            if adjusted_time:
                try:
                    client_code = totp.at(adjusted_time)
                    logger.info(f"Code based on client adjusted time: {client_code}")
                except Exception as adj_error:
                    logger.warning(f"Error generating code with adjusted time: {adj_error}")
            
            # Verify the code with a window if provided
            is_valid = False
            if code:
                # Try with server time first (with extended window for larger time differences)
                is_valid = totp.verify(code, valid_window=5)
                
                # If that fails and we have client time, try with that
                if not is_valid and client_code:
                    is_valid = (code == client_code)
                    
                logger.info(f"Code validation result: {is_valid}, Server code: {current_code}, Client code: {client_code}")
            else:
                is_valid = True  # No code provided to verify
            
            # Return comprehensive info for debugging
            return jsonify({
                "valid": is_valid,
                "provided_code": code if code else "Not provided",
                "current_code": current_code,
                "client_code": client_code,
                "prev_code": prev_code,
                "next_code": next_code,
                "timestamp": int(current_time_unix),
                "time_window": f"{int(current_time_unix) % 30}/30 seconds",
                "server_time": server_time.isoformat(),
                "time_sync_info": {
                    "server_time": server_time.isoformat(),
                    "client_time": client_time.isoformat() if client_time else None,
                    "adjusted_time": adjusted_time.isoformat() if adjusted_time else None,
                    "client_diff_seconds": client_time_diff,
                    "adjusted_diff_seconds": adjusted_time_diff
                }
            })
        except Exception as totp_error:
            logger.error(f"TOTP error: {totp_error}")
            return jsonify({
                "valid": False, 
                "error": str(totp_error),
                "server_time": server_time.isoformat()
            }), 500
    except Exception as e:
        logger.error(f"Error in direct_test_mfa_code: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            "valid": False, 
            "error": str(e),
            "server_time": get_current_utc_datetime().isoformat()
        }), 500

# Enhanced version of direct_confirm_mfa_setup with improved time handling
@app.route("/api/auth/confirm-mfa-setup", methods=["POST", "OPTIONS"])
def direct_confirm_mfa_setup():
    """Direct fallback for confirming MFA setup with improved time handling"""
    logger.info(f"Confirm MFA setup endpoint accessed - Method: {request.method}")
    
    if request.method == "OPTIONS":
        logger.info("Handling OPTIONS preflight request")
        return handle_preflight_request()
    
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
        client_time_str = data.get('client_time')
        adjusted_time_str = data.get('adjusted_time')
        
        # Get current server time (timezone-aware)
        server_time = get_current_utc_datetime()
        logger.info(f"Server time (UTC): {server_time.isoformat()}")
        
        # Parse client times with proper timezone handling
        client_time = parse_iso_datetime(client_time_str)
        adjusted_time = parse_iso_datetime(adjusted_time_str)
        
        # Calculate time differences in seconds
        client_time_diff = get_time_difference_seconds(server_time, client_time) if client_time else None
        adjusted_time_diff = get_time_difference_seconds(server_time, adjusted_time) if adjusted_time else None
        
        # Log time differences
        if client_time_diff is not None:
            logger.info(f"Client time difference: {client_time_diff} seconds")
        if adjusted_time_diff is not None:
            logger.info(f"Adjusted time difference: {adjusted_time_diff} seconds")
        
        # Enhanced session validation and logging
        if session:
            logger.info(f"Session token length: {len(session)}")
            logger.info(f"First 20 chars of session: {session[:20] if len(session) > 20 else session}")
            logger.info(f"Last 20 chars of session: {session[-20:] if len(session) > 20 else session}")
            
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
        
        # Initialize Cognito client
        try:
            cognito_client = boto3.client("cognito-idp", region_name=os.getenv("REGION", "us-east-1"))
        except Exception as e:
            logger.error(f"Failed to initialize Cognito client: {e}")
            return jsonify({"detail": "Failed to connect to authentication service"}), 500
        
        # Follow the same sequence for MFA setup
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
            if new_session:
                logger.info(f"New session length after associate_software_token: {len(new_session)}")
                logger.info(f"First 20 chars of new session: {new_session[:20] if len(new_session) > 20 else new_session}")
                logger.info(f"Last 20 chars of new session: {new_session[-20:] if len(new_session) > 20 else new_session}")
            
            if not secret_code:
                logger.error("Failed to get secret code from associate_software_token")
                return jsonify({"detail": "Failed to setup MFA. Please try again."}), 500
            
            # Add debug info to check TOTP validation directly
            try:
                # Create a TOTP object with the secret
                totp = pyotp.TOTP(secret_code)
                
                # Generate codes with different time sources for debugging
                server_code = totp.now()  # Using server time
                
                # Try with client times if provided
                client_code = None
                adjusted_code = None
                
                if client_time:
                    try:
                        client_code = totp.at(client_time)
                    except Exception as cl_error:
                        logger.warning(f"Error generating code with client time: {cl_error}")
                
                if adjusted_time:
                    try:
                        adjusted_code = totp.at(adjusted_time)
                    except Exception as adj_error:
                        logger.warning(f"Error generating code with adjusted time: {adj_error}")
                
                # Check if the user-provided code matches any of our calculated codes
                is_valid_server = totp.verify(code, valid_window=2)  # Using server time with window
                is_valid_client = client_code and code == client_code
                is_valid_adjusted = adjusted_code and code == adjusted_code
                is_valid = is_valid_server or is_valid_client or is_valid_adjusted
                
                logger.info(f"TOTP Validation: Server code = {server_code}, Client code = {client_code}, Adjusted code = {adjusted_code}, User code = {code}")
                logger.info(f"Valid with server time: {is_valid_server}, Valid with client time: {is_valid_client}, Valid with adjusted time: {is_valid_adjusted}")
                logger.info(f"Time window position: {int(time.time()) % 30}/30 seconds")
                
                # Check adjacent time windows
                prev_window = totp.at(server_time - timedelta(seconds=30))
                next_window = totp.at(server_time + timedelta(seconds=30))
                logger.info(f"Adjacent codes: Previous = {prev_window}, Current = {server_code}, Next = {next_window}")
                
                # If code doesn't match, log it but we may proceed anyway
                if not is_valid:
                    # Build a list of all possible valid codes we've calculated
                    valid_codes = [server_code, prev_window, next_window]
                    if client_code:
                        valid_codes.append(client_code)
                    if adjusted_code:
                        valid_codes.append(adjusted_code)
                    
                    # Remove duplicates
                    valid_codes = list(set(valid_codes))
                    
                    if code in valid_codes:
                        logger.info(f"Code matches one of our calculated codes, continuing")
                    else:
                        logger.warning(f"Code {code} doesn't match any valid window: {valid_codes}")
                        # Continue anyway - let Cognito handle validation, but log it clearly
                        logger.warning("Proceeding with verification despite code mismatch")
            except Exception as totp_error:
                logger.error(f"TOTP validation error: {totp_error}")
            
            # Step 2: Call verify_software_token with the session and code
            # Note: We're proceeding with the API call even if our local validation failed
            logger.info(f"Step 2: Calling verify_software_token with session and code: {code}")
            
            # Use new session if available, otherwise use original
            verify_session = new_session if new_session else session
            
            try:
                # This is the critical verification call
                verify_response = cognito_client.verify_software_token(
                    Session=verify_session,
                    UserCode=code
                )
                
                # If we get here, the verification succeeded despite any local validation issues
                status = verify_response.get("Status")
                verify_session = verify_response.get("Session")  # Get possibly new session
                
                logger.info(f"MFA verification status: {status}")
                if verify_session:
                    logger.info(f"Session length after verify_software_token: {len(verify_session)}")
                    logger.info(f"First 20 chars: {verify_session[:20] if len(verify_session) > 20 else verify_session}")
                    logger.info(f"Last 20 chars: {verify_session[-20:] if len(verify_session) > 20 else verify_session}")
                
                if status != "SUCCESS":
                    logger.warning(f"Verification returned non-SUCCESS status: {status}")
                    return jsonify({"detail": f"MFA verification failed with status: {status}"}), 400
            except cognito_client.exceptions.CodeMismatchException as code_error:
                logger.error(f"AWS rejected the code: {code_error}")
                
                # Generate a fresh code with both server and client time for helpful error message
                fresh_server_code = totp.now()
                fresh_client_code = None
                fresh_adjusted_code = None
                
                if client_time:
                    try:
                        fresh_client_code = totp.at(client_time)
                    except Exception:
                        pass
                
                if adjusted_time:
                    try:
                        fresh_adjusted_code = totp.at(adjusted_time)
                    except Exception:
                        pass
                
                # Determine the best code to suggest based on time differences
                suggested_code = fresh_server_code
                if adjusted_time_diff is not None and adjusted_time_diff < 30:
                    # If adjusted time is close to server time, use that code
                    suggested_code = fresh_adjusted_code or fresh_server_code
                elif client_time_diff is not None and client_time_diff < 30:
                    # Otherwise if client time is close, use that code
                    suggested_code = fresh_client_code or fresh_server_code
                
                # Return both codes to help user troubleshoot
                error_msg = (
                    "The verification code is incorrect. Try this current code: "
                    f"{suggested_code}"
                )
                
                return jsonify({
                    "detail": error_msg,
                    "currentValidCode": suggested_code,
                    "serverCode": fresh_server_code,
                    "clientCode": fresh_client_code,
                    "adjustedCode": fresh_adjusted_code,
                    "timeInfo": {
                        "serverTime": server_time.isoformat(),
                        "clientTimeDiff": client_time_diff,
                        "adjustedTimeDiff": adjusted_time_diff
                    }
                }), 400
                
            # Step 3: For the final step, use the SOFTWARE_TOKEN_MFA flow if we have a password
            if password:
                # We have the password, so we can complete the full flow
                logger.info(f"Step 3: Final step - initiate_auth with USER_PASSWORD_AUTH flow")
                
                try:
                    # Generate secret hash
                    CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")
                    CLIENT_SECRET = os.getenv("COGNITO_CLIENT_SECRET")
                    
                    message = username + CLIENT_ID
                    secret = CLIENT_SECRET.encode("utf-8")
                    hash_obj = hmac.new(secret, message.encode("utf-8"), hashlib.sha256)
                    hash_digest = hash_obj.digest()
                    secret_hash = base64.b64encode(hash_digest).decode()
                    
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
                        
                        if mfa_session:
                            logger.info(f"MFA challenge session length: {len(mfa_session)}")
                            logger.info(f"First 20 chars: {mfa_session[:20] if len(mfa_session) > 20 else mfa_session}")
                            logger.info(f"Last 20 chars: {mfa_session[-20:] if len(mfa_session) > 20 else mfa_session}")
                        
                        # Get a fresh code using the best time source
                        try:
                            fresh_server_code = totp.now()
                            
                            # Try with client time if available
                            fresh_client_code = None
                            fresh_adjusted_code = None
                            
                            if client_time:
                                try:
                                    fresh_client_code = totp.at(client_time)
                                except Exception:
                                    pass
                            
                            if adjusted_time:
                                try:
                                    fresh_adjusted_code = totp.at(adjusted_time)
                                except Exception:
                                    pass
                            
                            logger.info(f"Generated fresh TOTP codes - Server: {fresh_server_code}, Client: {fresh_client_code}, Adjusted: {fresh_adjusted_code}")
                            
                            # Choose the best code based on time differences
                            if is_valid:
                                # If original code was valid in our tests, use it
                                verification_code = code
                            elif adjusted_time_diff is not None and adjusted_time_diff < 30:
                                # If adjusted time is close to server time, use that code
                                verification_code = fresh_adjusted_code or fresh_server_code
                            elif client_time_diff is not None and client_time_diff < 30:
                                # Otherwise if client time is close, use that code
                                verification_code = fresh_client_code or fresh_server_code
                            else:
                                # Fallback to server time code
                                verification_code = fresh_server_code
                                
                            logger.info(f"Selected verification code for final auth: {verification_code}")
                        except Exception as totp_error:
                            logger.error(f"Error generating fresh TOTP code: {totp_error}")
                            verification_code = code  # Fall back to original code
                        
                        logger.info(f"Step 3b: Responding to MFA challenge with code: {verification_code}")
                        
                        # Respond to the MFA challenge with our selected code
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
            
            # Generate fresh codes for helpful error message
            try:
                fresh_server_code = totp.now()
                
                # Try with client time if available
                fresh_client_code = None
                fresh_adjusted_code = None
                
                if client_time:
                    try:
                        fresh_client_code = totp.at(client_time)
                    except Exception:
                        pass
                
                if adjusted_time:
                    try:
                        fresh_adjusted_code = totp.at(adjusted_time)
                    except Exception:
                        pass
                
                # Determine the best code to suggest based on time differences
                suggested_code = fresh_server_code
                if adjusted_time_diff is not None and adjusted_time_diff < 30:
                    suggested_code = fresh_adjusted_code or fresh_server_code
                elif client_time_diff is not None and client_time_diff < 30:
                    suggested_code = fresh_client_code or fresh_server_code
                
                # Return both codes to help user troubleshoot
                error_msg = (
                    "The verification code is incorrect. Try this current code: "
                    f"{suggested_code}"
                )
                
                return jsonify({
                    "detail": error_msg,
                    "currentValidCode": suggested_code,
                    "serverCode": fresh_server_code,
                    "clientCode": fresh_client_code,
                    "adjustedCode": fresh_adjusted_code,
                    "timeInfo": {
                        "serverTime": server_time.isoformat(),
                        "clientTimeDiff": client_time_diff,
                        "adjustedTimeDiff": adjusted_time_diff
                    }
                }), 400
                
            except Exception as detail_error:
                # Fall back to generic message
                return jsonify({"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}), 400
            
        except Exception as e:
            logger.error(f"Error in MFA setup process: {e}")
            logger.error(traceback.format_exc())
            return jsonify({"detail": f"MFA verification failed: {str(e)}"}), 500
            
    except Exception as e:
        logger.error(f"Unhandled exception in direct_confirm_mfa_setup: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

# Enhanced version of direct_verify_mfa with better time handling
@app.route("/api/auth/verify-mfa", methods=["POST", "OPTIONS"])
def direct_verify_mfa():
    """Direct fallback for verifying MFA with improved time handling"""
    logger.info(f"Verify MFA endpoint accessed - Method: {request.method}")
    
    if request.method == "OPTIONS":
        logger.info("Handling OPTIONS preflight request")
        return handle_preflight_request()
    
    try:
        data = request.json
        if not data:
            logger.warning("No JSON data provided in request")
            return jsonify({"detail": "No JSON data provided"}), 400
            
        session = data.get('session')
        code = data.get('code')
        username = data.get('username')
        client_time_str = data.get('client_time')
        adjusted_time_str = data.get('adjusted_time')
        
        # Get current server time (timezone-aware)
        server_time = get_current_utc_datetime()
        logger.info(f"Server time (UTC): {server_time.isoformat()}")
        
        # Parse client times with proper timezone handling
        client_time = parse_iso_datetime(client_time_str)
        adjusted_time = parse_iso_datetime(adjusted_time_str)
        
        # Calculate time differences in seconds
        client_time_diff = get_time_difference_seconds(server_time, client_time) if client_time else None
        adjusted_time_diff = get_time_difference_seconds(server_time, adjusted_time) if adjusted_time else None
        
        # Log time differences
        if client_time_diff is not None:
            logger.info(f"Client time difference: {client_time_diff} seconds")
        if adjusted_time_diff is not None:
            logger.info(f"Adjusted time difference: {adjusted_time_diff} seconds")
        
        # Log request details for debugging
        logger.info(f"MFA verification for user: {username}")
        if session:
            logger.info(f"Session token length: {len(session)}")
            logger.info(f"First 20 chars of session: {session[:20] if len(session) > 20 else session}")
            logger.info(f"Last 20 chars of session: {session[-20:] if len(session) > 20 else session}")
        
        # Input validation
        if not code or not isinstance(code, str):
            logger.error(f"Invalid code format")
            return jsonify({"detail": "Verification code must be a 6-digit number"}), 400
            
        # Ensure code is exactly 6 digits
        code = code.strip()
        if not code.isdigit() or len(code) != 6:
            logger.error(f"Invalid code format: {code}")
            return jsonify({"detail": "Verification code must be exactly 6 digits"}), 400
        
        # Validate session format
        if not session or not isinstance(session, str) or len(session) < 20:
            logger.error(f"Invalid session format: length {len(session) if session else 0}")
            return jsonify({"detail": "Invalid session format"}), 400
        
        # Initialize Cognito client
        try:
            cognito_client = boto3.client("cognito-idp", region_name=os.getenv("REGION", "us-east-1"))
        except Exception as e:
            logger.error(f"Failed to initialize Cognito client: {e}")
            return jsonify({"detail": "Failed to connect to authentication service"}), 500
        
        try:
            # Generate secret hash
            CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")
            CLIENT_SECRET = os.getenv("COGNITO_CLIENT_SECRET")
            
            message = username + CLIENT_ID
            secret = CLIENT_SECRET.encode("utf-8")
            hash_obj = hmac.new(secret, message.encode("utf-8"), hashlib.sha256)
            hash_digest = hash_obj.digest()
            secret_hash = base64.b64encode(hash_digest).decode()
            
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
                
                auth_result = response.get("AuthenticationResult")
                if not auth_result:
                    logger.error("No AuthenticationResult in MFA response")
                    return jsonify({"detail": "Invalid MFA response from server"}), 500
                    
                logger.info("MFA verification successful")
                return jsonify({
                    "id_token": auth_result.get("IdToken"),
                    "access_token": auth_result.get("AccessToken"),
                    "refresh_token": auth_result.get("RefreshToken"),
                    "token_type": auth_result.get("TokenType"),
                    "expires_in": auth_result.get("ExpiresIn"),
                })
            except cognito_client.exceptions.CodeMismatchException as code_error:
                logger.warning(f"MFA code mismatch: {code_error}")
                
                # We don't have access to the secret here, so we can't generate a valid code
                # Return a helpful message about time synchronization
                error_msg = (
                    "The verification code is incorrect or has expired. "
                    "There may be a time synchronization issue between your device and our servers. "
                    "Please try again with a fresh code from your authenticator app, "
                    "or try refreshing the page to synchronize time."
                )
                
                # Include time difference information in the response
                return jsonify({
                    "detail": error_msg,
                    "timeInfo": {
                        "serverTime": server_time.isoformat(),
                        "clientTimeDiff": client_time_diff,
                        "adjustedTimeDiff": adjusted_time_diff
                    }
                }), 400
                
            except cognito_client.exceptions.ExpiredCodeException as expired_error:
                logger.warning(f"MFA code expired: {expired_error}")
                return jsonify({"detail": "The verification code has expired. Please generate a new code from your authenticator app."}), 400
                
            except botocore.exceptions.ClientError as client_error:
                error_code = client_error.response['Error']['Code']
                error_message = client_error.response['Error']['Message']
                logger.error(f"AWS ClientError: {error_code} - {error_message}")
                return jsonify({"detail": f"MFA verification failed: {error_message}"}), 500
                
        except Exception as e:
            logger.error(f"MFA verification error: {e}")
            return jsonify({"detail": f"MFA verification failed: {e}"}), 401
            
    except Exception as e:
        logger.error(f"Error in direct_verify_mfa: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

if __name__ == "__main__":
    try:
        app.run(host="0.0.0.0", port=int(os.getenv("PORT", 8080)), debug=True)
    except Exception as e:
        logger.critical(f"Failed to start the application: {e}")
        logger.critical(traceback.format_exc())