"""
Role-Based Access Control (RBAC) Helper
Normalizes permissions across Cognito groups and DB roles
"""
import logging

logger = logging.getLogger(__name__)

# Default permissions for each role
DEFAULT_ROLE_PERMS = {
    "Owner": ["*"],  # Full access to everything
    "Admin": ["*"],  # Full access to everything  
    "SecurityAnalyst": [
        "detections.read", "detections.update", "detections.create",
        "assignments.read", "assignments.update", "assignments.create",
        "team.read", "investigations.read", "investigations.update",
        "blocked_emails.read", "blocked_emails.create",
        "pushed_requests.read", "pushed_requests.create"
    ],
    "SecurityViewer": [
        "detections.read", "assignments.read", "team.read", 
        "investigations.read", "blocked_emails.read", "pushed_requests.read"
    ],
    "Analyst": [
        "detections.read", "detections.update", 
        "assignments.read", "assignments.update",
        "team.read", "investigations.read", "investigations.update"
    ],
    "Viewer": [
        "detections.read", "assignments.read", "team.read", "investigations.read"
    ]
}

def expand_roles(claim_roles=None, db_roles=None):
    """
    Combine Cognito groups & DB roles; resolve to a deduped set of permissions.
    
    Args:
        claim_roles: List of roles from JWT token (Cognito groups)
        db_roles: List of roles from database
        
    Returns:
        tuple: (set of all roles, set of all permissions)
    """
    all_roles = set((claim_roles or []) + (db_roles or []))
    all_permissions = set()
    
    for role in all_roles:
        role_perms = DEFAULT_ROLE_PERMS.get(role, [])
        for perm in role_perms:
            all_permissions.add(perm)
            
    logger.debug(f"Expanded roles {list(all_roles)} to permissions {list(all_permissions)}")
    return all_roles, all_permissions


def can(user_permissions, required_permission):
    """
    Check if user has the required permission
    
    Args:
        user_permissions: List or set of user's permissions
        required_permission: Single permission string or list of permissions (all required)
        
    Returns:
        bool: True if user has permission(s)
    """
    if not user_permissions:
        return False
        
    user_perms_set = set(user_permissions) if isinstance(user_permissions, list) else user_permissions
    
    # Check for wildcard permission (Admin/Owner)
    if "*" in user_perms_set:
        return True
        
    # Handle single permission
    if isinstance(required_permission, str):
        return required_permission in user_perms_set
        
    # Handle multiple permissions (all required)
    if isinstance(required_permission, list):
        return all(perm in user_perms_set for perm in required_permission)
        
    return False


def can_any(user_permissions, required_permissions):
    """
    Check if user has ANY of the required permissions
    
    Args:
        user_permissions: List or set of user's permissions
        required_permissions: List of permissions (any one is sufficient)
        
    Returns:
        bool: True if user has at least one permission
    """
    if not user_permissions or not required_permissions:
        return False
        
    user_perms_set = set(user_permissions) if isinstance(user_permissions, list) else user_permissions
    
    # Check for wildcard permission (Admin/Owner)
    if "*" in user_perms_set:
        return True
        
    # Check if user has any of the required permissions
    return any(perm in user_perms_set for perm in required_permissions)


def get_user_context_with_permissions(auth_ctx, db_roles=None):
    """
    Enhance auth context with expanded permissions
    
    Args:
        auth_ctx: Auth context from get_auth_ctx()
        db_roles: Optional additional roles from database
        
    Returns:
        dict: Enhanced context with roles and permissions
    """
    claim_roles = auth_ctx.get("roles", [])
    expanded_roles, expanded_permissions = expand_roles(claim_roles, db_roles)
    
    return {
        **auth_ctx,
        "effective_roles": list(expanded_roles),
        "permissions": list(expanded_permissions),
        "is_admin": can(expanded_permissions, "*"),
        "is_owner": "Owner" in expanded_roles
    }