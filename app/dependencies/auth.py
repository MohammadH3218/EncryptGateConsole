from flask import request, jsonify
import os
import boto3
import json
import logging
import time
from jose import jwt, jwk, JWTError
import requests
from botocore.exceptions import ClientError

# Enhanced logging for debugging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Cognito configuration
COGNITO_REGION = os.getenv("REGION", "us-east-1")
USER_POOL_ID = os.getenv("COGNITO_USERPOOL_ID")
CLIENT_ID = os.getenv("COGNITO_CLIENT_ID")
JWT_ISSUER = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{USER_POOL_ID}"

# Initialize Cognito client
cognito_client = boto3.client("cognito-idp", region_name=COGNITO_REGION)

# Cache for JWKs to avoid fetching on every request
jwks_cache = {
    "keys": {},
    "expiry": 0  # Unix timestamp when cache expires
}

def get_cognito_jwks():
    """
    Retrieve and cache the JWKs from Cognito
    """
    global jwks_cache
    
    # Check if cache is valid
    current_time = time.time()
    if jwks_cache["expiry"] > current_time and jwks_cache["keys"]:
        logger.info("Using cached JWKs")
        return jwks_cache["keys"]
    
    # Cache expired or empty, fetch new JWKs
    jwks_url = f"{JWT_ISSUER}/.well-known/jwks.json"
    
    try:
        logger.info(f"Fetching JWKs from {jwks_url}")
        response = requests.get(jwks_url)
        response.raise_for_status()
        
        jwks = response.json()
        
        # Convert to dictionary by kid for easier lookup
        keys = {}
        for key in jwks.get("keys", []):
            kid = key.get("kid")
            if kid:
                keys[kid] = key
        
        # Cache for 12 hours
        jwks_cache = {
            "keys": keys,
            "expiry": current_time + (12 * 60 * 60)  # 12 hours
        }
        
        logger.info(f"JWKs refreshed, cached {len(keys)} keys")
        return keys
    except Exception as e:
        logger.error(f"Failed to retrieve Cognito JWKs: {str(e)}")
        # Return empty cache if available, otherwise empty dict
        return jwks_cache.get("keys", {})

def decode_jwt_token(token):
    """
    Decode and verify a JWT token using Cognito's public keys
    """
    if not token:
        raise ValueError("Token is required")
    
    try:
        # Get token headers without verification
        headers = jwt.get_unverified_headers(token)
        kid = headers.get("kid")
        
        if not kid:
            logger.error("No 'kid' in token headers")
            raise ValueError("Invalid token format: missing 'kid' in headers")
        
        # Get the JWK for this specific kid
        jwks = get_cognito_jwks()
        key_data = jwks.get(kid)
        
        if not key_data:
            logger.error(f"No JWK found for kid: {kid}")
            raise ValueError(f"No key found for the specified 'kid': {kid}")
        
        # Convert JWK to PEM format
        public_key = jwk.construct(key_data)
        
        # Decode and verify the token
        payload = jwt.decode(
            token,
            public_key.to_pem().decode("utf-8"),
            algorithms=[key_data.get("alg", "RS256")],
            audience=CLIENT_ID,
            issuer=JWT_ISSUER,
            options={"verify_exp": True}
        )
        
        logger.info(f"Token verified for user: {payload.get('username', payload.get('sub', 'unknown'))}")
        return payload
    except JWTError as e:
        logger.error(f"JWT verification failed: {str(e)}")
        raise ValueError(f"Token verification failed: {str(e)}")
    except Exception as e:
        logger.error(f"Error decoding token: {str(e)}")
        raise ValueError(f"Failed to decode token: {str(e)}")

def get_current_user():
    """
    Get current user from JWT token in Authorization header
    """
    auth_header = request.headers.get("Authorization", "")
    
    if not auth_header:
        logger.warning("No Authorization header provided")
        return jsonify({"detail": "Authorization header is missing"}), 401
    
    # Extract token from 'Bearer <token>'
    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        logger.warning("Malformed Authorization header")
        return jsonify({"detail": "Invalid Authorization header format"}), 401
    
    token = parts[1]
    
    try:
        # Decode and verify token
        payload = decode_jwt_token(token)
        
        # Extract user info
        # For Cognito tokens, 'sub' is the user ID and 'cognito:groups' may contain roles
        user_id = payload.get("sub")
        username = payload.get("username", payload.get("cognito:username", ""))
        groups = payload.get("cognito:groups", [])
        
        # Determine role from groups or custom attributes
        role = "user"  # Default role
        if "admin" in groups:
            role = "admin"
        elif "employee" in groups:
            role = "employee"
        
        return {"user_id": user_id, "username": username, "role": role, "groups": groups}
    except ValueError as e:
        logger.warning(f"Auth error: {str(e)}")
        return jsonify({"detail": str(e)}), 401
    except Exception as e:
        logger.error(f"Unexpected auth error: {str(e)}")
        return jsonify({"detail": "Authentication error"}), 401

def require_auth(roles=None):
    """
    Decorator for routes that require authentication
    
    Args:
        roles (list): List of allowed roles. If None, any authenticated user is allowed.
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            # Get user info
            user_info = get_current_user()
            
            # Check if it's an error response
            if isinstance(user_info, tuple):
                return user_info
            
            # Check role if specified
            if roles and user_info.get("role") not in roles:
                return jsonify({"detail": "Insufficient permissions"}), 403
            
            # Add user info to kwargs
            kwargs["user_info"] = user_info
            
            # Call the original function
            return func(*args, **kwargs)
        
        # Preserve function metadata
        wrapper.__name__ = func.__name__
        return wrapper
    
    return decorator

def verify_admin_token(token):
    """
    Special function to verify admin tokens for sensitive operations
    """
    try:
        payload = decode_jwt_token(token)
        groups = payload.get("cognito:groups", [])
        
        if "admin" not in groups:
            return False, "Token is not authorized for admin operations"
        
        return True, payload
    except Exception as e:
        return False, str(e)