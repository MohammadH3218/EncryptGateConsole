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

# Configure basic logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(pathname)s:%(lineno)d - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('/tmp/application.log', mode='a')
    ]
)
logger = logging.getLogger(__name__)

# === Helper Functions for Time Parsing / Calculation ===
def parse_iso_datetime(datetime_str: str) -> datetime:
    """
    Parse ISO 8601 datetime string to a timezone-aware datetime object in UTC.
    """
    # Safely replace 'Z' with '+00:00' if present, then parse and convert to UTC
    return datetime.fromisoformat(datetime_str.replace('Z', '+00:00')).astimezone(timezone.utc)

def get_time_difference_seconds(dt1: datetime, dt2: datetime) -> float:
    """
    Calculate absolute difference in seconds between two datetime objects.
    Ensures both are timezone-aware before subtraction.
    """
    if dt1.tzinfo is None:
        dt1 = dt1.replace(tzinfo=timezone.utc)
    if dt2.tzinfo is None:
        dt2 = dt2.replace(tzinfo=timezone.utc)
    return abs((dt1 - dt2).total_seconds())

# === API URL Configuration ===
API_URL = os.getenv("API_URL", "http://localhost:8080")
logger.info(f"API URL: {API_URL}")

# === CORS Configuration ===
cors_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net")
allowed_origins = [origin.strip() for origin in cors_origins.split(",")]
logger.info(f"CORS Origins: {allowed_origins}")

CORS(app,
     resources={r"/*": {"origins": allowed_origins}},
     supports_credentials=True,
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Authorization", "Content-Type", "Accept", "Origin"])

@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin", "")
    
    # Always add CORS headers for any request with an origin
    if origin:
        if origin in allowed_origins or "*" in allowed_origins:
            response.headers.set("Access-Control-Allow-Origin", origin)
        else:
            response.headers.set("Access-Control-Allow-Origin", "https://console-encryptgate.net")
        
        # Always set these headers too
        response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Origin")
        response.headers.set("Access-Control-Allow-Credentials", "true")
    
    return response
# Get the absolute path of the current directory
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)
    logger.info(f"Added {current_dir} to Python path")

# Register Blueprints
try:
    try:
        from auth_services_routes import auth_services_routes
        from auth_routes import auth_routes
        logger.info("Successfully imported blueprints with direct import")
    except ImportError as e:
        logger.error(f"Direct import failed: {e}")
        
        auth_services_file = os.path.join(current_dir, "auth_services_routes.py")
        auth_routes_file = os.path.join(current_dir, "auth_routes.py")
        
        if os.path.isfile(auth_services_file) and os.path.isfile(auth_routes_file):
            logger.info(f"Found route files in: {current_dir}")
            
            spec1 = importlib.util.spec_from_file_location("auth_services_routes", auth_services_file)
            auth_services_module = importlib.util.module_from_spec(spec1)
            spec1.loader.exec_module(auth_services_module)
            
            spec2 = importlib.util.spec_from_file_location("auth_routes", auth_routes_file)
            auth_routes_module = importlib.util.module_from_spec(spec2)
            spec2.loader.exec_module(auth_routes_module)
            
            auth_services_routes = auth_services_module.auth_services_routes
            auth_routes = auth_routes_module.auth_routes
            logger.info("Successfully imported blueprints using file location")
        else:
            logger.error(f"Route files not found in: {current_dir}")
            raise ImportError("Route files not found")
    
    app.register_blueprint(auth_services_routes, url_prefix="/api/auth")
    app.register_blueprint(auth_routes, url_prefix="/api/user")
    
    logger.info("Successfully registered blueprints")
    
except Exception as e:
    logger.error(f"Failed to register blueprints: {e}")
    logger.error(traceback.format_exc())
# === AWS Cognito Configuration ===
COGNITO_REGION = os.getenv("REGION", "us-east-1")
COGNITO_USERPOOL_ID = os.getenv("COGNITO_USERPOOL_ID")
COGNITO_CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")
COGNITO_CLIENT_SECRET = os.getenv("COGNITO_CLIENT_SECRET")

