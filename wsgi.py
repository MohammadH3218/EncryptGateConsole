import logging
from main import app

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('/var/log/encryptgate/wsgi.log')
    ]
)

try:
    # This will be used by Gunicorn
    application = app
except Exception as e:
    logging.error(f"Error initializing WSGI application: {e}")
    raise

if __name__ == "__main__":
    try:
        app.run(host='0.0.0.0', port=5000)
    except Exception as e:
        logging.error(f"Failed to run application: {e}")
        raise