from flask import Blueprint, jsonify, request
from app.services.auth_services_routes import authenticate_user_with_cognito, verify_mfa_code, create_access_token

auth_api_routes = Blueprint('auth_api_routes', __name__)

@auth_api_routes.route("/login", methods=["POST"])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"detail": "Username and password are required"}), 400

    auth_response = authenticate_user_with_cognito(username, password)
    
    if auth_response.get("mfa_required"):
        return jsonify({"mfa_required": True, "session": auth_response["session"]})

    authentication_result = auth_response.get("authentication_result")
    if not authentication_result:
        return jsonify({"detail": "Invalid credentials"}), 401

    access_token = create_access_token({
        "sub": username,
        "role": "employee",
        "email": username
    })

    return jsonify({"token": access_token, "role": "employee", "email": username, "mfa_required": False})

@auth_api_routes.route("/verify-mfa", methods=["POST"])
def verify_mfa_endpoint():
    data = request.json
    session = data.get('session')
    code = data.get('code')

    if not (session and code):
        return jsonify({"detail": "Session and code are required"}), 400

    try:
        auth_result = verify_mfa_code(session, code)
        access_token = create_access_token({
            "sub": "username-placeholder",
            "role": "employee"
        })
        return jsonify({"token": access_token, "role": "employee", "email": "username-placeholder", "mfa_required": False})
    except Exception as e:
        return jsonify({"detail": "MFA verification failed"}), 401