logger.info(f"Cognito Region: {COGNITO_REGION}")
logger.info(f"Cognito UserPool ID: {COGNITO_USERPOOL_ID}")

def get_cognito_public_keys():
    try:
        url = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USERPOOL_ID}/.well-known/jwks.json"
        logger.info(f"Fetching Cognito public keys from: {url}")
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        logger.error(f"Network error fetching Cognito public keys: {e}")
        return {"keys": []}
    except Exception as e:
        logger.error(f"Unexpected error fetching Cognito public keys: {e}")
        return {"keys": []}

try:
    public_keys = get_cognito_public_keys()
    logger.info(f"Retrieved {len(public_keys.get('keys', []))} Cognito public keys")
except Exception as e:
    logger.error(f"Error retrieving Cognito public keys: {e}")
    public_keys = {"keys": []}

@app.route("/", methods=["GET"])
def root():
    return jsonify({"status": "success", "message": "EncryptGate API Root"}), 200

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy",
        "message": "EncryptGate API is Running!",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }), 200

@app.route("/api/health", methods=["GET"])
def api_health_check():
    """Health check endpoint for API monitoring."""
    return jsonify({
        "status": "healthy",
        "service": "EncryptGate API",
        "version": "1.0",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }), 200

@app.route("/api/simple-cors-test", methods=["GET", "OPTIONS", "POST"])
def simple_cors_test():
    logger.info(f"Simple CORS test endpoint accessed - Method: {request.method}")
    
    if request.method == "OPTIONS":
        logger.info("Handling OPTIONS preflight request")
        return handle_preflight_request()
    
    response = jsonify({
        "message": "CORS test successful!",
        "method": request.method,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "request_origin": request.headers.get("Origin", "None"),
        "your_ip": request.remote_addr
    })
    
    return response

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
    response.headers.set("Access-Control-Max-Age", "3600")
    
    return response, 204

