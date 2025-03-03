import logging
import os
import requests
import jwt
from flask import Flask, make_response, request, jsonify
from flask_cors import CORS
from app.services.auth_services_routes import auth_services_routes
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Fetch the API URL from environment variables
API_URL = os.getenv("API_URL")  

# Initialize logger
logging.basicConfig(
    level=logging.INFO,  # Changed to INFO for production
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# Initialize the Flask app
app = Flask(__name__)

# Enable CORS with configurable origins
cors_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net")
allowed_origins = cors_origins.split(",")

# Directory for PID files - let Gunicorn handle this
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
    try:
        url = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USERPOOL_ID}/.well-known/jwks.json"
        response = requests.get(url)
        return response.json()
    except Exception as e:
        logger.error(f"Failed to fetch Cognito public keys: {e}")
        return {"keys": []}  # Return empty keys as fallback

# Function to find the right key for token verification
def get_key_for_token(token, keys):
    try:
        # Get the Key ID from the token header
        kid = jwt.get_unverified_header(token).get('kid')
        # Find the matching key in the JWKS
        for key in keys.get('keys', []):
            if key.get('kid') == kid:
                return jwt.algorithms.RSAAlgorithm.from_jwk(key)
        return None
    except Exception as e:
        logger.error(f"Error finding key for token: {e}")
        return None

# Cache public keys
public_keys = get_cognito_public_keys()

# Function to verify JWT
def verify_jwt(token):
    try:
        # Get the appropriate key for this token
        key = get_key_for_token(token, public_keys)
        if not key:
            return "Invalid token: Key not found"
            
        # Decode the token
        decoded_token = jwt.decode(
            token, 
            key, 
            algorithms=["RS256"],
            audience=COGNITO_CLIENT_ID,
            options={"verify_exp": True}
        )
        return decoded_token  # Return user data if valid
    except jwt.ExpiredSignatureError:
        return "Token expired"
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {e}")
        return f"Invalid token: {e}"
    except Exception as e:
        logger.error(f"Unexpected error verifying token: {e}")
        return f"Error verifying token: {str(e)}"

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
        
        # Store user data for the route to use
        request.user_data = user_data

# Enhanced preflight handler
@app.before_request
def handle_preflight():
    if request.method != "OPTIONS":
        return  # Only process OPTIONS requests
        
    logger.debug(f"Handling preflight for path: {request.path}, origin: {request.headers.get('Origin')}")
    
    origin = request.headers.get("Origin", "")
    
    # Always respond to preflight requests
    response = make_response()
    
    # Check if origin is in allowed list or use wildcard if allowed
    if origin in allowed_origins or "*" in allowed_origins:
        response.headers.add("Access-Control-Allow-Origin", origin)
        response.headers.add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        response.headers.add("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Origin")
        response.headers.add("Access-Control-Allow-Credentials", "true")
        response.headers.add("Access-Control-Max-Age", "3600")  # Cache preflight for 1 hour
        
        logger.debug(f"CORS headers set for origin: {origin}")
        return response, 204
    
    logger.warning(f"Origin not allowed: {origin}")
    return response, 204  # Return 204 even if not allowed

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
    # User data is available from the check_auth middleware
    user_data = getattr(request, 'user_data', {})
    return jsonify({
        "message": "You have accessed a protected route!",
        "user": user_data
    }), 200

# Health check endpoint for AWS
@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "healthy"}), 200

# Register blueprint with the correct prefix
try:
    app.register_blueprint(auth_services_routes, url_prefix="/api/auth")
    logger.info("Blueprint 'auth_services_routes' registered successfully.")
except Exception as e:
    logger.error(f"Error registering blueprint: {e}")
    # Don't exit here, just log the error

# Main entry point to run the server
if __name__ == "__main__":
    try:
        debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
        port = int(os.getenv("PORT", 5000))
        logger.info(f"Starting Flask server on http://0.0.0.0:{port}")
        app.run(debug=debug_mode, host="0.0.0.0", port=port)
    except Exception as e:
        logger.error(f"Failed to start Flask server: {e}")
        # Log error but don't force exit