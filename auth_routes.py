from flask import Blueprint, request, jsonify, make_response
from auth_services_routes import (
    authenticate_user,
    verify_mfa,
    confirm_signup,
    handle_cors_preflight
)
import logging 
import os
import traceback
from datetime import datetime

# Initialize the blueprint and logger
auth_routes = Blueprint('auth_routes', __name__)
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# Add a route for debugging to help diagnose issues
@auth_routes.route("/test-mfa-code", methods=["POST", "OPTIONS"])
def test_mfa_code():
    if request.method == "OPTIONS":
        return handle_cors_preflight()
    
    data = request.json
    # Simulate TOTP code validation or just echo back
    return jsonify({
        "server_time": datetime.utcnow().isoformat() + "Z",
        "current_code": "123456",  # replace with real TOTP if needed
        "validCodes": ["123456", "654321"]
    })

@auth_routes.route("/debug", methods=["GET"])
def debug_info():
    try:
        routes = []
        for rule in auth_routes.url_map.iter_rules():
            routes.append({
                "endpoint": rule.endpoint,
                "methods": list(rule.methods),
                "path": str(rule)
            })
        
        # Get environment information
        env_info = {
            "CORS_ORIGINS": os.getenv("CORS_ORIGINS", "Not set"),
            "API_URL": os.getenv("API_URL", "Not set"),
            "FLASK_ENV": os.getenv("FLASK_ENV", "Not set"),
        }
        
        return jsonify({
            "status": "success", 
            "routes": routes,
            "environment": env_info
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

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
        
    logger.info(f"Login attempt initiated from: {request.headers.get('Origin', 'Unknown origin')}")
    data = request.json
    
    # Log request data for debugging (mask password)
    if data:
        debug_data = {k: v if k != 'password' else '********' for k, v in data.items()}
        logger.info(f"Login request data: {debug_data}")
    else:
        logger.warning("No JSON data found in login request")
        return jsonify({"detail": "No data provided"}), 400
    
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        logger.warning("Missing username or password in request")
        return jsonify({"detail": "Username and password are required"}), 400

    try:
        # Pass username and password to authenticate_user
        logger.info(f"Calling authenticate_user for: {username}")
        auth_response = authenticate_user(username, password)
        
        logger.info(f"Auth response type: {type(auth_response)}")
        if isinstance(auth_response, tuple):
            logger.warning(f"Authentication returned error: {auth_response[0]}")
            return jsonify(auth_response[0]), auth_response[1]
    except Exception as e:
        logger.error(f"Error during authentication: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": f"Authentication failed: {str(e)}"}), 401

    # MFA Handling
    if isinstance(auth_response, dict) and auth_response.get("mfa_required"):
        logger.info(f"MFA required for user: {username}")
        resp = jsonify({"mfa_required": True, "session": auth_response["session"]})
    else:
        logger.info(f"Authentication successful for: {username}")
        resp = jsonify({
            "id_token": auth_response.get("id_token"),
            "access_token": auth_response.get("access_token"),
            "refresh_token": auth_response.get("refresh_token"),
            "token_type": auth_response.get("token_type"),
            "expires_in": auth_response.get("expires_in"),
            "email": username,
        })
    
    # CORS Headers
    origin = request.headers.get("Origin", "")
    logger.info(f"Setting CORS headers for origin: {origin}")
    
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
        
    logger.info("Confirm signup request received")
    data = request.json
    email = data.get('email')
    temp_password = data.get('temporary_password')
    new_password = data.get('new_password')

    if not (email and temp_password and new_password):
        logger.warning("Missing required fields for confirm signup")
        return jsonify({"detail": "All fields are required"}), 400

    try:
        signup_response = confirm_signup(email, temp_password, new_password)
        if not signup_response:
            logger.warning(f"Failed to confirm sign-up for {email}")
            return jsonify({"detail": "Failed to confirm sign-up"}), 400
    except Exception as e:
        logger.error(f"Signup confirmation failed: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": f"Signup confirmation failed: {e}"}), 400

    logger.info(f"Password change successful for {email}")
    resp = jsonify({"message": "Password changed successfully"})
    
    # CORS Headers
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
        
    logger.info("MFA verification request received")
    data = request.json
    session = data.get('session')
    code = data.get('code')
    username = data.get('username')

    if not (session and code and username):
        logger.warning("Missing required fields for MFA verification")
        return jsonify({"detail": "Session, username, and code are required"}), 400

    try:
        logger.info(f"Calling verify_mfa for user: {username}")
        auth_result = verify_mfa(session, code, username)
        
        if isinstance(auth_result, tuple):
            logger.warning(f"MFA verification error: {auth_result[0]}")
            return jsonify(auth_result[0]), auth_result[1]
        
        logger.info(f"MFA verification successful for: {username}")
        resp = jsonify({
            "id_token": auth_result.get("id_token"),
            "access_token": auth_result.get("access_token"),
            "refresh_token": auth_result.get("refresh_token"),
            "token_type": auth_result.get("token_type"),
            "expires_in": auth_result.get("expires_in"),
            "email": username,
        })
        
    except Exception as e:
        logger.error(f"MFA verification failed: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": f"MFA verification failed: {e}"}), 401

    # CORS Headers
    origin = request.headers.get("Origin", "")
    allowed_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net").split(",")
    allowed_origins = [o.strip() for o in allowed_origins]
    
    if origin in allowed_origins or "*" in allowed_origins:
        resp.headers.add("Access-Control-Allow-Origin", origin)
    else:
        resp.headers.add("Access-Control-Allow-Origin", "https://console-encryptgate.net")
    
    resp.headers.add("Access-Control-Allow-Credentials", "true")
    return resp