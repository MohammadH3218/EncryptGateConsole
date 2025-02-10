import logging
import os
from flask import Flask
from flask_cors import CORS
from services.auth_services_routes import auth_services_routes

# Initialize logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# Initialize the Flask app
app = Flask(__name__)

# Enable CORS
CORS(app)

# Register blueprint with the correct prefix
try:
    app.register_blueprint(auth_services_routes, url_prefix='/api/auth')
    logger.info("Blueprint 'auth_services_routes' registered successfully.")
except Exception as e:
    logger.error(f"Error registering blueprint: {e}")

# Main entry point to run the server
if __name__ == "__main__":
    try:
        debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
        port = int(os.getenv("PORT", 5000))
        logger.info("Starting Flask server...")
        app.run(debug=debug_mode, host='0.0.0.0', port=port)
    except Exception as e:
        logger.error(f"Failed to start Flask server: {e}")
