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
from datetime import datetime, timedelta
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

# Add debug endpoint to check application structure
@app.route("/api/check-app-structure", methods=["GET"])
def check_app_structure():
    """Checks the application structure and files"""
    app_structure = {
        "current_directory": os.getcwd(),
        "files_in_current_dir": os.listdir(),
        "python_path": sys.path,
        "auth_services_exists": os.path.exists("auth_services_routes.py"),
        "auth_routes_exists": os.path.exists("auth_routes.py"),
        "main_exists": os.path.exists("main.py"),
        "wsgi_exists": os.path.exists("wsgi.py"),
        "application_exists": os.path.exists("application.py"),
        "modules": [m.__name__ for m in sys.modules.values() if hasattr(m, '__name__') and not m.__name__.startswith('_')]
    }
    
    # Check if we can import auth_services_routes
    try:
        import auth_services_routes
        app_structure["auth_services_import"] = "success"
        app_structure["auth_services_functions"] = dir(auth_services_routes)
    except ImportError as e:
        app_structure["auth_services_import"] = f"failed: {str(e)}"
    
    return jsonify(app_structure)

# Add debug endpoint to check if blueprints were registered
@app.route("/debug-routes", methods=["GET"])
def debug_routes():
    """Debug endpoint to list all registered routes"""
    routes = []
    for rule in app.url_map.iter_rules():
        routes.append({
            "endpoint": rule.endpoint,
            "methods": list(rule.methods),
            "path": str(rule)
        })
    return jsonify({
        "registered_routes": routes,
        "blueprints": list(app.blueprints.keys()) if hasattr(app, 'blueprints') else [],
        "blueprint_paths": {name: bp.url_prefix for name, bp in app.blueprints.items()} if hasattr(app, 'blueprints') else {}
    })

# Register Blueprints
try:
    # Method 1: Standard import (may work if files are in correct location)
    try:
        from auth_services_routes import auth_services_routes
        from auth_routes import auth_routes
        logger.info("Successfully imported blueprints with direct import")
    except ImportError as e:
        logger.error(f"Direct import failed: {e}")
        
        # Method 2: Import using importlib (more robust for Elastic Beanstalk)
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
            # List files in current directory for debugging
            logger.info(f"Files in directory: {os.listdir(current_dir)}")
            raise ImportError("Route files not found")
    
    # Register the blueprints with the app
    app.register_blueprint(auth_services_routes, url_prefix="/api/auth")
    app.register_blueprint(auth_routes, url_prefix="/api/user")
    
    # Log success
    logger.info("Successfully registered blueprints")
    logger.info(f"Registered blueprints: {list(app.blueprints.keys())}")
    
    # Log all registered routes
    routes = []
    for rule in app.url_map.iter_rules():
        routes.append(f"{rule.endpoint}: {rule.methods} - {rule}")
    logger.info(f"Registered routes: {len(routes)}")
    for route in routes:
        logger.info(f"Route: {route}")
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

# === Fetch AWS Cognito Public Keys ===
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
        logger.error(traceback.format_exc())
        return {"keys": []}

try:
    public_keys = get_cognito_public_keys()
    logger.info(f"Retrieved {len(public_keys.get('keys', []))} Cognito public keys")
except Exception as e:
    logger.error(f"Error retrieving Cognito public keys: {e}")
    public_keys = {"keys": []}

# === Basic Health Check Route ===
@app.route("/", methods=["GET"])
def root():
    return jsonify({"status": "success", "message": "EncryptGate API Root"}), 200

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy", 
        "message": "EncryptGate API is Running!",
        "timestamp": datetime.now().isoformat()
    }), 200

@app.route("/api/health", methods=["GET"])
def api_health_check():
    """Health check endpoint for API monitoring."""
    return jsonify({
        "status": "healthy",
        "service": "EncryptGate API",
        "version": "1.0",
        "timestamp": datetime.now().isoformat()
    }), 200

# === Improved Debug Route ===
@app.route("/api/debug", methods=["GET"])
def debug_route():
    debug_info = {
        "python_version": sys.version,
        "current_directory": os.getcwd(),
        "environment_variables": {
            key: value for key, value in os.environ.items()
            if key.lower() not in ['password', 'secret', 'token', 'aws_secret_access_key']
        },
        "python_path": sys.path,
        "flask_debug": app.debug,
        "cors_origins": allowed_origins,
        "api_url": API_URL,
        "running_processes": os.popen("ps aux | grep gunicorn").read().strip()
    }
    return jsonify(debug_info), 200