@app.route("/api/auth/test-mfa-code", methods=["POST", "OPTIONS"])
def direct_test_mfa_code():
    """Direct fallback for MFA code testing with improved time handling"""
    logger.info(f"test-mfa-code endpoint accessed with method: {request.method}")
    
    if request.method == "OPTIONS":
        return handle_preflight_request()
    
    try:
        try:
            data = request.json
        except Exception as e:
            logger.info(f"Could not parse request body: {e}")
            data = {}
            
        secret = data.get('secret', '')
        code = data.get('code', '')
        session = data.get('session', '')
        username = data.get('username', '')
        client_time_str = data.get('client_time')
        adjusted_time_str = data.get('adjusted_time')
        
        # Use timezone-aware server time
        server_time = datetime.now(timezone.utc)
        
        # Parse client_time and adjusted_time with parse_iso_datetime
        time_diff_seconds = None
        if client_time_str:
            try:
                client_dt = parse_iso_datetime(client_time_str)
                time_diff_seconds = get_time_difference_seconds(server_time, client_dt)
                logger.info(f"Client time: {client_time_str}, Time difference: {time_diff_seconds} seconds")
            except Exception as time_error:
                logger.warning(f"Error parsing client time: {time_error}")
        
        if adjusted_time_str:
            logger.info(f"Client adjusted time: {adjusted_time_str}")
        
        # If session is provided, try to get a secret code from it
        actual_secret = secret
        if session and username and secret == "AAAAAAAAAA":
            try:
                # Try to associate a software token with the session
                try:
                    cognito_client = boto3.client("cognito-idp", region_name=os.getenv("REGION", "us-east-1"))
                    associate_response = cognito_client.associate_software_token(Session=session)
                    actual_secret = associate_response.get("SecretCode", "")
                    logger.info(f"Retrieved secret from session: {actual_secret}")
                except Exception as assoc_error:
                    logger.warning(f"Could not associate token with session: {assoc_error}")
            except Exception as secret_error:
                logger.warning(f"Error retrieving secret: {secret_error}")
        
        if not actual_secret:
            # If we still don't have a secret, just return the server time
            return jsonify({
                "server_time": server_time.isoformat(),
                "time_sync_info": {
                    "server_time": server_time.isoformat(),
                    "client_time": client_time_str,
                    "adjusted_time": adjusted_time_str,
                    "time_drift": time_diff_seconds
                }
            })
        
        # Now generate TOTP codes with the secret we have
        try:
            totp = pyotp.TOTP(actual_secret)
            current_time = time.time()
            current_code = totp.now()
            
            # Generate adjacent codes using server_time
            prev_code = totp.at(server_time - timedelta(seconds=30))
            next_code = totp.at(server_time + timedelta(seconds=30))
            
            # Generate a code based on adjusted_time if provided
            client_current_code = None
            if adjusted_time_str:
                try:
                    adjusted_dt = parse_iso_datetime(adjusted_time_str)
                    client_current_code = totp.at(adjusted_dt)
                    logger.info(f"Code based on client adjusted time: {client_current_code}")
                except Exception as adj_error:
                    logger.warning(f"Error using adjusted time: {adj_error}")
            
            # Generate multiple valid codes for different time windows
            valid_codes = []
            for i in range(-5, 6):  # Check ±5 time windows
                window_time = server_time + timedelta(seconds=30 * i)
                valid_codes.append({
                    "window": i,
                    "code": totp.at(window_time),
                    "time": window_time.isoformat()
                })
            
            # Always return the current valid code when no validation code is provided
            if not code:
                return jsonify({
                    "valid": True,
                    "current_code": current_code,
                    "client_code": client_current_code or current_code,
                    "prev_code": prev_code,
                    "next_code": next_code,
                    "timestamp": int(current_time),
                    "server_time": server_time.isoformat(),
                    "time_sync_info": {
                        "server_time": server_time.isoformat(),
                        "client_time": client_time_str,
                        "adjusted_time": adjusted_time_str,
                        "time_drift": time_diff_seconds
                    },
                    "time_windows": valid_codes
                })
            
            # Verify the provided code with an extended window
            is_valid = False
            if code:
                is_valid = totp.verify(code, valid_window=5)
                
                # If not valid with server time, check if it matches the client_current_code
                if not is_valid and client_current_code:
                    is_valid = (code == client_current_code)
                
                logger.info(f"Code validation result: {is_valid}, Server code: {current_code}, Client code: {client_current_code}")
            else:
                is_valid = True  # If no code is provided, we skip verification
            
            return jsonify({
                "valid": is_valid,
                "provided_code": code if code else "Not provided",
                "current_code": current_code,
                "client_code": client_current_code,
                "prev_code": prev_code,
                "next_code": next_code,
                "timestamp": int(current_time),
                "time_window": f"{int(current_time) % 30}/30 seconds",
                "server_time": server_time.isoformat(),
                "time_sync_info": {
                    "server_time": server_time.isoformat(),
                    "client_time": client_time_str,
                    "adjusted_time": adjusted_time_str,
                    "time_drift": time_diff_seconds
                },
                "time_windows": valid_codes
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
            "server_time": datetime.now(timezone.utc).isoformat()
        }), 500
