#!/bin/bash
#
# Create DynamoDB tables for VirusTotal result caching
#
# This script creates three DynamoDB tables to cache VT scan results:
# - VirusTotal_DomainCache (7 day TTL)
# - VirusTotal_FileCache (30 day TTL)
# - VirusTotal_URLCache (3 day TTL)
#
# NOTE: IP caching is NOT included as IPs change frequently for legitimate users
# (traveling, different networks, VPNs, mobile data)
#
# Usage: ./scripts/create-vt-cache-tables.sh [region]
#

set -e

REGION="${1:-us-east-1}"

echo "Creating VirusTotal cache tables in region: $REGION"
echo ""

# 1. Create Domain Cache Table
echo "Creating VirusTotal_DomainCache table..."
aws dynamodb create-table \
  --table-name VirusTotal_DomainCache \
  --attribute-definitions \
    AttributeName=domain,AttributeType=S \
  --key-schema \
    AttributeName=domain,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION" \
  --tags \
    Key=Application,Value=EncryptGate \
    Key=Component,Value=VirusTotalCache \
    Key=CacheType,Value=Domain

echo "✓ VirusTotal_DomainCache created"
echo ""

# 2. Create File Cache Table
echo "Creating VirusTotal_FileCache table..."
aws dynamodb create-table \
  --table-name VirusTotal_FileCache \
  --attribute-definitions \
    AttributeName=sha256,AttributeType=S \
  --key-schema \
    AttributeName=sha256,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION" \
  --tags \
    Key=Application,Value=EncryptGate \
    Key=Component,Value=VirusTotalCache \
    Key=CacheType,Value=File

echo "✓ VirusTotal_FileCache created"
echo ""

# 3. Create URL Cache Table
echo "Creating VirusTotal_URLCache table..."
aws dynamodb create-table \
  --table-name VirusTotal_URLCache \
  --attribute-definitions \
    AttributeName=urlKey,AttributeType=S \
  --key-schema \
    AttributeName=urlKey,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION" \
  --tags \
    Key=Application,Value=EncryptGate \
    Key=Component,Value=VirusTotalCache \
    Key=CacheType,Value=URL

echo "✓ VirusTotal_URLCache created"
echo ""

# Wait for tables to become active
echo "Waiting for tables to become active..."
aws dynamodb wait table-exists --table-name VirusTotal_DomainCache --region "$REGION"
aws dynamodb wait table-exists --table-name VirusTotal_FileCache --region "$REGION"
aws dynamodb wait table-exists --table-name VirusTotal_URLCache --region "$REGION"

echo "✓ All tables are active"
echo ""

# Enable TTL on all tables
echo "Enabling Time-To-Live (TTL) on cache tables..."

aws dynamodb update-time-to-live \
  --table-name VirusTotal_DomainCache \
  --time-to-live-specification "Enabled=true,AttributeName=expiresAt" \
  --region "$REGION"

echo "✓ TTL enabled on VirusTotal_DomainCache"

aws dynamodb update-time-to-live \
  --table-name VirusTotal_FileCache \
  --time-to-live-specification "Enabled=true,AttributeName=expiresAt" \
  --region "$REGION"

echo "✓ TTL enabled on VirusTotal_FileCache"

aws dynamodb update-time-to-live \
  --table-name VirusTotal_URLCache \
  --time-to-live-specification "Enabled=true,AttributeName=expiresAt" \
  --region "$REGION"

echo "✓ TTL enabled on VirusTotal_URLCache"
echo ""

# Display table information
echo "=== Cache Tables Summary ==="
echo ""
echo "Domain Cache:"
aws dynamodb describe-table --table-name VirusTotal_DomainCache --region "$REGION" --query 'Table.[TableName,TableStatus,ItemCount]' --output table

echo ""
echo "File Cache:"
aws dynamodb describe-table --table-name VirusTotal_FileCache --region "$REGION" --query 'Table.[TableName,TableStatus,ItemCount]' --output table

echo ""
echo "URL Cache:"
aws dynamodb describe-table --table-name VirusTotal_URLCache --region "$REGION" --query 'Table.[TableName,TableStatus,ItemCount]' --output table

echo ""
echo "✅ VirusTotal cache tables created successfully!"
echo ""
echo "Cache TTLs:"
echo "  - Domains: 7 days (reputation changes slowly)"
echo "  - Files: 30 days (file hashes never change)"
echo "  - URLs: 3 days (URLs can change but scan results are relatively stable)"
echo ""
echo "NOTE: IP caching is NOT used as IPs change frequently for legitimate users"
echo "      (traveling, different networks, VPNs, mobile data)"
echo ""
echo "Next steps:"
echo "  1. Ensure your Lambda/EC2 IAM role has DynamoDB permissions"
echo "  2. Deploy your updated application code"
echo "  3. Monitor cache hit rates with CloudWatch"
echo ""
