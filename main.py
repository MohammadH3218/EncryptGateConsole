import logging
import os
import sys
import traceback
import requests
import jwt
import time
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from dotenv import load_dotenv
from datetime import datetime
import importlib.util

# Load environment variables
load_dotenv()

# Initialize the Flask app (Global for Gunicorn)
app = Flask(__name__)

# === Logging Setup ===
def setup_comprehensive_logging():
    try:
        log_dir = "/var/log/encryptgate"
        try:
            os.makedirs(log_dir, exist_ok=True)
        except PermissionError:
            # Fall back to a directory we can write to
            log_dir = "/tmp/encryptgate_logs"
            os.makedirs(log_dir, exist_ok=True)
            print(f"WARNING: Could not access /var/log/encryptgate, using {log_dir} instead")

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
    except Exception as e:
        # Ensure setup_comprehensive_logging never fails the application startup
        print(f"WARNING: Could not set up comprehensive logging: {e}")
        logging.basicConfig(
            level=logging.DEBUG,
            format="%(asctime)s [%(levelname)s] %(pathname)s:%(lineno)d - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
            handlers=[
                logging.StreamHandler(sys.stdout)
            ]
        )

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
try:
    pid_dir = "/var/pids"
    os.makedirs(pid_dir, exist_ok=True)
    logger.info(f"PID directory set: {pid_dir}")
except PermissionError:
    pid_dir = "/tmp/pids"
    os.makedirs(pid_dir, exist_ok=True)
    logger.info(f"Could not use /var/pids, using {pid_dir} instead")
except Exception as e:
    logger.error(f"Error setting up PID directory: {e}")

# === API URL Configuration ===
API_URL = os.getenv("API_URL", "http://localhost:8080")
logger.info(f"API URL: {API_URL}")

# === CORS Configuration ===
cors_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net")
allowed_origins = [origin.strip() for origin in cors_origins.split(",")]
logger.info(f"CORS Origins: {allowed_origins}")

# Apply CORS to all routes with expanded configuration
CORS(app, 
     resources={r"/*": {"origins": allowed_origins}},  # Changed from /api/* to /* to cover all routes
     supports_credentials=True,
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Authorization", "Content-Type", "Accept", "Origin"])

# Global after_request handler to ensure CORS headers are added to all responses
@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin", "")
    logger.debug(f"Processing response for origin: {origin}")
    
    if origin in allowed_origins or "*" in allowed_origins:
        response.headers.set("Access-Control-Allow-Origin", origin)
    else:
        # Default to the primary domain if origin is not in allowed list
        response.headers.set("Access-Control-Allow-Origin", "https://console-encryptgate.net")
    
    # Set other CORS headers
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Origin")
    response.headers.set("Access-Control-Allow-Credentials", "true")
    
    return response

# Add debug logger for CORS issues
@app.after_request
def log_cors_debug_info(response):
    origin = request.headers.get("Origin", "None")
    method = request.method
    path = request.path
    
    logger.info(f"CORS Debug - Request: {method} {path} from Origin: {origin}")
    logger.info(f"CORS Debug - Response Headers: {dict(response.headers)}")
    
    # Check if CORS headers are set correctly
    has_cors_origin = "Access-Control-Allow-Origin" in response.headers
    logger.info(f"CORS Debug - Has Allow-Origin Header: {has_cors_origin}")
    
    # Log allowed origins for reference
    logger.info(f"CORS Debug - Configured Allowed Origins: {allowed_origins}")
    
    return response

# Get the absolute path of the current directory
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)
    logger.info(f"Added {current_dir} to Python path")

# Add debug endpoint to check if blueprints were registered
@app.route("/debug-routes", methods=["GET"])
def debug_routes():
    """Debug endpoint to list all registered routes"""
    routes = []
    for rule in app.url_map.iter_rules():
        routes.append({
            "endpoint": rule.endpoint,
            "methods": list(rule.methods),
            "path": str(rule)
        })
    return jsonify({
        "registered_routes": routes,
        "blueprints": list(app.blueprints.keys()) if hasattr(app, 'blueprints') else [],
        "blueprint_paths": {name: bp.url_prefix for name, bp in app.blueprints.items()} if hasattr(app, 'blueprints') else {}
    })

