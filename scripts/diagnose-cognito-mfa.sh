#!/bin/bash

# Script to diagnose Cognito MFA setup issues
# Usage: ./diagnose-cognito-mfa.sh <user-pool-id> <region> [username1] [username2]

USER_POOL_ID="${1:-us-east-1_kpXZ426n8}"
REGION="${2:-us-east-1}"
USER1="${3:-mohammadh@encryptgate.net}"
USER2="${4:-contact@encryptgate.net}"

echo "========================================="
echo "Cognito MFA Diagnostic Script"
echo "========================================="
echo "User Pool ID: $USER_POOL_ID"
echo "Region: $REGION"
echo ""

# 1. Check User Pool MFA Configuration
echo "1. Checking User Pool MFA Configuration..."
echo "-------------------------------------------"
aws cognito-idp describe-user-pool \
  --user-pool-id "$USER_POOL_ID" \
  --region "$REGION" \
  --query 'UserPool.{MfaConfiguration: MfaConfiguration, SoftwareTokenMfaConfiguration: SoftwareTokenMfaConfiguration}' \
  --output json

echo ""
echo "2. Checking User Pool MFA Settings (detailed)..."
echo "-------------------------------------------"
aws cognito-idp describe-user-pool \
  --user-pool-id "$USER_POOL_ID" \
  --region "$REGION" \
  --query 'UserPool.Policies.{PasswordPolicy: PasswordPolicy}' \
  --output json

echo ""
echo "3. Checking User Pool Attributes..."
echo "-------------------------------------------"
aws cognito-idp describe-user-pool \
  --user-pool-id "$USER_POOL_ID" \
  --region "$REGION" \
  --query 'UserPool.{SchemaAttributes: SchemaAttributes[*].{Name: Name, Required: Required, Mutable: Mutable}}' \
  --output json

echo ""
echo "4. Checking User 1 ($USER1)..."
echo "-------------------------------------------"
aws cognito-idp admin-get-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$USER1" \
  --region "$REGION" \
  --query '{Username: Username, UserStatus: UserStatus, Enabled: Enabled, MFAOptions: MFAOptions, UserAttributes: UserAttributes[?Name==`email_verified` || Name==`email`]}' \
  --output json

echo ""
echo "5. Checking User 1 MFA Preferences..."
echo "-------------------------------------------"
aws cognito-idp admin-get-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$USER1" \
  --region "$REGION" \
  --query '{Username: Username, MFAOptions: MFAOptions}' \
  --output json || echo "Could not get MFA preferences (user may need to be logged in)"

echo ""
echo "6. Checking User 2 ($USER2)..."
echo "-------------------------------------------"
aws cognito-idp admin-get-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$USER2" \
  --region "$REGION" \
  --query '{Username: Username, UserStatus: UserStatus, Enabled: Enabled, MFAOptions: MFAOptions, UserAttributes: UserAttributes[?Name==`email_verified` || Name==`email`]}' \
  --output json

echo ""
echo "7. Listing all MFA devices for User 1..."
echo "-------------------------------------------"
aws cognito-idp admin-list-devices \
  --user-pool-id "$USER_POOL_ID" \
  --username "$USER1" \
  --region "$REGION" \
  --output json || echo "No devices found or error retrieving devices"

echo ""
echo "8. Listing all MFA devices for User 2..."
echo "-------------------------------------------"
aws cognito-idp admin-list-devices \
  --user-pool-id "$USER_POOL_ID" \
  --username "$USER2" \
  --region "$REGION" \
  --output json || echo "No devices found or error retrieving devices"

echo ""
echo "9. Checking User Pool Client Settings..."
echo "-------------------------------------------"
# First, list all clients
CLIENT_IDS=$(aws cognito-idp list-user-pool-clients \
  --user-pool-id "$USER_POOL_ID" \
  --region "$REGION" \
  --query 'UserPoolClients[*].ClientId' \
  --output text)

echo "Client IDs found: $CLIENT_IDS"
echo ""

for CLIENT_ID in $CLIENT_IDS; do
  echo "Client: $CLIENT_ID"
  aws cognito-idp describe-user-pool-client \
    --user-pool-id "$USER_POOL_ID" \
    --client-id "$CLIENT_ID" \
    --region "$REGION" \
    --query '{ClientId: ClientId, ClientName: ClientName, GenerateSecret: GenerateSecret, ExplicitAuthFlows: ExplicitAuthFlows}' \
    --output json
  echo ""
done

echo "========================================="
echo "Diagnostic Complete"
echo "========================================="