# === Simple CORS Test Endpoint ===
@app.route("/api/simple-cors-test", methods=["GET", "OPTIONS", "POST"])
def simple_cors_test():
    logger.info(f"Simple CORS test endpoint accessed - Method: {request.method}")
    logger.info(f"Request headers: {dict(request.headers)}")

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
    
    if request.method == "OPTIONS":
        logger.info("Handling OPTIONS preflight request")
        return handle_preflight_request()
    
    # For GET or POST methods
    response = jsonify({
        "message": "CORS test successful!",
        "method": request.method,
        "timestamp": datetime.now().isoformat(),
        "request_origin": request.headers.get("Origin", "None"),
        "your_ip": request.remote_addr
    })
    
    logger.info(f"Returning simple test response with headers: {dict(response.headers)}")
    return response

# === Direct fallback for test-mfa-code with improved time handling ===
@app.route("/api/auth/test-mfa-code", methods=["POST", "OPTIONS"])
def direct_test_mfa_code():
    """Direct fallback for MFA code testing with improved time handling"""
    logger.info(f"test-mfa-code endpoint accessed with method: {request.method}")
    logger.info(f"Request headers: {dict(request.headers)}")
    
    if request.method == "OPTIONS":
        logger.info("Handling OPTIONS preflight request")
        response = handle_preflight_request()
        logger.info(f"Preflight response headers: {dict(response[0].headers)}")
        return response
    
    try:
        # Log request body
        try:
            data = request.json
            logger.info(f"Request body: {data}")
        except Exception as e:
            logger.info(f"Could not parse request body: {e}")
            data = {}
            
        secret = data.get('secret', '')
        code = data.get('code', '')
        client_time = data.get('client_time')
        adjusted_time = data.get('adjusted_time')
        
        # Log time information
        server_time = datetime.now()
        logger.info(f"Server time: {server_time.isoformat()}")
        time_diff_seconds = None
        if client_time:
            try:
                client_dt = datetime.fromisoformat(client_time.replace('Z', '+00:00'))
                time_diff_seconds = abs((server_time - client_dt).total_seconds())
                logger.info(f"Client time: {client_time}, Time difference: {time_diff_seconds} seconds")
            except Exception as time_error:
                logger.warning(f"Error parsing client time: {time_error}")
        
        if adjusted_time:
            logger.info(f"Client adjusted time: {adjusted_time}")
        
        if not secret:
            return jsonify({
                "valid": False, 
                "error": "Missing secret",
                "server_time": server_time.isoformat()
            }), 400
        
        # Create a TOTP object with the secret
        try:
            totp = pyotp.TOTP(secret)
            current_time = time.time()
            
            # Current server-generated code
            current_code = totp.now()
            
            # Generate codes for adjacent time windows
            prev_code = totp.at(server_time - timedelta(seconds=30))
            next_code = totp.at(server_time + timedelta(seconds=30))
            
            # Also generate codes using client time if provided
            client_current_code = None
            if adjusted_time:
                try:
                    adjusted_dt = datetime.fromisoformat(adjusted_time.replace('Z', '+00:00'))
                    client_current_code = totp.at(adjusted_dt)
                    logger.info(f"Code based on client adjusted time: {client_current_code}")
                except Exception as adj_error:
                    logger.warning(f"Error using adjusted time: {adj_error}")
            
            # Verify the code with a window if provided
            is_valid = False
            if code:
                # Try with server time first (with extended window)
                is_valid = totp.verify(code, valid_window=5)  # Increased window to 5 for larger time differences
                
                # If that fails and we have client time, try with that
                if not is_valid and client_current_code:
                    is_valid = (code == client_current_code)
                    
                logger.info(f"Code validation result: {is_valid}, Server code: {current_code}, Client code: {client_current_code}")
            else:
                is_valid = True  # No code provided to verify
            
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
                    "client_time": client_time,
                    "adjusted_time": adjusted_time,
                    "time_drift": time_diff_seconds
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
            "server_time": datetime.now().isoformat()
        }), 500

