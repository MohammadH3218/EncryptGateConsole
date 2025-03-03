import logging
import os
import requests
import jwt
from flask import Flask, make_response, request, jsonify
from flask_cors import CORS
from services.auth_services_routes import auth_services_routes
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Fetch the API URL from environment variables
API_URL = os.getenv("API_URL")  # No default, it must be set in environment variables

# Initialize logger
logging.basicConfig(
    level=logging.DEBUG,  # Changed to DEBUG for more detailed logs
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# Initialize the Flask app
app = Flask(__name__)

# Enable CORS with configurable origins
cors_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net")
allowed_origins = cors_origins.split(",")

# Create a directory for PID files if it doesn't exist
os.makedirs('/var/pids', exist_ok=True)

# Configure CORS with expanded options
CORS(app, 
     resources={r"/api/*": {"origins": allowed_origins}},
     supports_credentials=True,
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Authorization", "Content-Type", "Accept", "Origin"])

# AWS Cognito Configuration (Updated to match AWS Amplify variable naming)
COGNITO_REGION = os.getenv("REGION", "us-east-1")
COGNITO_USERPOOL_ID = os.getenv("COGNITO_USERPOOL_ID")
COGNITO_CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")

# Fetch AWS Cognito Public Keys
def get_cognito_public_keys():
    url = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USERPOOL_ID}/.well-known/jwks.json"
    response = requests.get(url)
    return response.json()

public_keys = get_cognito_public_keys()

# Function to verify JWT
def verify_jwt(token):
    try:
        decoded_token = jwt.decode(token, public_keys, algorithms=["RS256"], audience=COGNITO_CLIENT_ID)
        return decoded_token  # Return user data if valid
    except jwt.ExpiredSignatureError:
        return "Token expired"
    except jwt.InvalidTokenError:
        return "Invalid token"

# Middleware to check authentication
@app.before_request
def check_auth():
    if request.path.startswith("/api/protected"):  # Only protect specific routes
        auth_header = request.headers.get("Authorization")
        if not auth_header or "Bearer " not in auth_header:
            return jsonify({"error": "Missing token"}), 401

        token = auth_header.split("Bearer ")[1]
        user_data = verify_jwt(token)

        if isinstance(user_data, str):  # If an error occurred
            return jsonify({"error": user_data}), 401

# Enhanced preflight handler
@app.before_request
def handle_preflight():
    logger.info(f"Handling request for path: {request.path}, method: {request.method}, origin: {request.headers.get('Origin')}")
    
    if request.method == "OPTIONS":
        origin = request.headers.get("Origin", "")
        
        logger.info(f"Preflight request from origin: {origin}")
        logger.info(f"Allowed origins: {allowed_origins}")
        
        # Always respond to preflight requests
        response = make_response()
        
        # Check if origin is in allowed list or use wildcard if allowed
        if origin in allowed_origins or "*" in allowed_origins:
            response.headers.add("Access-Control-Allow-Origin", origin)
            response.headers.add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            response.headers.add("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Origin")
            response.headers.add("Access-Control-Allow-Credentials", "true")
            response.headers.add("Access-Control-Max-Age", "3600")  # Cache preflight for 1 hour
            
            logger.info(f"CORS headers set for origin: {origin}")
            return response, 204
        
        logger.warning(f"Origin not allowed: {origin}")

# Add CORS headers to all responses
@app.after_request
def after_request(response):
    origin = request.headers.get('Origin', '')
    
    if origin in allowed_origins or "*" in allowed_origins:
        response.headers.add('Access-Control-Allow-Origin', origin)
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        
        # If this is a regular response (not preflight)
        if request.method != 'OPTIONS':
            response.headers.add('Access-Control-Expose-Headers', 'Content-Type')
            
    return response

# Simple test route to verify server status
@app.route("/api/test", methods=["GET"])
def test_route():
    return {"message": "API is running"}, 200

# Protected route (only accessible with valid JWT)
@app.route("/api/protected", methods=["GET"])
def protected_route():
    return jsonify({"message": "You have accessed a protected route!"}), 200

# Register blueprint with the correct prefix
try:
    app.register_blueprint(auth_services_routes, url_prefix="/api/auth")
    logger.info("Blueprint 'auth_services_routes' registered successfully.")
except Exception as e:
    logger.error(f"Error registering blueprint: {e}")
    exit(1)  # Exit application if blueprint registration fails

# Main entry point to run the server
if __name__ == "__main__":
    try:
        # Create PID file for health monitoring
        with open('/var/pids/web.pid', 'w') as f:
            f.write(str(os.getpid()))
            
        debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
        port = int(os.getenv("PORT", 5000))
        logger.info("Starting Flask server...")
        logger.info(f"Server running on http://0.0.0.0:{port}")
        app.run(debug=debug_mode, host="0.0.0.0", port=port)
    except Exception as e:
        logger.error(f"Failed to start Flask server: {e}")
        exit(1)  # Exit the application on failure