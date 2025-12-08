#!/usr/bin/env python3
"""
Diagnostic script to check DynamoDB tables for organization and Cognito configuration.
This helps debug "No Cognito configuration for org" errors.
"""
import os
import sys
import boto3
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get AWS credentials and region
AWS_REGION = os.getenv("AWS_REGION") or os.getenv("REGION", "us-east-1")
AWS_ACCESS_KEY_ID = os.getenv("ACCESS_KEY_ID") or os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("SECRET_ACCESS_KEY") or os.getenv("AWS_SECRET_ACCESS_KEY")
ORGANIZATIONS_TABLE = os.getenv("ORGANIZATIONS_TABLE_NAME") or "Organizations"
CLOUDSERVICES_TABLE = os.getenv("CLOUDSERVICES_TABLE_NAME") or os.getenv("CLOUDSERVICES_TABLE", "CloudServices")

# Create DynamoDB client
if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
    print(f"✅ Using explicit AWS credentials")
    dynamodb = boto3.resource(
        'dynamodb',
        region_name=AWS_REGION,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY
    )
    dynamodb_client = boto3.client(
        'dynamodb',
        region_name=AWS_REGION,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY
    )
else:
    print(f"⚠️  Using AWS credential provider chain (default)")
    dynamodb = boto3.resource('dynamodb', region_name=AWS_REGION)
    dynamodb_client = boto3.client('dynamodb', region_name=AWS_REGION)

print(f"\n📍 Region: {AWS_REGION}")
print(f"📊 Organizations Table: {ORGANIZATIONS_TABLE}")
print(f"☁️  CloudServices Table: {CLOUDSERVICES_TABLE}\n")

# 1. Scan Organizations table
print("=" * 80)
print("1. SCANNING ORGANIZATIONS TABLE")
print("=" * 80)
try:
    orgs_table = dynamodb.Table(ORGANIZATIONS_TABLE)
    response = orgs_table.scan(Limit=20)
    items = response.get('Items', [])
    
    print(f"Found {len(items)} organizations:\n")
    
    for idx, item in enumerate(items, 1):
        org_id = item.get('organizationId', 'N/A')
        name = item.get('name', 'N/A')
        org_code = item.get('orgCode', 'N/A')
        region = item.get('region', 'N/A')
        status = item.get('status', 'N/A')
        
        print(f"  [{idx}] Organization ID: {org_id}")
        print(f"      Name: {name}")
        print(f"      Code: {org_code}")
        print(f"      Region: {region}")
        print(f"      Status: {status}")
        print()
    
    if not items:
        print("  ⚠️  No organizations found in table!")
        
except Exception as e:
    print(f"  ❌ Error scanning Organizations table: {e}")
    print(f"     Error type: {type(e).__name__}")

# 2. Scan CloudServices table for Cognito configs
print("\n" + "=" * 80)
print("2. SCANNING CLOUDSERVICES TABLE FOR COGNITO CONFIGURATIONS")
print("=" * 80)
try:
    cs_table = dynamodb.Table(CLOUDSERVICES_TABLE)
    
    # Scan for all items (we'll filter for Cognito)
    response = cs_table.scan(Limit=50)
    items = response.get('Items', [])
    
    # Filter for Cognito-related service types
    cognito_aliases = {"cognito", "aws-cognito", "amazon-cognito"}
    cognito_items = []
    
    for item in items:
        service_type = item.get('serviceType', '').lower()
        if any(alias in service_type for alias in cognito_aliases):
            cognito_items.append(item)
    
    print(f"Found {len(cognito_items)} Cognito configurations:\n")
    
    for idx, item in enumerate(cognito_items, 1):
        org_id = item.get('orgId', 'N/A')
        service_type = item.get('serviceType', 'N/A')
        user_pool_id = item.get('userPoolId', 'N/A')
        client_id = item.get('clientId', 'N/A')
        client_secret = item.get('clientSecret', 'N/A')
        region = item.get('region', 'N/A')
        
        print(f"  [{idx}] Organization ID: {org_id}")
        print(f"      Service Type: {service_type}")
        print(f"      User Pool ID: {user_pool_id}")
        print(f"      Client ID: {client_id}")
        print(f"      Client Secret: {'***' if client_secret != 'N/A' else 'N/A'}")
        print(f"      Region: {region}")
        print()
    
    if not cognito_items:
        print("  ⚠️  No Cognito configurations found!")
        print(f"     Total items in CloudServices table: {len(items)}")
        if items:
            print(f"\n     Other service types found:")
            service_types = set(item.get('serviceType', 'N/A') for item in items)
            for st in sorted(service_types):
                count = sum(1 for item in items if item.get('serviceType') == st)
                print(f"       - {st}: {count} item(s)")
    
