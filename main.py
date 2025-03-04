import logging
import os
import sys
import traceback
import requests
import jwt
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize the Flask app (Global for Gunicorn)
app = Flask(__name__)

# === Logging Setup ===
def setup_comprehensive_logging():
    log_dir = "/var/log/encryptgate"
    os.makedirs(log_dir, exist_ok=True)  # Ensure the log directory exists

    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s [%(levelname)s] %(pathname)s:%(lineno)d - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(os.path.join(log_dir, "application_debug.log"), mode='a')
        ]
    )

    # Capture unhandled exceptions
    def handle_unhandled_exception(exc_type, exc_value, exc_traceback):
        if issubclass(exc_type, KeyboardInterrupt):
            sys.__excepthook__(exc_type, exc_value, exc_traceback)
            return
        logging.error("Uncaught exception", exc_info=(exc_type, exc_value, exc_traceback))

    sys.excepthook = handle_unhandled_exception

setup_comprehensive_logging()
logger = logging.getLogger(__name__)

# === Log Environment Details ===
def log_environment_details():
    logger.info("=== Environment and System Details ===")
    logger.info(f"Python Executable: {sys.executable}")
    logger.info(f"Python Version: {sys.version}")
    logger.info(f"Current Working Directory: {os.getcwd()}")

    logger.info("Python Path:")
    for path in sys.path:
        logger.info(f"  {path}")

    logger.info("Environment Variables:")
    for key, value in os.environ.items():
        if key.lower() not in ['password', 'secret', 'token', 'aws_secret_access_key']:
            logger.info(f"  {key}: {value}")

log_environment_details()

# === Ensure Required Directories Exist ===
pid_dir = "/var/pids"
os.makedirs(pid_dir, exist_ok=True)
logger.info(f"PID directory set: {pid_dir}")

# === API URL Configuration ===
API_URL = os.getenv("API_URL", "http://localhost:8080")
logger.info(f"API URL: {API_URL}")

# === CORS Configuration ===
cors_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net")
allowed_origins = cors_origins.split(",")
logger.info(f"CORS Origins: {allowed_origins}")

CORS(app, 
     resources={r"/api/*": {"origins": allowed_origins}},
     supports_credentials=True,
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Authorization", "Content-Type", "Accept", "Origin"])

# Register Blueprints
try:
    # Import the authentication route blueprints
    from app.services.auth_services_routes import auth_services_routes
    from app.services.auth_routes import auth_routes
    
    # Register the blueprints with appropriate URL prefixes
    app.register_blueprint(auth_services_routes, url_prefix="/api/auth")
    app.register_blueprint(auth_routes, url_prefix="/api/user")
    
    logger.info("Successfully registered authentication blueprints")
except Exception as e:
    logger.error(f"Failed to register authentication blueprints: {e}")
    logger.error(traceback.format_exc())

# === AWS Cognito Configuration ===
COGNITO_REGION = os.getenv("REGION", "us-east-1")
COGNITO_USERPOOL_ID = os.getenv("COGNITO_USERPOOL_ID")
COGNITO_CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")

logger.info(f"Cognito Region: {COGNITO_REGION}")
logger.info(f"Cognito UserPool ID: {COGNITO_USERPOOL_ID}")

# === Fetch AWS Cognito Public Keys ===
def get_cognito_public_keys():
    try:
        url = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USERPOOL_ID}/.well-known/jwks.json"
        logger.info(f"Fetching Cognito public keys from: {url}")
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        logger.error(f"Network error fetching Cognito public keys: {e}")
        return {"keys": []}
    except Exception as e:
        logger.error(f"Unexpected error fetching Cognito public keys: {e}")
        logger.error(traceback.format_exc())
        return {"keys": []}

public_keys = get_cognito_public_keys()
logger.info(f"Retrieved {len(public_keys.get('keys', []))} Cognito public keys")

# === Basic Health Check Route ===
@app.route("/", methods=["GET"])
def home():
    return jsonify({"status": "success", "message": "EncryptGate API is Running!"}), 200

# === Improved Debug Route ===
@app.route("/api/debug", methods=["GET"])
def debug_route():
    debug_info = {
        "python_version": sys.version,
        "current_directory": os.getcwd(),
        "environment_variables": {
            key: value for key, value in os.environ.items()
            if key.lower() not in ['password', 'secret', 'token', 'aws_secret_access_key']
        },
        "python_path": sys.path,
        "flask_debug": app.debug,
        "cors_origins": allowed_origins,
        "api_url": API_URL,
        "running_processes": os.popen("ps aux | grep gunicorn").read().strip()
    }
    return jsonify(debug_info), 200

# === Example API Route to Verify Functionality ===
@app.route("/api/hello", methods=["GET"])
def hello_world():
    return jsonify({"message": "Hello from EncryptGate API!"}), 200

# == Main Entry Point (Ensure AWS Elastic Beanstalk Uses Port 8080) ==
if __name__ == "__main__":
    try:
        debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
        port = int(os.getenv("PORT", 8080))  # AWS EB requires port 8080
        
        logger.info("Starting Flask server on port 8080")
        app.run(debug=debug_mode, host="0.0.0.0", port=port)
    except Exception as e:
        logger.error(f"Critical failure starting Flask server: {e}")
        logger.error(traceback.format_exc())
        sys.exit(1)