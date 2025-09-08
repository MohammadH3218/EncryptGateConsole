#!/bin/bash

# DynamoDB GSI Fix Script
# This script creates the missing Global Secondary Indexes (GSI) that your application needs

echo "🔧 Fixing DynamoDB GSI indexes..."
echo ""

# Set your AWS region (change if needed)
AWS_REGION=${AWS_REGION:-us-east-1}
echo "Using AWS Region: $AWS_REGION"
echo ""

# CloudServices table - GSI1 (orgId index)
echo "📋 Creating GSI1 for CloudServices table (orgId index)..."
aws dynamodb update-table \
  --region $AWS_REGION \
  --table-name CloudServices \
  --attribute-definitions \
    'AttributeName=orgId,AttributeType=S' \
  --global-secondary-index-updates '[
    {
      "Create": {
        "IndexName": "GSI1",
        "KeySchema": [
          {"AttributeName": "orgId", "KeyType": "HASH"}
        ],
        "Projection": {"ProjectionType": "ALL"},
        "BillingMode": "PAY_PER_REQUEST"
      }
    }
  ]' || echo "❌ Failed to create GSI1 for CloudServices (may already exist)"

echo ""

# SecurityTeamUsers table - byOrg GSI (for user queries by org)
echo "📋 Creating byOrg GSI for SecurityTeamUsers table..."
aws dynamodb update-table \
  --region $AWS_REGION \
  --table-name SecurityTeamUsers \
  --attribute-definitions \
    'AttributeName=orgId,AttributeType=S' \
  --global-secondary-index-updates '[
    {
      "Create": {
        "IndexName": "byOrg",
        "KeySchema": [
          {"AttributeName": "orgId", "KeyType": "HASH"}
        ],
        "Projection": {"ProjectionType": "ALL"},
        "BillingMode": "PAY_PER_REQUEST"
      }
    }
  ]' || echo "❌ Failed to create byOrg GSI for SecurityTeamUsers (may already exist)"

echo ""

# Emails table - byOrg GSI (if needed)
echo "📋 Creating byOrg GSI for Emails table..."
aws dynamodb update-table \
  --region $AWS_REGION \
  --table-name Emails \
  --attribute-definitions \
    'AttributeName=orgId,AttributeType=S' \
  --global-secondary-index-updates '[
    {
      "Create": {
        "IndexName": "byOrg",
        "KeySchema": [
          {"AttributeName": "orgId", "KeyType": "HASH"}
        ],
        "Projection": {"ProjectionType": "ALL"},
        "BillingMode": "PAY_PER_REQUEST"
      }
    }
  ]' || echo "❌ Failed to create byOrg GSI for Emails (may already exist)"

echo ""
echo "✅ GSI creation commands completed!"
echo ""
echo "⏳ Note: GSI creation can take several minutes. Check the AWS Console to monitor progress."
echo "   The application will work better once all GSIs are active."
echo ""
echo "🔍 To check GSI status:"
echo "   aws dynamodb describe-table --table-name CloudServices --query 'Table.GlobalSecondaryIndexes'"
echo "   aws dynamodb describe-table --table-name SecurityTeamUsers --query 'Table.GlobalSecondaryIndexes'"
echo "   aws dynamodb describe-table --table-name Emails --query 'Table.GlobalSecondaryIndexes'"