# === Direct fallback for authenticate ===
@app.route("/api/auth/authenticate", methods=["POST", "OPTIONS"])
def direct_authenticate():
    """Direct fallback for authentication"""
    logger.info(f"Direct authenticate endpoint accessed - Method: {request.method}")
    logger.info(f"Request headers: {dict(request.headers)}")
    
    if request.method == "OPTIONS":
        logger.info("Handling OPTIONS preflight request")
        response = handle_preflight_request()
        logger.info(f"Preflight response headers: {dict(response[0].headers)}")
        return response
    
    try:
        # Get request data
        data = request.json
        logger.info(f"Authentication data received: {data if data else 'No data'}")
        
        if not data:
            logger.warning("No JSON data provided in request")
            return jsonify({"detail": "No JSON data provided"}), 400
            
        username = data.get('username')
        password = data.get('password')
        
        # Validation
        if not username or not password:
            logger.warning("Missing username or password in request")
            return jsonify({"detail": "Username and password are required"}), 400
        
        # Authentication implementation directly from your auth_services_routes.py
        try:
            # Check AWS Cognito configuration
            CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")
            CLIENT_SECRET = os.getenv("COGNITO_CLIENT_SECRET")
            USER_POOL_ID = os.getenv("COGNITO_USERPOOL_ID")
            
            if not CLIENT_ID or not CLIENT_SECRET or not USER_POOL_ID:
                logger.error("AWS Cognito configuration missing")
                return jsonify({"detail": "Authentication service misconfigured"}), 500
            
            # Generate secret hash
            try:
                # Directly implement the generate_client_secret_hash function 
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
            
            # Call Cognito API
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
                    
                    return jsonify(response_data)
                else:
                    logger.error("No AuthenticationResult or ChallengeName in response")
                    return jsonify({"detail": "Invalid authentication response"}), 500
            
            # Return successful result
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
            
            # Fallback response
            return jsonify({
                "detail": f"Authentication failed: {str(auth_error)}"
            }), 500
    except Exception as e:
        logger.error(f"Error in direct_authenticate: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            "detail": "Server error during authentication",
            "error": str(e)
        }), 500

# === Direct fallback for /api/auth/respond-to-challenge ===
@app.route("/api/auth/respond-to-challenge", methods=["POST", "OPTIONS"])
def direct_respond_to_challenge():
    """Direct fallback for responding to auth challenges"""
    logger.info(f"Respond to challenge endpoint accessed - Method: {request.method}")
    logger.info(f"Request headers: {dict(request.headers)}")
    
    if request.method == "OPTIONS":
        logger.info("Handling OPTIONS preflight request")
        response = handle_preflight_request()
        logger.info(f"Preflight response headers: {dict(response[0].headers)}")
        return response
    
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
        
        # Respond to the authentication challenge - direct implementation
        try:
            # Check AWS Cognito configuration
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
                hash_digest = hash_obj.digest()
                secret_hash = base64.b64encode(hash_digest).decode()
            except Exception as hash_error:
                logger.error(f"Failed to generate secret hash: {hash_error}")
                return jsonify({"detail": "Challenge response failed: Unable to generate credentials"}), 500
            
            # Initialize Cognito client
            try:
                cognito_client = boto3.client("cognito-idp", region_name=os.getenv("REGION", "us-east-1"))
            except Exception as e:
                logger.error(f"Failed to initialize Cognito client: {e}")
                return jsonify({"detail": "Failed to connect to authentication service"}), 500
            
            # Add username and secret hash to challenge responses
            challenge_responses_with_auth = {
                "USERNAME": username,
                "SECRET_HASH": secret_hash
            }
            
            # Add challenge-specific responses
            for key, value in challenge_responses.items():
                challenge_responses_with_auth[key] = value
            
            # Make the API call
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
            
            # Process response
            auth_result = response.get("AuthenticationResult")
            if auth_result:
                # Authentication completed successfully
                logger.info(f"Challenge {challenge_name} completed successfully")
                return jsonify({
                    "id_token": auth_result.get("IdToken"),
                    "access_token": auth_result.get("AccessToken"),
                    "refresh_token": auth_result.get("RefreshToken"),
                    "token_type": auth_result.get("TokenType"),
                    "expires_in": auth_result.get("ExpiresIn"),
                })
            
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
                    mfa_secret = pyotp.random_base32()
                    response_data["secretCode"] = mfa_secret
                    
                return jsonify(response_data)
            
            # If we get here, something unexpected happened
            logger.error("No AuthenticationResult or ChallengeName in response")
            return jsonify({"detail": "Invalid challenge response"}), 500
            
        except cognito_client.exceptions.InvalidPasswordException as pwd_error:
            logger.warning(f"Invalid password format")
            return jsonify({"detail": f"Password does not meet requirements: {str(pwd_error)}"}), 400
            
        except cognito_client.exceptions.CodeMismatchException as code_error:
            logger.warning(f"CodeMismatchException: Invalid verification code")
            return jsonify({"detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."}), 400
            
        except botocore.exceptions.ClientError as client_error:
            error_code = client_error.response['Error']['Code']
            error_message = client_error.response['Error']['Message']
            logger.error(f"AWS ClientError: {error_code} - {error_message}")
            return jsonify({"detail": f"Challenge response failed: {error_message}"}), 500
            
        except Exception as e:
            logger.error(f"Challenge response error: {e}")
            return jsonify({"detail": f"Challenge response failed: {str(e)}"}), 500
            
    except Exception as e:
        logger.error(f"Error in direct_respond_to_challenge: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            "detail": "Server error during challenge response",
            "error": str(e)
        }), 500

