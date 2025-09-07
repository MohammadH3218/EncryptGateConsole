# Environment Variables Cleanup Guide

After implementing org-aware authentication, the following environment variables can be removed from your deployment (Elastic Beanstalk, etc.):

## ✅ Can Be Removed (Now handled per-org in DynamoDB)

### Cognito-specific Variables
- `COGNITO_CLIENT_ID` - Now stored in CloudServices table per org
- `COGNITO_CLIENT_SECRET` - No longer needed with PKCE flow  
- `COGNITO_USERPOOL_ID` - Now stored in CloudServices table per org
- `COGNITO_REDIRECT_URI` - Now stored in CloudServices table per org
- `COGNITO_LOGOUT_URI` - Now stored in CloudServices table per org

### Organization-specific Variables  
- `ORGANIZATION_ID` - Now determined dynamically per org
- `ACCESS_KEY_ID` - Raw AWS credentials no longer passed from browser
- `SECRET_ACCESS_KEY` - Raw AWS credentials no longer passed from browser

## ⚠️ Keep These Variables

### Core AWS Configuration
- `AWS_REGION` (or `REGION`) - Still needed for DynamoDB client
- `CLOUDSERVICES_TABLE` (or `CLOUDSERVICES_TABLE_NAME`) - Table for org configs  
- `ORGANIZATIONS_TABLE` (or `ORGANIZATIONS_TABLE_NAME`) - Table for org metadata

### Application Configuration
- `CORS_ORIGINS` - Still needed for API CORS
- `NEXT_PUBLIC_API_URL` - Still used for legacy auth and API calls
- `BASE_URL` - Used for email notifications and webhooks

### Other Service Tables
- `EMAILS_TABLE_NAME` 
- `DETECTIONS_TABLE_NAME`
- `EMPLOYEES_TABLE_NAME`
- `USERS_TABLE_NAME` 
- `ROLES_TABLE_NAME`
- `INVESTIGATIONS_TABLE_NAME`

### External APIs
- `OPENAI_API_KEY` (or split `OPENAI_API_KEY_P1` + `OPENAI_API_KEY_P2`)
- `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` (if using Neo4j)
- `JWT_SECRET` (for user profile service)

## 🔧 How The New System Works

1. **Organization Setup**: Users create orgs via `/setup-organization` which stores Cognito config in CloudServices table
2. **Login Flow**: Users visit `/o/{orgId}/login` which loads org config from DynamoDB  
3. **Authentication**: Uses PKCE flow (no client secrets needed) with org-specific Cognito pools
4. **Security**: Cookies are httpOnly, secure, sameSite=lax with proper expiration
5. **Routing**: Middleware enforces org-aware paths and redirects appropriately

## 🚀 Migration Steps

1. **Test the new flow** with a sample organization
2. **Remove the old environment variables** from your Beanstalk configuration
3. **Update any hardcoded references** to use org-aware URLs
4. **Update documentation** to reflect the new multi-tenant setup

## 🔍 Remaining Issues to Address

1. Many API endpoints still use hardcoded `process.env.ORGANIZATION_ID` - these should be updated to extract orgId from request context
2. The legacy login page at `/login` still exists for backward compatibility but should eventually redirect to org-specific login
3. Consider implementing subdomain routing (e.g., `org1.console-encryptgate.net`) instead of path-based routing

## 📝 Benefits After Cleanup

- ✅ **Multi-tenant ready**: Each org has its own Cognito pool
- ✅ **Secure**: No client secrets, PKCE flow, hardened cookies  
- ✅ **Scalable**: No more hardcoded org configs in environment
- ✅ **Self-service**: Orgs can set up themselves via setup flow
- ✅ **Production ready**: Proper error handling and state management