import logging
import os
import sys
import traceback
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Logging setup
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(filename)s:%(lineno)d - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("/tmp/application_debug.log", mode='a')
    ]
)
logger = logging.getLogger(__name__)

# Log environment details (helpful for debugging in Postman tests)
def log_environment_details():
    logger.info("=== Environment Details ===")
    logger.info(f"Python Version: {sys.version}")
    logger.info(f"Current Directory: {os.getcwd()}")
    logger.info(f"FLASK_ENV: {os.getenv('FLASK_ENV', 'production')}")
    logger.info(f"API_URL: {os.getenv('API_URL', 'not set')}")
    logger.info(f"CORS_ORIGINS: {os.getenv('CORS_ORIGINS', 'not set')}")
    # You can log additional AWS configuration (without exposing secrets)
    logger.info(f"Region: {os.getenv('REGION', 'us-east-1')}")
    logger.info(f"User Pool ID Configured: {bool(os.getenv('COGNITO_USERPOOL_ID'))}")
    logger.info(f"Client ID Configured: {bool(os.getenv('COGNITO_CLIENT_ID'))}")
    logger.info(f"Client Secret Configured: {bool(os.getenv('COGNITO_CLIENT_SECRET'))}")

log_environment_details()

# CORS Configuration
cors_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net")
allowed_origins = [origin.strip() for origin in cors_origins.split(",")]
CORS(app, 
     resources={r"/*": {"origins": allowed_origins}},
     supports_credentials=True,
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Authorization", "Content-Type", "Accept", "Origin"])

@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin", "")
    logger.debug(f"Processing response for origin: {origin}")
    if origin in allowed_origins or "*" in allowed_origins:
        response.headers.set("Access-Control-Allow-Origin", origin)
    else:
        response.headers.set("Access-Control-Allow-Origin", allowed_origins[0] if allowed_origins else "*")
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Origin")
    response.headers.set("Access-Control-Allow-Credentials", "true")
    return response

try:
    from auth_services_routes import auth_services_routes
    from auth_routes import auth_routes
    app.register_blueprint(auth_services_routes, url_prefix="/api/auth")
    app.register_blueprint(auth_routes, url_prefix="/api/user")
    logger.info("Authentication blueprints registered successfully.")
except Exception as e:
    logger.error(f"Failed to register blueprints: {e}")
    logger.error(traceback.format_exc())

@app.route("/", methods=["GET"])
def home():
    return jsonify({"status": "success", "message": "EncryptGate API is Running!"}), 200

if __name__ == "__main__":
    try:
        port = int(os.getenv("PORT", 8080))
        logger.info(f"Starting server on port {port}")
        app.run(host="0.0.0.0", port=port)
    except Exception as e:
        logger.error(f"Critical error starting server: {e}")
        logger.error(traceback.format_exc())
        sys.exit(1)
