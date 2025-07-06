import logging
import os
import sys
import traceback
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone

# Load environment variables
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
CORS(app, 
     resources={
         r"/api/*": {
             "origins": allowed_origins,
             "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
             "allow_headers": ["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
             "supports_credentials": True,
             "max_age": 3600
         }
     },
     supports_credentials=True)

@app.before_request
def handle_preflight():
    """Handle CORS preflight requests"""
    if request.method == "OPTIONS":
        origin = request.headers.get("Origin", "")
        logger.info(f"Handling OPTIONS preflight for origin: {origin}")
        
        response = make_response()
        
        # Set CORS headers
        if origin in allowed_origins or "*" in allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
        else:
            response.headers["Access-Control-Allow-Origin"] = "https://console-encryptgate.net"
        
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, Accept, Origin, X-Requested-With"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Max-Age"] = "3600"
        
        return response

@app.after_request
def after_request(response):
    """Add CORS headers to all responses"""
    origin = request.headers.get("Origin", "")
    
    if origin:
        if origin in allowed_origins or "*" in allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
        else:
            response.headers["Access-Control-Allow-Origin"] = "https://console-encryptgate.net"
        
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, Accept, Origin, X-Requested-With"
        response.headers["Access-Control-Allow-Credentials"] = "true"
    
    return response

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('/var/log/encryptgate/application.log', mode='a')
    ]
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

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8080, debug=False)