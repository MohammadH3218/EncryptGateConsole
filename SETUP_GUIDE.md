# EncryptGate Organization Setup Guide

## 🚀 Complete Organization Setup Flow

The enhanced EncryptGate platform now includes a comprehensive organization setup flow that integrates with AWS services for enterprise-grade security management.

## 📋 Cloud Infrastructure Requirements

### AWS Services Required

1. **Amazon DynamoDB Tables**
   ```
   - Organizations (Primary Key: organizationId)
   - CloudServices (Composite Key: orgId, serviceType) 
   - SecurityTeamUsers (Composite Key: orgId, email)
   - Employees, Emails, Detections, Investigations (existing)
   ```

2. **Amazon Cognito User Pool**
   - User pool with configured client
   - Groups for role-based access
   - Email/username sign-in enabled

### Required DynamoDB Table Schema

#### Organizations Table
```javascript
{
  "organizationId": "String", // Primary Key (org_xxxxxxxxxxxxxx)
  "name": "String",          // Organization display name
  "status": "String",        // active, suspended, etc.
  "createdAt": "String",     // ISO timestamp
  "createdBy": "String",     // Admin email who created org
  "adminEmail": "String",    // Primary admin email
  "adminName": "String",     // Primary admin name
  "userPoolId": "String",    // Associated Cognito User Pool ID
  "region": "String"         // AWS region
}
```

### Required IAM Permissions

The setup process requires an AWS IAM user/role with these permissions:

#### Cognito Permissions
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cognito-idp:DescribeUserPool",
        "cognito-idp:ListUsers",
        "cognito-idp:AdminGetUser",
        "cognito-idp:AdminCreateUser",
        "cognito-idp:AdminAddUserToGroup",
        "cognito-idp:AdminRemoveUserFromGroup",
        "cognito-idp:CreateGroup",
        "cognito-idp:AdminSetUserPassword",
        "cognito-idp:AdminSetUserMFAPreference"
      ],
      "Resource": "arn:aws:cognito-idp:*:*:userpool/*"
    }
  ]
}
```

#### DynamoDB Permissions
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/Organizations",
        "arn:aws:dynamodb:*:*:table/CloudServices",
        "arn:aws:dynamodb:*:*:table/SecurityTeamUsers"
      ]
    }
  ]
}
```

## 🔧 Environment Variables Setup

Add these to your `.env.local` file:

```env
# DynamoDB Tables
ORGANIZATIONS_TABLE_NAME=Organizations
CLOUDSERVICES_TABLE_NAME=CloudServices
USERS_TABLE_NAME=SecurityTeamUsers

# Default AWS Region
AWS_REGION=us-east-1

# Application URLs
NEXT_PUBLIC_API_URL=https://api.console-encryptgate.net
NEXT_PUBLIC_APP_URL=https://console-encryptgate.net
```

## 🛠️ Setup Flow Overview

### Step 1: Landing Page
- User visits root URL (`/`)
- Enters organization details
- Redirected to comprehensive setup flow

### Step 2: AWS Configuration
- Enter AWS Cognito User Pool details
- Provide IAM credentials with required permissions
- System validates configuration and lists existing users
- Shows required IAM permissions for reference

### Step 3: Admin Selection
- Lists all users from connected Cognito pool
- User selects which Cognito user becomes organization admin
- Selected user automatically assigned "Owner" role

### Step 4: Organization Creation
- Creates organization record in database
- Sets up role groups in Cognito (Owner, Admin, Analyst, etc.)
- Adds admin user to Owner group
- Stores AWS configuration as connected service
- Redirects to login page

### Step 5: Multi-Tenant Login
- User logs in with their Cognito credentials
- System auto-detects organization membership
- Role-based dashboard access granted
- Navigation filtered based on user permissions

## 🎯 User Flow Examples

### First Organization Setup
1. **Administrator** visits `console-encryptgate.net`
2. Fills organization creation form
3. Goes through AWS setup with their credentials
4. Selects themselves as admin from Cognito users
5. Organization created, redirected to login
6. Logs in with Cognito and gets full Owner access

### Subsequent User Onboarding
1. **Owner/Admin** adds user to Cognito User Pool via AWS Console
2. **New User** visits `console-encryptgate.net/login`
3. Logs in with Cognito credentials
4. System auto-registers them with "Viewer" role
5. Gets role-appropriate dashboard access

### Role Management
1. **Admin** goes to Roles & Permissions page
2. Changes user role from "Viewer" to "Security Analyst"
3. UI immediately updates to show analyst-level features
4. User sees expanded navigation and permissions

## 🚨 Security Considerations

### Organization Isolation
- Each organization has separate data namespacing
- Users can only access their organization's data
- API endpoints validate organization membership

### Role-Based Access Control
- Navigation dynamically filters based on permissions
- API endpoints enforce role-based access
- Sensitive operations require elevated roles

### AWS Integration Security
- AWS credentials encrypted in transit and at rest
- IAM permissions follow least-privilege principle
- Cognito handles all authentication/authorization

## 🔄 Multi-Tenant Architecture

### Current Implementation
- **Single-tenant**: All users share same organization context
- **Default org ID**: `default-org` used for existing data
- **Backward compatible**: Existing users continue to work

### Future Multi-Tenant Ready
- Organization context stored in user sessions
- Database queries filtered by organization ID
- API endpoints organization-aware
- Easy to expand to full multi-tenancy

## 📊 Monitoring & Analytics

The setup process logs key metrics:
- Organization creation success/failure rates
- AWS validation errors and resolutions
- User role assignments and changes
- Login patterns by organization

## 🆘 Troubleshooting

### Common Issues

1. **AWS Validation Fails**
   - Check IAM permissions match requirements exactly
   - Verify User Pool ID format: `us-east-1_xxxxxxxxx`
   - Ensure AWS region matches User Pool region

2. **No Users Found in Cognito**
   - Create users in AWS Cognito Console first
   - Verify users have email addresses
   - Check user status (CONFIRMED vs UNCONFIRMED)

3. **Role Assignment Not Working**
   - Verify Cognito groups were created successfully
   - Check user group membership in AWS Console
   - Confirm DynamoDB user records have correct roles

4. **Login Redirects to Setup**
   - Check `organization_id` in localStorage
   - Verify user exists in SecurityTeamUsers table
   - Confirm Cognito user has group membership

## 🎉 Success Metrics

After successful setup:
- ✅ Organization visible in sidebar
- ✅ Admin has Owner role with full access
- ✅ Role-based navigation working
- ✅ User management functional
- ✅ AWS services connected and validated

---

This comprehensive setup flow provides enterprise-grade onboarding while maintaining security and user experience standards.