import logging
import os
import sys
import traceback
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize the Flask app (Global for Gunicorn)
app = Flask(__name__)

# === Logging Setup ===
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(filename)s:%(lineno)d - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("/tmp/application_debug.log", mode='a')
    ]
)
logger = logging.getLogger(__name__)

# === API URL Configuration ===
API_URL = os.getenv("API_URL", "http://localhost:8080")
logger.info(f"API URL: {API_URL}")

# === CORS Configuration ===
cors_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net")
allowed_origins = [origin.strip() for origin in cors_origins.split(",")]
logger.info(f"CORS Origins: {allowed_origins}")

# Apply CORS to all routes with expanded configuration
# We're using more permissive CORS settings here to ensure preflight requests work
CORS(app, 
     resources={r"/*": {"origins": "*"}},  # Allow all origins for preflight
     supports_credentials=True,
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Authorization", "Content-Type", "Accept", "Origin"])

# Global before_request handler to catch OPTIONS requests
@app.before_request
def handle_options_requests():
    if request.method == 'OPTIONS':
        logger.info(f"Handling OPTIONS request for: {request.path} from origin: {request.headers.get('Origin')}")
        response = make_response()
        response.headers.add('Access-Control-Allow-Origin', request.headers.get('Origin', '*'))
        response.headers.add('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        response.headers.add('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, Origin')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        response.headers.add('Access-Control-Max-Age', '3600')  # Cache preflight response for 1 hour
        return response, 200

# Ensure CORS headers are added to all responses
@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin", "")
    logger.debug(f"Processing response for origin: {origin}")
    
    # Always allow the specific origins
    if origin in allowed_origins:
        response.headers.set("Access-Control-Allow-Origin", origin)
    elif "*" in allowed_origins:
        response.headers.set("Access-Control-Allow-Origin", "*")
    else:
        # Default to the first allowed origin if none match
        response.headers.set("Access-Control-Allow-Origin", allowed_origins[0] if allowed_origins else "*")
    
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Origin")
    response.headers.set("Access-Control-Allow-Credentials", "true")
    
    return response

# === AWS Cognito Configuration ===
COGNITO_REGION = os.getenv("REGION", "us-east-1")
COGNITO_USERPOOL_ID = os.getenv("COGNITO_USERPOOL_ID")
COGNITO_CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")
COGNITO_CLIENT_SECRET = os.getenv("COGNITO_CLIENT_SECRET")

logger.info(f"Cognito Region: {COGNITO_REGION}")
logger.info(f"Cognito UserPool ID: {COGNITO_USERPOOL_ID}")
logger.info(f"Cognito Client ID: {COGNITO_CLIENT_ID}")
logger.info(f"Client Secret configured: {'Yes' if COGNITO_CLIENT_SECRET else 'No'}")

# Register Blueprints
try:
    # Import the authentication route blueprints
    from auth_services_routes import auth_services_routes
    from auth_routes import auth_routes
    
    # Register the blueprints with appropriate URL prefixes
    app.register_blueprint(auth_services_routes, url_prefix="/api/auth")
    app.register_blueprint(auth_routes, url_prefix="/api/user")
    
    logger.info("Successfully registered authentication blueprints")
except Exception as e:
    logger.error(f"Failed to register authentication blueprints: {e}")
    logger.error(traceback.format_exc())

# === Basic Health Check Route ===
@app.route("/", methods=["GET"])
def home():
    return jsonify({"status": "success", "message": "EncryptGate API is Running!"}), 200

# === Debug Route ===
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
        "api_url": API_URL
    }
    return jsonify(debug_info), 200

# === CORS status check route to help diagnose issues ===
@app.route("/api/cors-check", methods=["GET", "OPTIONS"])
def cors_check():
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

# === Main Entry Point (Ensure AWS Elastic Beanstalk Uses Port 8080) ===
if __name__ == "__main__":
    try:
        debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
        port = int(os.getenv("PORT", 8080))  # AWS EB requires port 8080
        
        logger.info(f"Starting Flask server on port {port}")
        app.run(debug=debug_mode, host="0.0.0.0", port=port)
    except Exception as e:
        logger.error(f"Critical failure starting Flask server: {e}")
        logger.error(traceback.format_exc())
        sys.exit(1)