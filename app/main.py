import logging
from flask import Flask
from flask_cors import CORS
from services.auth_services_routes import auth_services_routes  # Updated import path

# Initialize logger
logging.basicConfig(level=logging.INFO)
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
    logger.info("Starting Flask server...")
    app.run(debug=True, host='0.0.0.0', port=5000)
