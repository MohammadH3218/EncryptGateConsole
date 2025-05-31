import os
import sys

# Add the current directory to sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

# Import the Flask app
from main import app as application

# When you run `python wsgi.py` directly, pick up PORT from the environment if present;
# otherwise default to 8000 (so that EB’s Nginx → Gunicorn proxy will work).
if __name__ == "__main__":
    # EB will set PORT=8000 internally; your local dev can override via:
    port = int(os.environ.get("PORT", "8000"))
    application.run(host="0.0.0.0", port=port)