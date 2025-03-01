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
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# Initialize the Flask app
app = Flask(__name__)

# Enable CORS with configurable origins
cors_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net")  # Updated to match the current domain
allowed_origins = cors_origins.split(",")

CORS(app, resources={r"/api/*": {"origins": allowed_origins}}, supports_credentials=True)

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

# Handle preflight OPTIONS requests globally
@app.before_request
def handle_preflight():
    logger.info(f"Handling request for path: {request.path}, method: {request.method}, origin: {request.headers.get('Origin')}")
    if request.method == "OPTIONS":
        origin = request.headers.get("Origin", "*")
        logger.info(f"Preflight request from origin: {origin}")
        if origin in allowed_origins:
            response = make_response()
            response.headers.add("Access-Control-Allow-Origin", origin)
            response.headers.add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            response.headers.add("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Origin")
            response.headers.add("Access-Control-Allow-Credentials", "true")
            return response, 204

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
        debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
        port = int(os.getenv("PORT", 5000))
        logger.info("Starting Flask server...")
        logger.info(f"Server running on http://0.0.0.0:{port}")
        app.run(debug=debug_mode, host="0.0.0.0", port=port)
    except Exception as e:
        logger.error(f"Failed to start Flask server: {e}")
        exit(1)  # Exit the application on failure