# === Direct fallback for /api/auth/setup-mfa ===
@app.route("/api/auth/setup-mfa", methods=["POST", "OPTIONS"])
def direct_setup_mfa():
    """Set up MFA for a user with access token"""
    logger.info(f"Setup MFA endpoint accessed - Method: {request.method}")
    logger.info(f"Request headers: {dict(request.headers)}")
    
    if request.method == "OPTIONS":
        logger.info("Handling OPTIONS preflight request")
        response = handle_preflight_request()
        logger.info(f"Preflight response headers: {dict(response[0].headers)}")
        return response
    
    try:
        data = request.json
        if not data:
            logger.warning("No JSON data provided in request")
            return jsonify({"detail": "No JSON data provided"}), 400
            
        access_token = data.get('access_token')
        
        if not access_token:
            logger.warning("No access token provided in request")
            return jsonify({"detail": "Access token is required"}), 400
        
        # Initialize Cognito client
        try:
            cognito_client = boto3.client("cognito-idp", region_name=os.getenv("REGION", "us-east-1"))
        except Exception as e:
            logger.error(f"Failed to initialize Cognito client: {e}")
            return jsonify({"detail": "Failed to connect to authentication service"}), 500
        
        # Validate token format
        if not access_token or not isinstance(access_token, str) or len(access_token) < 20:
            logger.error(f"Invalid access token format")
            return jsonify({"detail": "Invalid access token format"}), 400
            
        try:
            # Get user details first to validate token and get username
            user_response = cognito_client.get_user(
                AccessToken=access_token
            )
            username = user_response.get("Username", "user")
            logger.info(f"Retrieved username: {username} from access token")
        except Exception as user_error:
            logger.error(f"Failed to get user details: {user_error}")
            return jsonify({"detail": f"Invalid access token: {str(user_error)}"}), 401
            
        # Make the API call to associate software token
        try:
            associate_response = cognito_client.associate_software_token(
                AccessToken=access_token
            )
        except Exception as assoc_error:
            logger.error(f"Failed to associate software token: {assoc_error}")
            return jsonify({"detail": f"MFA setup failed: {str(assoc_error)}"}), 500
        
        # Get the secret code
        secret_code = associate_response.get("SecretCode")
        if not secret_code:
            logger.error("No secret code in response")
            return jsonify({"detail": "Failed to generate MFA secret code"}), 500
        
        logger.info(f"Generated secret code for MFA setup: {secret_code}")
        
        # Generate QR code
        try:
            # Function to generate QR code
            def generate_qr_code(secret_code, username, issuer="EncryptGate"):
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
                
            qr_code = generate_qr_code(secret_code, username, "EncryptGate")
        except Exception as qr_error:
            logger.warning(f"Failed to generate QR code: {qr_error}")
            qr_code = None
        
        # Generate current valid TOTP code for convenience
        try:
            totp = pyotp.TOTP(secret_code)
            current_code = totp.now()
            logger.info(f"Current valid TOTP code: {current_code}")
        except Exception as totp_error:
            logger.error(f"Failed to generate current TOTP code: {totp_error}")
            current_code = None
        
        return jsonify({
            "secretCode": secret_code,
            "qrCodeImage": qr_code,
            "message": "MFA setup initiated successfully",
            "username": username,
            "currentCode": current_code
        })
        
    except Exception as e:
        logger.error(f"Error in direct_setup_mfa: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": f"Failed to setup MFA: {str(e)}"}), 500