# Register Blueprints
try:
    # Method 1: Standard import (may work if files are in correct location)
    try:
        from auth_services_routes import auth_services_routes
        from auth_routes import auth_routes
        logger.info("Successfully imported blueprints with direct import")
    except ImportError as e:
        logger.error(f"Direct import failed: {e}")
        
        # Method 2: Import using importlib (more robust for Elastic Beanstalk)
        auth_services_file = os.path.join(current_dir, "auth_services_routes.py")
        auth_routes_file = os.path.join(current_dir, "auth_routes.py")
        
        if os.path.isfile(auth_services_file) and os.path.isfile(auth_routes_file):
            logger.info(f"Found route files in: {current_dir}")
            
            spec1 = importlib.util.spec_from_file_location("auth_services_routes", auth_services_file)
            auth_services_module = importlib.util.module_from_spec(spec1)
            spec1.loader.exec_module(auth_services_module)
            
            spec2 = importlib.util.spec_from_file_location("auth_routes", auth_routes_file)
            auth_routes_module = importlib.util.module_from_spec(spec2)
            spec2.loader.exec_module(auth_routes_module)
            
            auth_services_routes = auth_services_module.auth_services_routes
            auth_routes = auth_routes_module.auth_routes
            logger.info("Successfully imported blueprints using file location")
        else:
            logger.error(f"Route files not found in: {current_dir}")
            # List files in current directory for debugging
            logger.info(f"Files in directory: {os.listdir(current_dir)}")
            raise ImportError("Route files not found")
    
    # Register the blueprints with the app
    app.register_blueprint(auth_services_routes, url_prefix="/api/auth")
    app.register_blueprint(auth_routes, url_prefix="/api/user")
    
    # Log success
    logger.info("Successfully registered blueprints")
    logger.info(f"Registered blueprints: {list(app.blueprints.keys())}")
    
    # Log all registered routes
    routes = []
    for rule in app.url_map.iter_rules():
        routes.append(f"{rule.endpoint}: {rule.methods} - {rule}")
    logger.info(f"Registered routes: {len(routes)}")
    for route in routes:
        logger.info(f"Route: {route}")
except Exception as e:
    logger.error(f"Failed to register blueprints: {e}")
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

try:
    public_keys = get_cognito_public_keys()
    logger.info(f"Retrieved {len(public_keys.get('keys', []))} Cognito public keys")
except Exception as e:
    logger.error(f"Error retrieving Cognito public keys: {e}")
    public_keys = {"keys": []}

# === Basic Health Check Route ===
@app.route("/", methods=["GET"])
def root():
    return jsonify({"status": "success", "message": "EncryptGate API Root"}), 200

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy", 
        "message": "EncryptGate API is Running!",
        "timestamp": datetime.now().isoformat()
    }), 200

@app.route("/api/health", methods=["GET"])
def api_health_check():
    """Health check endpoint for API monitoring."""
    return jsonify({
        "status": "healthy",
        "service": "EncryptGate API",
        "version": "1.0",
        "timestamp": datetime.now().isoformat()
    }), 200

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

# === Simple CORS Test Endpoint ===
@app.route("/api/simple-cors-test", methods=["GET", "OPTIONS", "POST"])
def simple_cors_test():
    logger.info(f"Simple CORS test endpoint accessed - Method: {request.method}")
    logger.info(f"Request headers: {dict(request.headers)}")
    
    if request.method == "OPTIONS":
        logger.info("Handling OPTIONS preflight request")
        return handle_preflight_request()
    
    # For GET or POST methods
    response = jsonify({
        "message": "CORS test successful!",
        "method": request.method,
        "timestamp": datetime.now().isoformat(),
        "request_origin": request.headers.get("Origin", "None"),
        "your_ip": request.remote_addr
    })
    
    logger.info(f"Returning simple test response with headers: {dict(response.headers)}")
    return response

# === Direct fallback for test-mfa-code ===
@app.route("/api/auth/test-mfa-code", methods=["POST", "OPTIONS"])
def direct_test_mfa_code():
    """Direct fallback for MFA code testing"""
    logger.info(f"test-mfa-code endpoint accessed with method: {request.method}")
    logger.info(f"Request headers: {dict(request.headers)}")
    
    if request.method == "OPTIONS":
        logger.info("Handling OPTIONS preflight request")
        response = handle_preflight_request()
        logger.info(f"Preflight response headers: {dict(response[0].headers)}")
        return response
    
    try:
        # Log request body
        try:
            data = request.json
            logger.info(f"Request body: {data}")
        except Exception as e:
            logger.info(f"Could not parse request body: {e}")
            data = {}
            
        secret = data.get('secret', '')
        code = data.get('code', '')
        
        # Create a response with useful debug info
        result = {
            "valid": True,
            "server_time": datetime.now().isoformat(),
            "current_code": "123456",  # Dummy code for testing
            "timestamp": int(time.time()),
            "time_window": f"{int(time.time()) % 30}/30 seconds",
            "debug_info": {
                "request_origin": request.headers.get("Origin", "None"),
                "request_method": request.method,
                "allowed_origins": allowed_origins,
                "cors_enabled": True
            }
        }
        
        logger.info(f"Returning response: {result}")
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error in direct_test_mfa_code: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            "valid": False, 
            "error": str(e),
            "server_time": datetime.now().isoformat()
        }), 500

