from flask import Blueprint, request, jsonify, make_response
from auth_services_routes import (
    authenticate_user,
    verify_mfa,
    confirm_signup,
    handle_cors_preflight
)
import logging
import os

# Initialize the blueprint and logger
auth_routes = Blueprint('auth_routes', __name__)
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

@auth_routes.route("/test", methods=["GET", "OPTIONS"])
def test_route():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
        
    logger.info("Test route accessed successfully.")
    return jsonify({"message": "GET /test route works!"})

@auth_routes.route("/login", methods=["POST", "OPTIONS"])
def login():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
        
    logger.info("Login attempt initiated.")
    data = request.json
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"detail": "Username and password are required"}), 400

    try:
        auth_response = authenticate_user()
    except Exception as e:
        logger.error(f"Error during authentication: {e}")
        return jsonify({"detail": "Authentication failed"}), 401

    if auth_response.get("mfa_required"):
        # Add CORS headers to response
        resp = jsonify({"mfa_required": True, "session": auth_response["session"]})
        origin = request.headers.get("Origin", "")
        allowed_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net").split(",")
        allowed_origins = [o.strip() for o in allowed_origins]
        
        if origin in allowed_origins or "*" in allowed_origins:
            resp.headers.add("Access-Control-Allow-Origin", origin)
        else:
            resp.headers.add("Access-Control-Allow-Origin", "https://console-encryptgate.net")
        resp.headers.add("Access-Control-Allow-Credentials", "true")
        return resp

    # Add CORS headers to response
    resp = jsonify({
        "id_token": auth_response.get("id_token"),
        "access_token": auth_response.get("access_token"),
        "refresh_token": auth_response.get("refresh_token"),
        "token_type": auth_response.get("token_type"),
        "expires_in": auth_response.get("expires_in"),
        "email": username,
    })
    
    origin = request.headers.get("Origin", "")
    allowed_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net").split(",")
    allowed_origins = [o.strip() for o in allowed_origins]
    
    if origin in allowed_origins or "*" in allowed_origins:
        resp.headers.add("Access-Control-Allow-Origin", origin)
    else:
        resp.headers.add("Access-Control-Allow-Origin", "https://console-encryptgate.net")
    resp.headers.add("Access-Control-Allow-Credentials", "true")
    return resp

@auth_routes.route("/confirm-signup", methods=["POST", "OPTIONS"])
def confirm_signup_endpoint():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
        
    data = request.json
    email = data.get('email')
    temp_password = data.get('temporary_password')
    new_password = data.get('new_password')

    if not (email and temp_password and new_password):
        return jsonify({"detail": "All fields are required"}), 400

    try:
        signup_response = confirm_signup(email, temp_password, new_password)
        if not signup_response:
            return jsonify({"detail": "Failed to confirm sign-up"}), 400
    except Exception as e:
        logger.error(f"Signup confirmation failed: {e}")
        return jsonify({"detail": f"Signup confirmation failed: {e}"}), 400

    # Add CORS headers to response
    resp = jsonify({"message": "Password changed successfully"})
    origin = request.headers.get("Origin", "")
    allowed_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net").split(",")
    allowed_origins = [o.strip() for o in allowed_origins]
    
    if origin in allowed_origins or "*" in allowed_origins:
        resp.headers.add("Access-Control-Allow-Origin", origin)
    else:
        resp.headers.add("Access-Control-Allow-Origin", "https://console-encryptgate.net")
    resp.headers.add("Access-Control-Allow-Credentials", "true")
    return resp

@auth_routes.route("/verify-mfa", methods=["POST", "OPTIONS"])
def verify_mfa_endpoint():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
        
    data = request.json
    session = data.get('session')
    code = data.get('code')
    username = data.get('username')

    if not (session and code and username):
        return jsonify({"detail": "Session, username, and code are required"}), 400

    try:
        auth_result = verify_mfa()
        
        # Add CORS headers to response
        resp = jsonify({
            "id_token": auth_result.get("id_token"),
            "access_token": auth_result.get("access_token"),
            "refresh_token": auth_result.get("refresh_token"),
            "token_type": auth_result.get("token_type"),
            "expires_in": auth_result.get("expires_in"),
            "email": username,
        })
        
        origin = request.headers.get("Origin", "")
        allowed_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net").split(",")
        allowed_origins = [o.strip() for o in allowed_origins]
        
        if origin in allowed_origins or "*" in allowed_origins:
            resp.headers.add("Access-Control-Allow-Origin", origin)
        else:
            resp.headers.add("Access-Control-Allow-Origin", "https://console-encryptgate.net")
        resp.headers.add("Access-Control-Allow-Credentials", "true")
        return resp
        
    except Exception as e:
        logger.error(f"MFA verification failed: {e}")
        return jsonify({"detail": f"MFA verification failed: {e}"}), 401