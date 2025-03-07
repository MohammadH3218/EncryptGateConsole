from flask import Blueprint, request, jsonify
import logging
import os
import traceback

# Import from auth_services_routes directly
from auth_services_routes import (
    authenticate_user,
    verify_mfa,
    handle_cors_preflight
)

# Initialize the blueprint and logger
auth_routes = Blueprint('auth_routes', __name__)
logger = logging.getLogger(__name__)

@auth_routes.route("/test", methods=["GET", "OPTIONS"])
def test_route():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
        
    logger.info("Test route accessed successfully.")
    return jsonify({"message": "GET /test route works!"}), 200

@auth_routes.route("/login", methods=["POST", "OPTIONS"])
def login():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
        
    logger.info("Login attempt initiated.")
    data = request.json
    
    if not data:
        logger.warning("No JSON data found in login request")
        return jsonify({"detail": "No data provided"}), 400
    
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        logger.warning("Missing username or password in request")
        return jsonify({"detail": "Username and password are required"}), 400

    try:
        # Forward to authenticate_user function in auth_services_routes
        logger.info(f"Forwarding authentication request for: {username}")
        return authenticate_user()
    except Exception as e:
        logger.error(f"Error during authentication: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": f"Authentication failed: {str(e)}"}), 401

@auth_routes.route("/verify-mfa", methods=["POST", "OPTIONS"])
def verify_mfa_endpoint():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
        
    logger.info("MFA verification request received")
    data = request.json
    session = data.get('session')
    code = data.get('code')
    username = data.get('username')

    if not (session and code and username):
        logger.warning("Missing required fields for MFA verification")
        return jsonify({"detail": "Session, username, and code are required"}), 400

    try:
        # Forward to verify_mfa function in auth_services_routes
        logger.info(f"Forwarding MFA verification request for: {username}")
        return verify_mfa()
    except Exception as e:
        logger.error(f"MFA verification failed: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": f"MFA verification failed: {e}"}), 401