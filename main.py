import logging
import os
import sys
import traceback
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize the Flask app
app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# === CORS Configuration ===
cors_origins = os.getenv("CORS_ORIGINS", "https://console-encryptgate.net")
allowed_origins = [origin.strip() for origin in cors_origins.split(",")]
logger.info(f"CORS Origins: {allowed_origins}")

# Apply CORS to all routes
CORS(app, 
     resources={r"/*": {"origins": allowed_origins}},
     supports_credentials=True,
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Authorization", "Content-Type", "Accept", "Origin"])

# Register Blueprints
try:
    # Import the authentication routes blueprint
    from auth_routes import auth_routes
    
    # Register the blueprint with appropriate URL prefix
    app.register_blueprint(auth_routes, url_prefix="/api/auth")
    
    logger.info("Successfully registered authentication blueprint")
except Exception as e:
    logger.error(f"Failed to register authentication blueprint: {e}")
    logger.error(traceback.format_exc())

# === Basic Health Check Route ===
@app.route("/", methods=["GET"])
def home():
    return jsonify({"status": "success", "message": "EncryptGate API is Running!"}), 200

# === Handle CORS preflight requests globally ===
@app.after_request
def after_request(response):
    origin = request.headers.get("Origin", "")
    
    if origin in allowed_origins or "*" in allowed_origins:
        response.headers.set("Access-Control-Allow-Origin", origin)
    else:
        response.headers.set("Access-Control-Allow-Origin", "https://console-encryptgate.net")
    
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Origin")
    response.headers.set("Access-Control-Allow-Credentials", "true")
    
    return response

# === Main Entry Point ===
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