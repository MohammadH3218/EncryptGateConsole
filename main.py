import logging
import os
import sys
import traceback
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone

load_dotenv()

# Initialize the Flask app
app = Flask(__name__)

# COMPREHENSIVE CORS CONFIGURATION
cors_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net")
allowed_origins = [origin.strip() for origin in cors_origins.split(",")]

# Add localhost for development
if os.getenv("FLASK_ENV") == "development":
    allowed_origins.extend([
        "http://localhost:3000", 
        "http://localhost:8000",
        "http://127.0.0.1:3000"
    ])

logger = logging.getLogger(__name__)
logger.info(f"CORS Origins configured: {allowed_origins}")

# Configure CORS with explicit settings
# Remove the before_request and after_request handlers - let Flask-CORS handle everything
CORS(app, 
     resources={
         r"/api/*": {
             "origins": allowed_origins,
             "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
             "allow_headers": ["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
             "supports_credentials": True,
             "max_age": 86400  # 24 hours
         }
     },
     supports_credentials=True)

# Configure logging
# Only add file handler if not in development mode and directory exists
log_handlers = [logging.StreamHandler(sys.stdout)]

# Only add file logging in production (not local dev)
if os.getenv("FLASK_ENV") != "development":
    log_file_path = '/var/log/encryptgate/application.log'
    try:
        # Try to create the directory if it doesn't exist
        log_dir = os.path.dirname(log_file_path)
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir, exist_ok=True)
        log_handlers.append(logging.FileHandler(log_file_path, mode='a'))
    except (PermissionError, OSError) as e:
        # If we can't write to the log file (e.g., local dev), just use console
        logger.warning(f"Could not set up file logging: {e}. Using console only.")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    handlers=log_handlers
)

# Import and register blueprints
try:
    from auth_services_routes import auth_services_routes
    from auth_routes import auth_routes
    
    app.register_blueprint(auth_services_routes, url_prefix="/api/auth")
    app.register_blueprint(auth_routes, url_prefix="/api/user")
    
    logger.info("Successfully registered blueprints")
except Exception as e:
    logger.error(f"Failed to register blueprints: {e}")
    logger.error(traceback.format_exc())

# Health check endpoints
@app.route("/", methods=["GET"])
def root():
    return jsonify({"status": "success", "message": "EncryptGate API Root"}), 200

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy",
        "message": "EncryptGate API is Running!",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cors_origins": allowed_origins
    }), 200

@app.route("/api/health", methods=["GET", "OPTIONS"])
def api_health_check():
    """Health check endpoint for API monitoring."""
    return jsonify({
        "status": "healthy",
        "service": "EncryptGate API",
        "version": "1.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cors_origins": allowed_origins
    }), 200

# CORS test endpoint
@app.route("/api/cors-test", methods=["GET", "POST", "OPTIONS"])
def cors_test():
    origin = request.headers.get("Origin", "None")
    logger.info(f"CORS test accessed - Method: {request.method}, Origin: {origin}")
    
    return jsonify({
        "message": "CORS test successful!",
        "method": request.method,
        "origin": origin,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "headers_received": dict(request.headers)
    })

# JSON error handlers to prevent HTML error pages
@app.errorhandler(404)
def not_found(e):
    return jsonify({"ok": False, "error": "not_found", "message": "Endpoint not found"}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({"ok": False, "error": "server_error", "message": "Internal server error"}), 500

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"ok": False, "error": "method_not_allowed", "message": "Method not allowed"}), 405

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8000, debug=False)