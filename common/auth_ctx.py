"""
Auth Context Helper - Standardized org and role resolution for all protected routes
"""
from flask import request, jsonify
import jwt
import logging

logger = logging.getLogger(__name__)

def get_auth_ctx(required: bool = True):
    """
    Extract orgId + roles from Authorization: Bearer <idToken>|<accessToken>
    Returns: (ctx_dict, error_response, error_status)
    """
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        if required:
            logger.warning("Missing Bearer token in Authorization header")
            return None, jsonify({"ok": False, "error": "missing_bearer"}), 401
        return None, None, None

    token = auth.replace("Bearer ", "").strip()
    try:
        # NOTE: For production, verify signature & issuer; here we decode unverified claims
        # This works for development but should be replaced with proper verification
        claims = jwt.decode(token, options={"verify_signature": False})
        logger.debug(f"Decoded token claims: {list(claims.keys())}")
    except Exception as e:
        logger.warning(f"Invalid token format: {e}")
        if required:
            return None, jsonify({"ok": False, "error": "invalid_token"}), 401
        return None, None, None

    # Extract organization ID from multiple possible locations
    org_id = (
        claims.get("custom:orgId") or 
        claims.get("orgId") or 
        request.headers.get("x-org-id") or 
        request.args.get("orgId")
    )
    
    # Extract roles from Cognito groups or custom claims
    roles = claims.get("cognito:groups") or claims.get("roles") or []
    if isinstance(roles, str):
        roles = [roles]  # Normalize single role to list
    
    # Build context
    ctx = {
        "orgId": org_id,
        "roles": roles,
        "sub": claims.get("sub"),
        "username": claims.get("cognito:username") or claims.get("email"),
        "email": claims.get("email"),
        "token_claims": claims
    }
    
    # Validate required org
    if required and not org_id:
        logger.warning(f"Missing orgId in token claims and headers for user {ctx['username']}")
        return None, jsonify({"ok": False, "error": "missing_org", "message": "Organization ID not found in token or headers"}), 400
    
    logger.info(f"Auth context resolved - user: {ctx['username']}, org: {org_id}, roles: {roles}")
    return ctx, None, None


def has_role(user_roles, allowed_roles):
    """
    Check if user has any of the allowed roles
    Args:
        user_roles: List of user's roles
        allowed_roles: Set or list of allowed roles
    Returns:
        bool: True if user has at least one allowed role
    """
    if not user_roles:
        return False
    
    user_roles_set = set(user_roles) if isinstance(user_roles, list) else {user_roles}
    allowed_roles_set = set(allowed_roles) if not isinstance(allowed_roles, set) else allowed_roles
    
    return bool(user_roles_set.intersection(allowed_roles_set))


def require_role(allowed_roles):
    """
    Decorator to require specific roles for a route
    Usage: @require_role(["Admin", "Owner"])
    """
    def decorator(f):
        def wrapper(*args, **kwargs):
            ctx, err_resp, err_status = get_auth_ctx(required=True)
            if err_resp:
                return err_resp, err_status
            
            if not has_role(ctx["roles"], allowed_roles):
                logger.warning(f"Access denied - user {ctx['username']} with roles {ctx['roles']} needs one of {allowed_roles}")
                return jsonify({"ok": False, "error": "forbidden", "message": "Insufficient permissions"}), 403
            
            # Add context to request for use in route
            request.auth_ctx = ctx
            return f(*args, **kwargs)
        
        wrapper.__name__ = f.__name__
        return wrapper
    return decorator