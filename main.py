import logging
import os
import sys
import traceback
import requests
import jwt
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize the Flask app (Global for Gunicorn)
app = Flask(__name__)

# === Logging Setup ===
def setup_comprehensive_logging():
    log_dir = "/var/log/encryptgate"
    os.makedirs(log_dir, exist_ok=True)  # Ensure the log directory exists

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
pid_dir = "/var/pids"
os.makedirs(pid_dir, exist_ok=True)
logger.info(f"PID directory set: {pid_dir}")

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

# Register Blueprints
try:
    # Add the current directory to the Python path
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if current_dir not in sys.path:
        sys.path.insert(0, current_dir)
        logger.info(f"Added {current_dir} to Python path")
    
    # Import the authentication route blueprints
    # Updated imports to match the deployed directory structure
    from auth_services_routes import auth_services_routes
    from auth_routes import auth_routes
    
    # Register the blueprints with appropriate URL prefixes
    app.register_blueprint(auth_services_routes, url_prefix="/api/auth")
    app.register_blueprint(auth_routes, url_prefix="/api/user")
    
    logger.info("Successfully registered authentication blueprints")
except Exception as e:
    logger.error(f"Failed to register authentication blueprints: {e}")
    logger.error(traceback.format_exc())

# === AWS Cognito Configuration ===
COGNITO_REGION = os.getenv("REGION", "us-east-1")
COGNITO_USERPOOL_ID = os.getenv("COGNITO_USERPOOL_ID")
COGNITO_CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")

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

public_keys = get_cognito_public_keys()
logger.info(f"Retrieved {len(public_keys.get('keys', []))} Cognito public keys")

# === Basic Health Check Route ===
@app.route("/", methods=["GET"])
def home():
    return jsonify({"status": "success", "message": "EncryptGate API is Running!"}), 200

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

# === Test POST endpoint to verify basic functionality ===
@app.route("/api/test-post", methods=["POST", "OPTIONS"])
def test_post():
    if request.method == "OPTIONS":
        return handle_preflight_request()
        
    try:
        logger.info("Test POST endpoint accessed")
        data = request.json
        logger.info(f"Test POST received data: {data}")
        
        return jsonify({
            "status": "success",
            "received_data": data,
            "message": "POST request successful"
        }), 200
    except Exception as e:
        logger.error(f"Error in test POST endpoint: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            "status": "error",
            "error": str(e),
            "message": "Error processing POST request"
        }), 500

# === Direct authenticate endpoint to handle non-prefixed requests ===
@app.route("/authenticate", methods=["OPTIONS", "POST"])
def direct_authenticate():
    logger.info(f"Direct authenticate endpoint accessed from: {request.headers.get('Origin', 'Unknown')}")
    
    if request.method == "OPTIONS":
        logger.info("OPTIONS request to /authenticate - returning preflight response")
        return handle_preflight_request()
    
    # Forward this request to the proper endpoint in auth_services_routes
    try:
        from auth_services_routes import authenticate_user
        
        logger.info("Loading request data")
        data = request.json
        logger.info(f"Authentication data received: {data if data else 'No data'}")
        
        if not data:
            logger.error("No JSON data provided in request")
            return jsonify({"detail": "No JSON data provided"}), 400
            
        username = data.get('username')
        password = data.get('password')
        
        # Log authentication attempt (without password)
        logger.info(f"Authentication attempt for user: {username}")
        
        # Check if data is properly formed
        if not username or not password:
            logger.error("Missing username or password in request")
            return jsonify({"detail": "Username and password are required"}), 400
            
        # Check if AWS credentials are properly configured
        aws_region = os.getenv("AWS_REGION", "us-east-1")
        user_pool_id = os.getenv("USER_POOL_ID")
        client_id = os.getenv("CLIENT_ID")
        client_secret = os.getenv("CLIENT_SECRET")
        
        logger.info(f"AWS Region configured: {'Yes' if aws_region else 'No'}")
        logger.info(f"User Pool ID configured: {'Yes' if user_pool_id else 'No'}")
        logger.info(f"Client ID configured: {'Yes' if client_id else 'No'}")
        logger.info(f"Client Secret configured: {'Yes' if client_secret else 'No'}")
        
        # Call the authenticate_user function with detailed try/except
        try:
            logger.info("Calling authenticate_user function")
            auth_response = authenticate_user(username, password)
            logger.info(f"Auth response type: {type(auth_response)}")
            
            # Check if it's an error response (tuple with status code)
            if isinstance(auth_response, tuple):
                logger.error(f"Authentication returned error: {auth_response[0]}")
                return jsonify(auth_response[0]), auth_response[1]
                
            # Otherwise, it's a successful response
            logger.info("Authentication successful")
            return jsonify(auth_response)
            
        except Exception as e:
            logger.error(f"Exception in authenticate_user: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify({"detail": f"Authentication error: {str(e)}"}), 500
            
    except Exception as e:
        logger.error(f"Error in direct_authenticate: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"status": "error", "message": str(e)}), 500

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

# === Fallback Authentication Route (in case blueprint registration fails) ===
@app.route("/api/auth/authenticate", methods=["POST", "OPTIONS"])
def fallback_authenticate():
    if request.method == "OPTIONS":
        return handle_preflight_request()
        
    logger.info("Fallback authentication route accessed")
    try:
        data = request.json
        logger.info(f"Received auth data: {data}")
        
        response = jsonify({
            "status": "success",
            "message": "This is the fallback authentication endpoint. Blueprint registration might have failed.",
            "received_data": data
        })
        
        return response, 200
    except Exception as e:
        logger.error(f"Error in fallback_authenticate: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

# === CORS status check route to help diagnose issues ===
@app.route("/api/cors-check", methods=["GET", "OPTIONS"])
def cors_check():
    if request.method == "OPTIONS":
        return handle_preflight_request()
        
    origin = request.headers.get("Origin", "Unknown")
    is_allowed = origin in allowed_origins or "*" in allowed_origins
    
    response = jsonify({
        "status": "success",
        "message": "CORS check endpoint",
        "request_origin": origin,
        "is_allowed_origin": is_allowed,
        "allowed_origins": allowed_origins
    })
    
    return response, 200

# === Example API Route to Verify Functionality ===
@app.route("/api/hello", methods=["GET", "OPTIONS"])
def hello_world():
    if request.method == "OPTIONS":
        return handle_preflight_request()
        
    response = jsonify({"message": "Hello from EncryptGate API!"})
    return response, 200

# == Main Entry Point (Ensure AWS Elastic Beanstalk Uses Port 8080) ==
if __name__ == "__main__":
    try:
        debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
        port = int(os.getenv("PORT", 8080))  # AWS EB requires port 8080
        
        logger.info("Starting Flask server on port 8080")
        app.run(debug=debug_mode, host="0.0.0.0", port=port)
    except Exception as e:
        logger.error(f"Critical failure starting Flask server: {e}")
        logger.error(traceback.format_exc())
        sys.exit(1)