from flask import Blueprint, request, jsonify
import logging
import os
from auth_services_routes import (
    authenticate_user,
    change_password,
    setup_mfa,
    verify_mfa_setup,
    verify_mfa
)

# Initialize the blueprint and logger
auth_routes = Blueprint('auth_routes', __name__)
logger = logging.getLogger(__name__)

# Helper function for CORS headers
def add_cors_headers(response):
    origin = request.headers.get("Origin", "")
    allowed_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net").split(",")
    allowed_origins = [o.strip() for o in allowed_origins]
    
    if origin in allowed_origins or "*" in allowed_origins:
        response.headers.add("Access-Control-Allow-Origin", origin)
    else:
        response.headers.add("Access-Control-Allow-Origin", "https://console-encryptgate.net")
    
    response.headers.add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    response.headers.add("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Origin")
    response.headers.add("Access-Control-Allow-Credentials", "true")
    
    return response

# Handle preflight requests
def handle_preflight():
    response = jsonify({"status": "success"})
    return add_cors_headers(response), 204

@auth_routes.route("/login", methods=["POST", "OPTIONS"])
def login():
    if request.method == "OPTIONS":
        return handle_preflight()
    
    logger.info("Login request received")
    
    # Get request data
    data = request.json
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400
    
    # Authenticate the user
    result = authenticate_user(username, password)
    
    # Check if it's an error response
    if isinstance(result, tuple):
        return jsonify(result[0]), result[1]
    
    # Add email to response for frontend
    if "id_token" in result:
        result["email"] = username
        
    response = jsonify(result)
    return add_cors_headers(response)

@auth_routes.route("/change-password", methods=["POST", "OPTIONS"])
def password_change():
    if request.method == "OPTIONS":
        return handle_preflight()
    
    logger.info("Password change request received")
    
    # Get request data
    data = request.json
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    username = data.get('username')
    session = data.get('session')
    new_password = data.get('new_password')
    
    if not username or not session or not new_password:
        return jsonify({"error": "Username, session, and new password are required"}), 400
    
    # Change password
    result = change_password(username, session, new_password)
    
    # Check if it's an error response
    if isinstance(result, tuple):
        return jsonify(result[0]), result[1]
    
    # Add email to response for frontend
    if "id_token" in result:
        result["email"] = username
        
    response = jsonify(result)
    return add_cors_headers(response)

@auth_routes.route("/setup-mfa", methods=["POST", "OPTIONS"])
def mfa_setup():
    if request.method == "OPTIONS":
        return handle_preflight()
    
    logger.info("MFA setup request received")
    
    # Get request data
    data = request.json
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    access_token = data.get('access_token')
    
    if not access_token:
        return jsonify({"error": "Access token is required"}), 400
    
    # Setup MFA
    result = setup_mfa(access_token)
    
    # Check if it's an error response
    if isinstance(result, tuple):
        return jsonify(result[0]), result[1]
        
    response = jsonify(result)
    return add_cors_headers(response)

@auth_routes.route("/verify-mfa-setup", methods=["POST", "OPTIONS"])
def verify_mfa_setup_route():
    if request.method == "OPTIONS":
        return handle_preflight()
    
    logger.info("MFA setup verification request received")
    
    # Get request data
    data = request.json
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    access_token = data.get('access_token')
    code = data.get('code')
    
    if not access_token or not code:
        return jsonify({"error": "Access token and verification code are required"}), 400
    
    # Verify MFA setup
    result = verify_mfa_setup(access_token, code)
    
    # Check if it's an error response
    if isinstance(result, tuple):
        return jsonify(result[0]), result[1]
        
    response = jsonify(result)
    return add_cors_headers(response)

@auth_routes.route("/verify-mfa", methods=["POST", "OPTIONS"])
def verify_mfa_route():
    if request.method == "OPTIONS":
        return handle_preflight()
    
    logger.info("MFA verification request received")
    
    # Get request data
    data = request.json
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    username = data.get('username')
    session = data.get('session')
    code = data.get('code')
    
    if not username or not session or not code:
        return jsonify({"error": "Username, session, and verification code are required"}), 400
    
    # Verify MFA
    result = verify_mfa(username, session, code)
    
    # Check if it's an error response
    if isinstance(result, tuple):
        return jsonify(result[0]), result[1]
    
    # Add email to response for frontend
    if "id_token" in result:
        result["email"] = username
        
    response = jsonify(result)
    return add_cors_headers(response)