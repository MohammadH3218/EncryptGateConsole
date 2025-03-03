import logging
import os
import sys
import traceback
import requests
import jwt
from flask import Flask, make_response, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Enhanced Logging Configuration
def setup_comprehensive_logging():
    # Ensure logs directory exists
    os.makedirs('/var/log/encryptgate', exist_ok=True)

    # Configure logging with more detailed formatting
    logging.basicConfig(
        level=logging.DEBUG,  # Set to DEBUG for most detailed logging
        format="%(asctime)s [%(levelname)s] %(pathname)s:%(lineno)d - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            # Console handler
            logging.StreamHandler(sys.stdout),
            # File handler for persistent logging
            logging.FileHandler('/var/log/encryptgate/application_debug.log', mode='a')
        ]
    )

    # Capture unhandled exceptions
    def handle_unhandled_exception(exc_type, exc_value, exc_traceback):
        if issubclass(exc_type, KeyboardInterrupt):
            sys.__excepthook__(exc_type, exc_value, exc_traceback)
            return
        logging.error("Uncaught exception", exc_info=(exc_type, exc_value, exc_traceback))

    sys.excepthook = handle_unhandled_exception

# Environment and Path Debugging
def log_environment_details():
    logging.info("=== Environment and System Details ===")
    
    # Python details
    logging.info(f"Python Executable: {sys.executable}")
    logging.info(f"Python Version: {sys.version}")
    
    # Current working directory
    logging.info(f"Current Working Directory: {os.getcwd()}")
    
    # Python path
    logging.info("Python Path (sys.path):")
    for path in sys.path:
        logging.info(f"  {path}")
    
    # Environment variables (be careful with sensitive info)
    logging.info("Environment Variables:")
    for key, value in os.environ.items():
        # Avoid logging sensitive information
        if key.lower() not in ['password', 'secret', 'token', 'aws_secret_access_key']:
            logging.info(f"  {key}: {value}")

# Load environment variables
load_dotenv()

# Setup logging and environment debugging
setup_comprehensive_logging()
log_environment_details()

# Fetch the API URL from environment variables
API_URL = os.getenv("API_URL")  
logger = logging.getLogger(__name__)

# Initialize the Flask app
app = Flask(__name__)

# Debug: Log application initialization
logger.info("Initializing EncryptGate Flask Application")

# Enable CORS with configurable origins
cors_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net")
allowed_origins = cors_origins.split(",")
logger.info(f"CORS Origins: {allowed_origins}")

# Diagnostic route to check server and environment
@app.route("/api/debug", methods=["GET"])
def debug_route():
    """
    Provides comprehensive debug information about the server environment
    """
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
        "api_url": API_URL
    }
    return jsonify(debug_info), 200

# Directory for PID files - let Gunicorn handle this
try:
    os.makedirs('/var/pids', exist_ok=True)
    logger.info("Created /var/pids directory successfully")
except Exception as e:
    logger.error(f"Failed to create /var/pids directory: {e}")

# Configure CORS with expanded options and logging
try:
    CORS(app, 
         resources={r"/api/*": {"origins": allowed_origins}},
         supports_credentials=True,
         methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
         allow_headers=["Authorization", "Content-Type", "Accept", "Origin"])
    logger.info("CORS configuration applied successfully")
except Exception as e:
    logger.error(f"CORS configuration failed: {e}")
    logger.error(traceback.format_exc())

# AWS Cognito Configuration (Updated to match AWS Amplify variable naming)
COGNITO_REGION = os.getenv("REGION", "us-east-1")
COGNITO_USERPOOL_ID = os.getenv("COGNITO_USERPOOL_ID")
COGNITO_CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")

# Log Cognito configuration (careful with sensitive info)
logger.info(f"Cognito Region: {COGNITO_REGION}")
logger.info(f"Cognito UserPool ID: {COGNITO_USERPOOL_ID}")

# Fetch AWS Cognito Public Keys with enhanced error handling
def get_cognito_public_keys():
    try:
        url = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USERPOOL_ID}/.well-known/jwks.json"
        logger.info(f"Fetching Cognito public keys from: {url}")
        response = requests.get(url, timeout=10)
        response.raise_for_status()  # Raise an exception for bad responses
        return response.json()
    except requests.RequestException as e:
        logger.error(f"Network error fetching Cognito public keys: {e}")
        return {"keys": []}
    except Exception as e:
        logger.error(f"Unexpected error fetching Cognito public keys: {e}")
        logger.error(traceback.format_exc())
        return {"keys": []}

# Cached public keys with logging
try:
    public_keys = get_cognito_public_keys()
    logger.info(f"Retrieved {len(public_keys.get('keys', []))} Cognito public keys")
except Exception as e:
    logger.error(f"Error caching public keys: {e}")
    public_keys = {"keys": []}

# Rest of the existing code remains the same...
# (Keep the authentication, routes, and main block from your original main.py)

# Main entry point to run the server with enhanced error handling
if __name__ == "__main__":
    try:
        debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
        port = int(os.getenv("PORT", 5000))
        
        logger.info(f"Preparing to start Flask server")
        logger.info(f"Debug Mode: {debug_mode}")
        logger.info(f"Port: {port}")
        
        app.run(debug=debug_mode, host="0.0.0.0", port=port)
    except Exception as e:
        logger.error(f"Critical failure starting Flask server: {e}")
        logger.error(traceback.format_exc())
        sys.exit(1)