# Enhanced version of direct_confirm_mfa_setup with better time handling
@app.route("/api/auth/confirm-mfa-setup", methods=["POST", "OPTIONS"])
def direct_confirm_mfa_setup():
    """Direct fallback for confirming MFA setup with improved time handling"""
    logger.info(f"Confirm MFA setup endpoint accessed - Method: {request.method}")
    logger.info(f"Request headers: {dict(request.headers)}")
    
    if request.method == "OPTIONS":
        logger.info("Handling OPTIONS preflight request")
        response = handle_preflight_request()
        logger.info(f"Preflight response headers: {dict(response[0].headers)}")
        return response
    
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
        client_time = data.get('client_time')
        adjusted_time = data.get('adjusted_time')
        
        # Log time information for debugging
        server_time = datetime.now()
        logger.info(f"Server time: {server_time.isoformat()}")
        time_diff_seconds = None
        if client_time:
            try:
                client_dt = datetime.fromisoformat(client_time.replace('Z', '+00:00'))
                time_diff_seconds = abs((server_time - client_dt).total_seconds())
                logger.info(f"Client time: {client_time}, Time difference: {time_diff_seconds} seconds")
            except Exception as time_error:
                logger.warning(f"Error parsing client time: {time_error}")
        
        if adjusted_time:
            logger.info(f"Client adjusted time: {adjusted_time}")
        
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
        
        # Follow the same sequence as in auth_services_routes.py
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
                current_code = totp.now()  # Using server time
                
                # Try with client adjusted time if provided
                client_code = None
                if adjusted_time:
                    try:
                        adjusted_dt = datetime.fromisoformat(adjusted_time.replace('Z', '+00:00'))
                        client_code = totp.at(adjusted_dt)
                        logger.info(f"Code based on client adjusted time: {client_code}")
                    except Exception as adj_error:
                        logger.warning(f"Error using adjusted time: {adj_error}")
                
                # Check if the user-provided code matches any valid code
                is_valid_server = totp.verify(code, valid_window=5)  # Extended window for larger time differences
                is_valid_client = client_code and code == client_code
                is_valid = is_valid_server or is_valid_client
                
                logger.info(f"TOTP Validation: Server code = {current_code}, Client code = {client_code}, User code = {code}")
                logger.info(f"Valid with server time: {is_valid_server}, Valid with client time: {is_valid_client}")
                logger.info(f"Time window position: {int(time.time()) % 30}/30 seconds")
                
                # Check adjacent time windows
                prev_window = totp.at(server_time - timedelta(seconds=30))
                next_window = totp.at(server_time + timedelta(seconds=30))
                logger.info(f"Adjacent codes: Previous = {prev_window}, Current = {current_code}, Next = {next_window}")
                
                # If code doesn't match, but we're proceeding anyway
                if not is_valid:
                    close_codes = [prev_window, current_code, next_window]
                    if client_code:
                        close_codes.append(client_code)
                    
                    if code in close_codes:
                        logger.info(f"Code matches one of the adjacent windows, continuing anyway")
                    else:
                        logger.warning(f"Code {code} doesn't match any valid window: {close_codes}")
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
                
                # Generate a fresh code with both server and client time
                fresh_server_code = totp.now()
                fresh_client_code = None
                
                if adjusted_time:
                    try:
                        adjusted_dt = datetime.fromisoformat(adjusted_time.replace('Z', '+00:00'))
                        fresh_client_code = totp.at(adjusted_dt)
                    except Exception:
                        pass
                
                # Return both codes to help user troubleshoot
                error_msg = (
                    "The verification code is incorrect. Try one of these current codes: "
                    f"Server: {fresh_server_code}"
                )
                
                if fresh_client_code and fresh_client_code != fresh_server_code:
                    error_msg += f", Client: {fresh_client_code}"
                
                return jsonify({
                    "detail": error_msg,
                    "currentValidCode": fresh_client_code or fresh_server_code,
                    "serverCode": fresh_server_code,
                    "clientCode": fresh_client_code,
                    "timeInfo": {
                        "serverTime": server_time.isoformat(),
                        "timeDifference": time_diff_seconds if time_diff_seconds is not None else "unknown"
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
                        
                        # Get a fresh code from TOTP using both server and client time
                        try:
                            fresh_server_code = totp.now()
                            
                            # Try with client time if available
                            fresh_client_code = None
                            if adjusted_time:
                                try:
                                    adjusted_dt = datetime.fromisoformat(adjusted_time.replace('Z', '+00:00'))
                                    fresh_client_code = totp.at(adjusted_dt)
                                except Exception:
                                    pass
                            
                            logger.info(f"Generated fresh TOTP codes - Server: {fresh_server_code}, Client: {fresh_client_code}")
                            
                            # Use client code if available, otherwise use server code
                            # Also consider the original code if it's still valid
                            if fresh_client_code and is_valid_client:
                                verification_code = code  # Use original code if it matches client time
                            elif fresh_client_code:
                                verification_code = fresh_client_code  # Use fresh client code
                            elif is_valid_server:
                                verification_code = code  # Use original code if it matches server time
                            else:
                                verification_code = fresh_server_code  # Use fresh server code
                                
                            logger.info(f"Selected verification code: {verification_code}")
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
            
            # Generate fresh codes with both server and client time
            try:
                fresh_server_code = totp.now()
                
                # Try with client time if available
                fresh_client_code = None
                if adjusted_time:
                    try:
                        adjusted_dt = datetime.fromisoformat(adjusted_time.replace('Z', '+00:00'))
                        fresh_client_code = totp.at(adjusted_dt)
                    except Exception:
                        pass
                
                # Return both codes to help user troubleshoot
                error_msg = (
                    "The verification code is incorrect. Try one of these current codes: "
                    f"Server: {fresh_server_code}"
                )
                
                if fresh_client_code and fresh_client_code != fresh_server_code:
                    error_msg += f", Client: {fresh_client_code}"
                
                return jsonify({
                    "detail": error_msg,
                    "currentValidCode": fresh_client_code or fresh_server_code,
                    "serverCode": fresh_server_code,
                    "clientCode": fresh_client_code,
                    "timeInfo": {
                        "serverTime": server_time.isoformat(),
                        "timeDifference": time_diff_seconds if time_diff_seconds is not None else "unknown"
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
    logger.info(f"Request headers: {dict(request.headers)}")
    
    if request.method == "OPTIONS":
        logger.info("Handling OPTIONS preflight request")
        response = handle_preflight_request()
        logger.info(f"Preflight response headers: {dict(response[0].headers)}")
        return response
    
    try:
        data = request.json
        if not data:
            logger.warning("No JSON data provided in request")
            return jsonify({"detail": "No JSON data provided"}), 400
            
        session = data.get('session')
        code = data.get('code')
        username = data.get('username')
        client_time = data.get('client_time')
        adjusted_time = data.get('adjusted_time')
        
        # Log time information for debugging
        server_time = datetime.now()
        logger.info(f"Server time: {server_time.isoformat()}")
        time_diff_seconds = None
        if client_time:
            try:
                client_dt = datetime.fromisoformat(client_time.replace('Z', '+00:00'))
                time_diff_seconds = abs((server_time - client_dt).total_seconds())
                logger.info(f"Client time: {client_time}, Time difference: {time_diff_seconds} seconds")
            except Exception as time_error:
                logger.warning(f"Error parsing client time: {time_error}")
        
        if adjusted_time:
            logger.info(f"Client adjusted time: {adjusted_time}")
        
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
                
                # Try to get the user's MFA secret based on session
                # This is a fallback approach
                try:
                    # We don't have the secret here, but we want to provide helpful message
                    # about time synchronization
                    error_msg = (
                        "The verification code is incorrect or has expired. "
                        "There appears to be a time synchronization issue. "
                        "Please try again with a new code from your authenticator app, "
                        "or try refreshing the page to synchronize time."
                    )
                    
                    # Include time difference information in the response
                    return jsonify({
                        "detail": error_msg,
                        "timeInfo": {
                            "serverTime": server_time.isoformat(),
                            "timeDifference": time_diff_seconds if time_diff_seconds is not None else "unknown"
                        }
                    }), 400
                except Exception:
                    # If we can't provide specific guidance, fall back to generic message
                    return jsonify({
                        "detail": "The verification code is incorrect or has expired. Please try again with a new code from your authenticator app."
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