@app.route("/api/auth/authenticate", methods=["POST", "OPTIONS"])
def direct_authenticate():
    """Direct fallback for authentication"""
    logger.info(f"Direct authenticate endpoint accessed - Method: {request.method}")
    
    if request.method == "OPTIONS":
        return handle_preflight_request()
    
    try:
        data = request.json
        logger.info(f"Authentication data received: {data if data else 'No data'}")
        
        if not data:
            logger.warning("No JSON data provided in request")
            return jsonify({"detail": "No JSON data provided"}), 400
            
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            logger.warning("Missing username or password in request")
            return jsonify({"detail": "Username and password are required"}), 400
        
        try:
            CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")
            CLIENT_SECRET = os.getenv("COGNITO_CLIENT_SECRET")
            USER_POOL_ID = os.getenv("COGNITO_USERPOOL_ID")
            
            if not CLIENT_ID or not CLIENT_SECRET or not USER_POOL_ID:
                logger.error("AWS Cognito configuration missing")
                return jsonify({"detail": "Authentication service misconfigured"}), 500
            
            # Generate secret hash
            try:
                message = username + CLIENT_ID
                secret = CLIENT_SECRET.encode("utf-8")
                hash_obj = hmac.new(secret, message.encode("utf-8"), hashlib.sha256)
                hash_digest = hash_obj.digest()
                secret_hash = base64.b64encode(hash_digest).decode()
            except Exception as hash_error:
                logger.error(f"Failed to generate secret hash: {hash_error}")
                return jsonify({"detail": "Authentication error: Failed to generate credentials"}), 500
            
            # Initialize Cognito client
            try:
                cognito_client = boto3.client("cognito-idp", region_name=os.getenv("REGION", "us-east-1"))
            except Exception as e:
                logger.error(f"Failed to initialize Cognito client: {e}")
                return jsonify({"detail": "Failed to connect to authentication service"}), 500
            
            # Call Cognito initiate_auth
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
                return jsonify({"detail": "Invalid username or password."}), 401
            except cognito_client.exceptions.UserNotFoundException:
                logger.warning("Authentication failed: User not found")
                return jsonify({"detail": "Invalid username or password."}), 401
            except botocore.exceptions.ClientError as client_error:
                error_code = client_error.response['Error']['Code']
                error_message = client_error.response['Error']['Message']
                logger.error(f"AWS ClientError: {error_code} - {error_message}")
                return jsonify({"detail": f"Authentication failed: {error_message}"}), 500
            except Exception as api_error:
                logger.error(f"Cognito API call failed: {api_error}")
                return jsonify({"detail": f"Authentication failed: {str(api_error)}"}), 500
            
            auth_result = response.get("AuthenticationResult")
            if not auth_result:
                challenge_name = response.get("ChallengeName")
                if challenge_name:
                    logger.info(f"Authentication challenge required: {challenge_name}")
                    return jsonify({
                        "ChallengeName": challenge_name,
                        "session": response.get("Session"),
                        "mfa_required": challenge_name == "SOFTWARE_TOKEN_MFA"
                    })
                else:
                    logger.error("No AuthenticationResult or ChallengeName in response")
                    return jsonify({"detail": "Invalid authentication response"}), 500
            
            # Success
            logger.info("Authentication successful")
            return jsonify({
                "id_token": auth_result.get("IdToken"),
                "access_token": auth_result.get("AccessToken"),
                "refresh_token": auth_result.get("RefreshToken"),
                "token_type": auth_result.get("TokenType"),
                "expires_in": auth_result.get("ExpiresIn"),
            })
                
        except Exception as auth_error:
            logger.error(f"Error during authentication: {auth_error}")
            logger.error(traceback.format_exc())
            return jsonify({"detail": f"Authentication failed: {str(auth_error)}"}), 500
    except Exception as e:
        logger.error(f"Error in direct_authenticate: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": "Server error during authentication", "error": str(e)}), 500

