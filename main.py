import logging
import os
import sys
import traceback
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(filename)s:%(lineno)d - %(message)s"
)
logger = logging.getLogger(__name__)

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
