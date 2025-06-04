from flask import Blueprint, request, jsonify
import logging
import os
import traceback

# Import service functions (no more handle_cors_preflight)
from auth_services_routes import (
    authenticate_user,
    verify_mfa,
    confirm_signup
)

# Initialize the blueprint and logger
auth_routes = Blueprint('auth_routes', __name__)
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

@auth_routes.route("/debug", methods=["GET"])
def debug_info():
    """
    Return a list of registered routes and relevant environment variables.
    """
    try:
        routes = []
        for rule in auth_routes.url_map.iter_rules():
            routes.append({
                "endpoint": rule.endpoint,
                "methods": list(rule.methods),
                "path": str(rule)
            })

        env_info = {
            "CORS_ORIGINS": os.getenv("CORS_ORIGINS", "Not set"),
            "API_URL": os.getenv("API_URL", "Not set"),
            "FLASK_ENV": os.getenv("FLASK_ENV", "Not set"),
        }

        return jsonify({
            "status": "success",
            "routes": routes,
            "environment": env_info
        }), 200
    except Exception as e:
        logger.error(f"Error in debug_info: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@auth_routes.route("/test", methods=["GET"])
def test_route():
    """
    Simple GET endpoint to confirm that the blueprint is registered.
    """
    logger.info("Test route accessed successfully.")
    return jsonify({"message": "GET /test route works!"}), 200

@auth_routes.route("/login", methods=["POST"])
def login():
    """
    Handle user login. Calls authenticate_user(...) from auth_services_routes.
    On successful authentication, returns tokens.
    If MFA is required, returns {"mfa_required": True, "session": ...}.
    """
    logger.info("Login attempt initiated")
    data = request.json

    if not data:
        logger.warning("No JSON data found in login request")
        return jsonify({"detail": "No data provided"}), 400

    # Mask password in logs
    debug_data = {k: (v if k != "password" else "********") for k, v in data.items()}
    logger.info(f"Login request data: {debug_data}")

    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        logger.warning("Missing username or password in request")
        return jsonify({"detail": "Username and password are required"}), 400

    try:
        logger.info(f"Calling authenticate_user for: {username}")
        auth_response = authenticate_user(username, password)

        if isinstance(auth_response, tuple):
            # An error tuple was returned: (payload_dict, status_code)
            logger.warning(f"Authentication returned error: {auth_response[0]}")
            return jsonify(auth_response[0]), auth_response[1]
    except Exception as e:
        logger.error(f"Error during authentication: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": f"Authentication failed: {str(e)}"}), 401

    # If MFA is required, return session info
    if isinstance(auth_response, dict) and auth_response.get("mfa_required"):
        logger.info(f"MFA required for user: {username}")
        return jsonify({"mfa_required": True, "session": auth_response["session"]}), 200

    # Otherwise, return tokens
    logger.info(f"Authentication successful for: {username}")
    return jsonify({
        "id_token": auth_response.get("id_token"),
        "access_token": auth_response.get("access_token"),
        "refresh_token": auth_response.get("refresh_token"),
        "token_type": auth_response.get("token_type"),
        "expires_in": auth_response.get("expires_in"),
        "email": username
    }), 200

@auth_routes.route("/confirm-signup", methods=["POST"])
def confirm_signup_endpoint():
    """
    Handle user sign-up confirmation.
    Expects JSON with "email", "temporary_password", and "new_password".
    Calls confirm_signup(...) and returns a success message on completion.
    """
    logger.info("Confirm signup request received")
    data = request.json

    if not data:
        logger.warning("No JSON data found in confirm-signup request")
        return jsonify({"detail": "No data provided"}), 400

    email = data.get("email")
    temp_password = data.get("temporary_password")
    new_password = data.get("new_password")

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
        return jsonify({"detail": f"Signup confirmation failed: {str(e)}"}), 400

    logger.info(f"Password change successful for {email}")
    return jsonify({"message": "Password changed successfully"}), 200

@auth_routes.route("/verify-mfa", methods=["POST"])
def verify_mfa_endpoint():
    """
    Handle MFA verification.
    Expects JSON with "session", "code", and "username".
    Calls verify_mfa(...) and returns tokens on success.
    """
    logger.info("MFA verification request received")
    data = request.json

    if not data:
        logger.warning("No JSON data found in verify-mfa request")
        return jsonify({"detail": "No data provided"}), 400

    session = data.get("session")
    code = data.get("code")
    username = data.get("username")

    if not (session and code and username):
        logger.warning("Missing required fields for MFA verification")
        return jsonify({"detail": "Session, username, and code are required"}), 400

    try:
        logger.info(f"Calling verify_mfa for user: {username}")
        auth_result = verify_mfa(session, code, username)

        if isinstance(auth_result, tuple):
            # An error tuple was returned: (payload_dict, status_code)
            logger.warning(f"MFA verification error: {auth_result[0]}")
            return jsonify(auth_result[0]), auth_result[1]
    except Exception as e:
        logger.error(f"MFA verification failed: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"detail": f"MFA verification failed: {str(e)}"}), 401

    logger.info(f"MFA verification successful for: {username}")
    return jsonify({
        "id_token": auth_result.get("id_token"),
        "access_token": auth_result.get("access_token"),
        "refresh_token": auth_result.get("refresh_token"),
        "token_type": auth_result.get("token_type"),
        "expires_in": auth_result.get("expires_in"),
        "email": username
    }), 200
