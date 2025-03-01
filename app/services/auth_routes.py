from flask import Blueprint, request, jsonify
from services.auth_services_routes import (
    authenticate_user,
    verify_mfa,
    confirm_signup
)
import logging

# Initialize the blueprint and logger
auth_routes = Blueprint('auth_routes', __name__)
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

@auth_routes.route("/test", methods=["GET"])
def test_route():
    logger.info("Test route accessed successfully.")
    return jsonify({"message": "GET /test route works!"})

@auth_routes.route("/login", methods=["POST"])
def login():
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
        return jsonify({"mfa_required": True, "session": auth_response["session"]})

    return jsonify({
        "id_token": auth_response.get("id_token"),
        "access_token": auth_response.get("access_token"),
        "refresh_token": auth_response.get("refresh_token"),
        "token_type": auth_response.get("token_type"),
        "expires_in": auth_response.get("expires_in"),
        "email": username,
    })

@auth_routes.route("/confirm-signup", methods=["POST"])
def confirm_signup_endpoint():
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

    return jsonify({"message": "Password changed successfully"})

@auth_routes.route("/verify-mfa", methods=["POST"])
def verify_mfa_endpoint():
    data = request.json
    session = data.get('session')
    code = data.get('code')
    username = data.get('username')

    if not (session and code and username):
        return jsonify({"detail": "Session, username, and code are required"}), 400

    try:
        auth_result = verify_mfa()
        return jsonify({
            "id_token": auth_result.get("id_token"),
            "access_token": auth_result.get("access_token"),
            "refresh_token": auth_result.get("refresh_token"),
            "token_type": auth_result.get("token_type"),
            "expires_in": auth_result.get("expires_in"),
            "email": username,
        })
    except Exception as e:
        logger.error(f"MFA verification failed: {e}")
        return jsonify({"detail": f"MFA verification failed: {e}"}), 401
