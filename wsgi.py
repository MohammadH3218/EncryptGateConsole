import os
import sys

# Add the current directory to sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

# Import the Flask app
from main import app as application

# This is what Elastic Beanstalk looks for by default
if __name__ == "__main__":
    application.run(host='0.0.0.0', port=8080)