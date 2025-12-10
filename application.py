"""
WSGI entrypoint shim for Elastic Beanstalk.

Some Beanstalk Python platform versions look for an ``application`` module by
default even when a Procfile is present. Import the Flask app from our main
module and expose it as ``application`` so either startup path works.
"""

from main import app as application

if __name__ == "__main__":
    application.run(host="0.0.0.0", port=8000)