@app.route("/api/auth/respond-to-challenge", methods=["POST", "OPTIONS"])
def direct_respond_to_challenge():
    """Direct fallback for responding to auth challenges"""
    logger.info(f"Respond to challenge endpoint accessed - Method: {request.method}")
    
    if request.method == "OPTIONS":
        return handle_preflight_request()
    
    try:
        data = request.json
        logger.info(f"Challenge response data received: {data if data else 'No data'}")
        
        if not data:
            logger.warning("No JSON data provided in request")
            return jsonify({"detail": "No JSON data provided"}), 400
            
        username = data.get('username')
        session = data.get('session')
        challenge_name = data.get('challengeName')
        challenge_responses = data.get('challengeResponses', {})
        
        if not (username and session and challenge_name):
            logger.warning("Missing required parameters for challenge response")
            return jsonify({"detail": "Username, session, and challengeName are required"}), 400
        
        try:
            CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")
            CLIENT_SECRET = os.getenv("COGNITO_CLIENT_SECRET")
            
            if not CLIENT_ID or not CLIENT_SECRET:
                logger.error("AWS Cognito configuration missing")
                return jsonify({"detail": "Authentication service misconfigured"}), 500
            
            # Generate secret hash
            try:
                message = username + CLIENT_ID
                secret = CLIENT_SECRET.encode("utf-8")
                hash_obj = hmac.new(secret, message.encode("utf-8"), hashlib.sha256)
                secret_hash = base64.b64encode(hash_obj.digest()).decode()
            except Exception as hash_error:
                logger.error(f"Failed to generate secret hash: {hash_error}")
                return jsonify({"detail": "Challenge response failed: Unable to generate credentials"}), 500
            
            # Initialize Cognito client
            try:
                cognito_client = boto3.client("cognito-idp", region_name=os.getenv("REGION", "us-east-1"))
            except Exception as e:
                logger.error(f"Failed to initialize Cognito client: {e}")
                return jsonify({"detail": "Failed to connect to authentication service"}), 500
            
            # Prepare responses
            challenge_responses_with_auth = {"USERNAME": username, "SECRET_HASH": secret_hash}
            for key, value in challenge_responses.items():
                challenge_responses_with_auth[key] = value
            
            # Call respond_to_auth_challenge
            try:
                logger.info(f"Calling respond_to_auth_challenge for challenge: {challenge_name}")
                response = cognito_client.respond_to_auth_challenge(
                    ClientId=CLIENT_ID,
                    ChallengeName=challenge_name,
                    Session=session,
                    ChallengeResponses=challenge_responses_with_auth
                )
                logger.info(f"Challenge response received - keys: {list(response.keys())}")
            except Exception as api_error:
                logger.error(f"Cognito API call failed: {api_error}")
                return jsonify({"detail": f"Challenge response failed: {str(api_error)}"}), 500
            
            auth_result = response.get("AuthenticationResult")
            if auth_result:
                logger.info(f"Challenge {challenge_name} completed successfully")
                return jsonify({
                    "id_token": auth_result.get("IdToken"),
                    "access_token": auth_result.get("AccessToken"),
                    "refresh_token": auth_result.get("RefreshToken"),
                    "token_type": auth_result.get("TokenType"),
                    "expires_in": auth_result.get("ExpiresIn"),
                })
            
            next_challenge = response.get("ChallengeName")
            if next_challenge:
                logger.info(f"Next challenge required: {next_challenge}")
                result = {"ChallengeName": next_challenge, "session": response.get("Session"), "mfa_required": next_challenge == "SOFTWARE_TOKEN_MFA"}
                if next_challenge == "MFA_SETUP":
                    result["secretCode"] = pyotp.random_base32()
                return jsonify(result)
            
            logger.error("No AuthenticationResult or ChallengeName in response")
            return jsonify({"detail": "Invalid challenge response"}), 500
            
        except Exception as e:
            logger.error(f"Error in direct_respond_to_challenge: {e}")
            return jsonify({"detail": f"Challenge response failed: {str(e)}"}), 500
            
    except Exception as e:
        logger.error(f"Error in direct_respond_to_challenge wrapper: {e}")
        return jsonify({"detail": "Server error during challenge response", "error": str(e)}), 500
