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