# === Direct fallback for authenticate ===
@app.route("/api/auth/authenticate", methods=["POST", "OPTIONS"])
def direct_authenticate():
    """Direct fallback for authentication"""
    logger.info(f"Direct authenticate endpoint accessed - Method: {request.method}")
    logger.info(f"Request headers: {dict(request.headers)}")
    
    if request.method == "OPTIONS":
        logger.info("Handling OPTIONS preflight request")
        response = handle_preflight_request()
        logger.info(f"Preflight response headers: {dict(response[0].headers)}")
        return response
    
    try:
        # Get request data
        data = request.json
        logger.info(f"Authentication data received: {data if data else 'No data'}")
        
        # Try to use the function from auth_services_routes if available
        try:
            # Try to import the authenticate_user function
            try:
                from auth_services_routes import authenticate_user
                logger.info("Successfully imported authenticate_user function")
            except ImportError:
                # Try with the blueprint module from earlier import
                try:
                    authenticate_user = auth_services_module.authenticate_user
                    logger.info("Using authenticate_user from module")
                except:
                    logger.error("Could not access authenticate_user function")
                    raise ImportError("authenticate_user function not available")
            
            username = data.get('username')
            password = data.get('password')
            
            if not username or not password:
                logger.warning("Missing username or password in request")
                return jsonify({"detail": "Username and password are required"}), 400
            
            logger.info(f"Calling authenticate_user for: {username}")
            auth_response = authenticate_user(username, password)
            
            logger.info(f"Auth response type: {type(auth_response)}")
            if isinstance(auth_response, tuple):
                logger.warning(f"Authentication returned error: {auth_response[0]}")
                return jsonify(auth_response[0]), auth_response[1]
            
            logger.info("Authentication successful")
            return jsonify(auth_response)
            
        except Exception as auth_error:
            logger.error(f"Error using authenticate_user: {auth_error}")
            logger.error(traceback.format_exc())
            
            # Fallback response
            return jsonify({
                "message": "Authentication endpoint reached, but there was an error processing the request",
                "detail": str(auth_error),
                "server_time": datetime.now().isoformat()
            }), 500
    except Exception as e:
        logger.error(f"Error in direct_authenticate: {e}")
        logger.error(traceback.format_exc())
        return jsonify({
            "message": "Authentication endpoint reached, but error in request processing",
            "error": str(e),
            "server_time": datetime.now().isoformat()
        }), 500

# === Test POST endpoint to verify basic functionality ===
@app.route("/api/test-post", methods=["POST", "OPTIONS"])
def test_post():
    if request.method == "OPTIONS":
        return handle_preflight_request()
        
    try:
        logger.info("Test POST endpoint accessed")
        data = request.json
        logger.info(f"Test POST received data: {data}")
        
        return jsonify({
            "status": "success",
            "received_data": data,
            "message": "POST request successful"
        }), 200
    except Exception as e:
        logger.error(f"Error in test POST endpoint: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            "status": "error",
            "error": str(e),
            "message": "Error processing POST request"
        }), 500

# === CORS status check route to help diagnose issues ===
@app.route("/api/cors-check", methods=["GET", "OPTIONS"])
def cors_check():
    if request.method == "OPTIONS":
        return handle_preflight_request()
        
    origin = request.headers.get("Origin", "Unknown")
    is_allowed = origin in allowed_origins or "*" in allowed_origins
    
    response = jsonify({
        "status": "success",
        "message": "CORS check endpoint",
        "request_origin": origin,
        "is_allowed_origin": is_allowed,
        "allowed_origins": allowed_origins
    })
    
    return response, 200

# === Helper function for CORS preflight requests ===
def handle_preflight_request():
    response = jsonify({"status": "success"})
    origin = request.headers.get("Origin", "")
    logger.info(f"Handling CORS preflight for origin: {origin}")
    
    if origin in allowed_origins or "*" in allowed_origins:
        response.headers.set("Access-Control-Allow-Origin", origin)
    else:
        response.headers.set("Access-Control-Allow-Origin", "https://console-encryptgate.net")
        
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Origin")
    response.headers.set("Access-Control-Allow-Credentials", "true")
    response.headers.set("Access-Control-Max-Age", "3600")  # Cache preflight for 1 hour
    
    return response, 204

# == Main Entry Point (Ensure AWS Elastic Beanstalk Uses Port 8080) ==
if __name__ == "__main__":
    try:
        debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
        port = int(os.getenv("PORT", 8080))  # AWS EB requires port 8080
        
        logger.info(f"Starting Flask server on port {port}")
        app.run(debug=debug_mode, host="0.0.0.0", port=port)
    except Exception as e:
        logger.error(f"Critical failure starting Flask server: {e}")
        logger.error(traceback.format_exc())
        sys.exit(1)