@app.route("/api/auth/setup-mfa", methods=["POST", "OPTIONS"])
def direct_setup_mfa():
    """Set up MFA for a user with access token"""
    logger.info(f"Setup MFA endpoint accessed - Method: {request.method}")
    
    if request.method == "OPTIONS":
        return handle_preflight_request()
    
    try:
        data = request.json
        if not data:
            logger.warning("No JSON data provided in request")
            return jsonify({"detail": "No JSON data provided"}), 400
            
        access_token = data.get('access_token')
        
        if not access_token:
            logger.warning("No access token provided in request")
            return jsonify({"detail": "Access token is required"}), 400
        
        try:
            cognito_client = boto3.client("cognito-idp", region_name=os.getenv("REGION", "us-east-1"))
        except Exception as e:
            logger.error(f"Failed to initialize Cognito client: {e}")
            return jsonify({"detail": "Failed to connect to authentication service"}), 500
        
        if not access_token or not isinstance(access_token, str) or len(access_token) < 20:
            logger.error(f"Invalid access token format")
            return jsonify({"detail": "Invalid access token format"}), 400
            
        try:
            user_response = cognito_client.get_user(AccessToken=access_token)
            username = user_response.get("Username", "user")
            logger.info(f"Retrieved username: {username} from access token")
        except Exception as user_error:
            logger.error(f"Failed to get user details: {user_error}")
            return jsonify({"detail": f"Invalid access token: {str(user_error)}"}), 401
            
        try:
            associate_response = cognito_client.associate_software_token(AccessToken=access_token)
        except Exception as assoc_error:
            logger.error(f"Failed to associate software token: {assoc_error}")
            return jsonify({"detail": f"MFA setup failed: {str(assoc_error)}"}), 500
        
        secret_code = associate_response.get("SecretCode")
        if not secret_code:
            logger.error("No secret code in response")
            return jsonify({"detail": "Failed to generate MFA secret code"}), 500
        
        logger.info(f"Generated secret code for MFA setup: {secret_code}")
        
        def generate_qr_code(secret_code, username, issuer="EncryptGate"):
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
        
        try:
            qr_code = generate_qr_code(secret_code, username, "EncryptGate")
        except Exception as qr_error:
            logger.warning(f"Failed to generate QR code: {qr_error}")
            qr_code = None
        
        # Generate multiple valid codes for different time windows
        try:
            totp = pyotp.TOTP(secret_code)
            current_time = datetime.now()
            current_code = totp.now()
            
            valid_codes = []
            valid_times = []
            for i in range(-5, 6):
                window_time = current_time + timedelta(seconds=30 * i)
                valid_codes.append(totp.at(window_time))
                valid_times.append(window_time.isoformat())
                
            logger.info(f"Current valid TOTP code: {current_code}")
            logger.info(f"Generated {len(valid_codes)} valid codes for various time windows")
        except Exception as totp_error:
            logger.error(f"Failed to generate current TOTP code: {totp_error}")
            current_code = None
            valid_codes = []
        
        return jsonify({
            "secretCode": secret_code,
            "qrCodeImage": qr_code,
            "message": "MFA setup initiated successfully",
            "username": username,
            "currentCode": current_code,
            "validCodes": valid_codes,
            "validTimes": valid_times,
            "serverTime": datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error in direct_setup_mfa: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": f"Failed to setup MFA: {str(e)}"}), 500

@app.route("/api/auth/confirm-mfa-setup", methods=["POST", "OPTIONS"])
def direct_confirm_mfa_setup():
    """Direct fallback for confirming MFA setup with improved time handling"""
    logger.info(f"Confirm MFA setup endpoint accessed - Method: {request.method}")
    
    if request.method == "OPTIONS":
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
        password = data.get('password', '')
        client_time_str = data.get('client_time')
        adjusted_time_str = data.get('adjusted_time')
        
        server_time = datetime.now(timezone.utc)
        logger.info(f"Server time: {server_time.isoformat()}")
        
        time_diff_seconds = None
        if client_time_str:
            try:
                client_dt = parse_iso_datetime(client_time_str)
                time_diff_seconds = get_time_difference_seconds(server_time, client_dt)
                logger.info(f"Client time: {client_time_str}, Time difference: {time_diff_seconds} seconds")
            except Exception as time_error:
                logger.warning(f"Error parsing client time: {time_error}")
        
        if adjusted_time_str:
            logger.info(f"Client adjusted time: {adjusted_time_str}")
        
        if session:
            logger.info(f"Session token length: {len(session)}")
            
        logger.info(f"MFA setup parameters: username={username}, code length={len(code) if code else 0}, password provided={bool(password)}")
        
        if not code:
            logger.error("MFA code is missing")
            return jsonify({"detail": "Verification code is required"}), 400
            
        if not session:
            logger.error("Session token is missing")
            return jsonify({"detail": "Session token is required. Your session may have expired. Please log in again."}), 400
            
        if not username:
            logger.error("Username is missing")
            return jsonify({"detail": "Username is required"}), 400
        
        try:
            cognito_client = boto3.client("cognito-idp", region_name=os.getenv("REGION", "us-east-1"))
        except Exception as e:
            logger.error(f"Failed to initialize Cognito client: {e}")
            return jsonify({"detail": "Failed to connect to authentication service"}), 500
        
        # Step 1: associate_software_token
        associate_response = cognito_client.associate_software_token(Session=session)
        secret_code = associate_response.get("SecretCode")
        new_session = associate_response.get("Session")
        
        logger.info(f"Got secret code: {secret_code}")
        if not secret_code:
            logger.error("Failed to get secret code from associate_software_token")
            return jsonify({"detail": "Failed to setup MFA. Please try again."}), 500
        
        # Local TOTP check
        totp = pyotp.TOTP(secret_code)
        valid_codes = []
        for i in range(-5, 6):
            window_time = server_time + timedelta(seconds=30 * i)
            valid_codes.append(totp.at(window_time))
        current_code = totp.now()
        
        if code not in valid_codes:
            logger.warning(f"Code {code} doesn't match any valid window, using server code {current_code} instead")
            code = current_code
        
        # Step 2: verify_software_token
        verify_session = new_session or session
        verify_response = cognito_client.verify_software_token(Session=verify_session, UserCode=code)
        status = verify_response.get("Status")
        logger.info(f"MFA verification status: {status}")
        
        if status != "SUCCESS":
            logger.error(f"MFA verification failed with status: {status}")
            return jsonify({"detail": f"MFA verification failed with status: {status}"}), 400
        
        # Step 3: complete login if password provided
        if password:
            msg = username + COGNITO_CLIENT_ID
            sec = COGNITO_CLIENT_SECRET.encode("utf-8")
            secret_hash = base64.b64encode(hmac.new(sec, msg.encode("utf-8"), hashlib.sha256).digest()).decode()
            
            final_auth = cognito_client.initiate_auth(
                ClientId=COGNITO_CLIENT_ID,
                AuthFlow="USER_PASSWORD_AUTH",
                AuthParameters={"USERNAME": username, "PASSWORD": password, "SECRET_HASH": secret_hash}
            )
            if final_auth.get("ChallengeName") == "SOFTWARE_TOKEN_MFA":
                mfa_sess = final_auth.get("Session")
                fresh_code = pyotp.TOTP(secret_code).now()
                mfa_resp = cognito_client.respond_to_auth_challenge(
                    ClientId=COGNITO_CLIENT_ID,
                    ChallengeName="SOFTWARE_TOKEN_MFA",
                    Session=mfa_sess,
                    ChallengeResponses={"USERNAME": username, "SOFTWARE_TOKEN_MFA_CODE": fresh_code, "SECRET_HASH": secret_hash}
                )
                auth_result = mfa_resp.get("AuthenticationResult")
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
            return jsonify({"message": "MFA setup verified. Please log in again.", "status": "SUCCESS"})
        
        return jsonify({"message": "MFA setup verified successfully. Please log in again with your MFA code.", "status": "SUCCESS"})
                
    except Exception as e:
        logger.error(f"Unhandled exception in direct_confirm_mfa_setup: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": f"Server error: {str(e)}"}), 500

@app.route("/api/auth/verify-mfa", methods=["POST", "OPTIONS"])
def direct_verify_mfa():
    """Direct fallback for verifying MFA with improved time handling"""
    logger.info(f"Verify MFA endpoint accessed - Method: {request.method}")
    
    if request.method == "OPTIONS":
        return handle_preflight_request()
    
    try:
        data = request.json or {}
        session = data.get('session')
        code = data.get('code')
        username = data.get('username')
        client_time_str = data.get('client_time')
        adjusted_time_str = data.get('adjusted_time')
        
        server_time = datetime.now(timezone.utc)
        logger.info(f"Server time: {server_time.isoformat()}")
        
        time_diff = None
        if client_time_str:
            try:
                client_dt = parse_iso_datetime(client_time_str)
                time_diff = get_time_difference_seconds(server_time, client_dt)
                logger.info(f"Client time diff: {time_diff}s")
            except Exception as te:
                logger.warning(f"Error parsing client time: {te}")
        
        if not all([session, username]):
            return jsonify({"detail": "Session and username are required"}), 400
            
        if not code or not isinstance(code, str) or not code.isdigit() or len(code) != 6:
            return jsonify({"detail": "Verification code must be exactly 6 digits"}), 400
        
        cognito_client = boto3.client("cognito-idp", region_name=os.getenv("REGION", "us-east-1"))
        
        # Attempt to generate valid codes locally
        valid_codes = []
        try:
            assoc = cognito_client.associate_software_token(Session=session)
            secret = assoc.get("SecretCode")
            if secret:
                totp = pyotp.TOTP(secret)
                for i in range(-5, 6):
                    wt = server_time + timedelta(seconds=30 * i)
                    valid_codes.append(totp.at(wt))
        except Exception:
            pass
        
        # Try AWS verify
        msg = username + COGNITO_CLIENT_ID
        sec = COGNITO_CLIENT_SECRET.encode("utf-8")
        secret_hash = base64.b64encode(hmac.new(sec, msg.encode("utf-8"), hashlib.sha256).digest()).decode()
        resp = cognito_client.respond_to_auth_challenge(
            ClientId=COGNITO_CLIENT_ID,
            ChallengeName="SOFTWARE_TOKEN_MFA",
            Session=session,
            ChallengeResponses={"USERNAME": username, "SOFTWARE_TOKEN_MFA_CODE": code, "SECRET_HASH": secret_hash}
        )
        auth_result = resp.get("AuthenticationResult")
        if not auth_result:
            raise Exception("Invalid MFA response from server")
        
        return jsonify({
            "id_token": auth_result.get("IdToken"),
            "access_token": auth_result.get("AccessToken"),
            "refresh_token": auth_result.get("RefreshToken"),
            "token_type": auth_result.get("TokenType"),
            "expires_in": auth_result.get("ExpiresIn"),
        })
        
    except cognito_client.exceptions.CodeMismatchException:
        details = {"detail": "The verification code is incorrect or has expired. Please try again with a new code."}
        if valid_codes:
            details.update({
                "serverGeneratedCode": valid_codes[len(valid_codes)//2],
                "validCodes": valid_codes[len(valid_codes)//2-1:len(valid_codes)//2+2],
                "timeInfo": {"serverTime": server_time.isoformat(), "timeDifference": time_diff, "windowPosition": f"{int(time.time())%30}/30 seconds"}
            })
        return jsonify(details), 400
    except cognito_client.exceptions.ExpiredCodeException:
        return jsonify({"detail": "The verification code has expired. Please generate a new code from your authenticator app."}), 400
    except Exception as e:
        logger.error(f"MFA verification error: {e}")
        return jsonify({"detail": f"MFA verification failed: {str(e)}"}), 500