except Exception as e:
    print(f"  ❌ Error scanning CloudServices table: {e}")
    print(f"     Error type: {type(e).__name__}")

# 3. Cross-reference: Check if orgs have Cognito configs
print("\n" + "=" * 80)
print("3. CROSS-REFERENCE: ORGANIZATIONS vs COGNITO CONFIGS")
print("=" * 80)
try:
    # Get all org IDs
    orgs_table = dynamodb.Table(ORGANIZATIONS_TABLE)
    orgs_response = orgs_table.scan(ProjectionExpression="organizationId")
    org_ids = {item.get('organizationId') for item in orgs_response.get('Items', [])}
    
    # Get all Cognito config org IDs
    cs_table = dynamodb.Table(CLOUDSERVICES_TABLE)
    cs_response = cs_table.scan(ProjectionExpression="orgId, serviceType")
    cognito_org_ids = set()
    
    for item in cs_response.get('Items', []):
        service_type = item.get('serviceType', '').lower()
        if any(alias in service_type for alias in cognito_aliases):
            org_id = item.get('orgId')
            if org_id:
                cognito_org_ids.add(org_id)
    
    print(f"Organizations in Organizations table: {len(org_ids)}")
    print(f"Organizations with Cognito configs: {len(cognito_org_ids)}")
    print()
    
    # Find missing configs
    missing_configs = org_ids - cognito_org_ids
    if missing_configs:
        print(f"⚠️  Organizations WITHOUT Cognito configuration ({len(missing_configs)}):")
        for org_id in sorted(missing_configs):
            print(f"     - {org_id}")
    else:
        print("✅ All organizations have Cognito configurations!")
    
    # Find orphaned configs
    orphaned_configs = cognito_org_ids - org_ids
    if orphaned_configs:
        print(f"\n⚠️  Cognito configs for organizations NOT in Organizations table ({len(orphaned_configs)}):")
        for org_id in sorted(orphaned_configs):
            print(f"     - {org_id}")
    
except Exception as e:
    print(f"  ❌ Error during cross-reference: {e}")
    print(f"     Error type: {type(e).__name__}")

# 4. Test lookup for a specific org (if provided)
if len(sys.argv) > 1:
    test_org_id = sys.argv[1]
    print("\n" + "=" * 80)
    print(f"4. TESTING LOOKUP FOR ORG: {test_org_id}")
    print("=" * 80)
    
    try:
        # Try GSI1 query
        cs_table = dynamodb.Table(CLOUDSERVICES_TABLE)
        from boto3.dynamodb.conditions import Key
        
        try:
            response = cs_table.query(
                IndexName="GSI1",
                KeyConditionExpression=Key("orgId").eq(test_org_id),
                Limit=10
            )
            items = response.get('Items', [])
            print(f"GSI1 query returned {len(items)} items")
            
            for item in items:
                print(f"  - serviceType: {item.get('serviceType')}")
                print(f"    userPoolId: {item.get('userPoolId')}")
                print(f"    clientId: {item.get('clientId')}")
        except Exception as e:
            print(f"GSI1 query failed: {e}")
        
        # Try scan
        from boto3.dynamodb.conditions import Attr
        response = cs_table.scan(
            FilterExpression=Attr("orgId").eq(test_org_id) & Attr("serviceType").contains("cognito"),
            Limit=10
        )
        items = response.get('Items', [])
        print(f"\nScan with filter returned {len(items)} items")
        
    except Exception as e:
        print(f"  ❌ Error testing lookup: {e}")

print("\n" + "=" * 80)
print("✅ Diagnostic complete!")
print("=" * 80)

