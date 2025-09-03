// app/api/admin/init-tables/route.ts - Initialize required DynamoDB tables
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ORG_ID = process.env.ORGANIZATION_ID!;

const ddb = new DynamoDBClient({ region: REGION });

interface TableDefinition {
  TableName: string;
  KeySchema: any[];
  AttributeDefinitions: any[];
  BillingMode: string;
}

const REQUIRED_TABLES: TableDefinition[] = [
  {
    TableName: 'SecurityRoles',
    KeySchema: [
      { AttributeName: 'orgId', KeyType: 'HASH' },
      { AttributeName: 'roleId', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'orgId', AttributeType: 'S' },
      { AttributeName: 'roleId', AttributeType: 'S' }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: 'SecurityUserRoles',
    KeySchema: [
      { AttributeName: 'orgId', KeyType: 'HASH' },
      { AttributeName: 'userId', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'orgId', AttributeType: 'S' },
      { AttributeName: 'userId', AttributeType: 'S' }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: 'UserInvitations',
    KeySchema: [
      { AttributeName: 'orgId', KeyType: 'HASH' },
      { AttributeName: 'invitationId', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'orgId', AttributeType: 'S' },
      { AttributeName: 'invitationId', AttributeType: 'S' }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  }
];

// Check if table exists
async function tableExists(tableName: string): Promise<boolean> {
  try {
    await ddb.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      return false;
    }
    throw error;
  }
}

// Create table if it doesn't exist
async function createTableIfNotExists(tableDefinition: TableDefinition): Promise<{ created: boolean, status: string }> {
  const exists = await tableExists(tableDefinition.TableName);
  
  if (exists) {
    return { created: false, status: 'already_exists' };
  }

  try {
    await ddb.send(new CreateTableCommand(tableDefinition));
    return { created: true, status: 'created' };
  } catch (error: any) {
    console.error(`Failed to create table ${tableDefinition.TableName}:`, error);
    return { created: false, status: `error: ${error.message}` };
  }
}

// POST: Initialize all required tables
export async function POST() {
  try {
    console.log('🚀 Starting table initialization...');
    
    const results: Record<string, any> = {};
    
    for (const tableDefinition of REQUIRED_TABLES) {
      console.log(`📋 Processing table: ${tableDefinition.TableName}`);
      const result = await createTableIfNotExists(tableDefinition);
      results[tableDefinition.TableName] = result;
      console.log(`✅ ${tableDefinition.TableName}: ${result.status}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Table initialization completed',
      results,
      organizationId: ORG_ID
    });

  } catch (error: any) {
    console.error('❌ Error during table initialization:', error);
    return NextResponse.json(
      { 
        error: 'Failed to initialize tables',
        details: error.message,
        organizationId: ORG_ID
      },
      { status: 500 }
    );
  }
}

// GET: Check table status
export async function GET() {
  try {
    const tableStatuses: Record<string, string> = {};
    
    for (const tableDefinition of REQUIRED_TABLES) {
      try {
        const exists = await tableExists(tableDefinition.TableName);
        tableStatuses[tableDefinition.TableName] = exists ? 'exists' : 'missing';
      } catch (error: any) {
        tableStatuses[tableDefinition.TableName] = `error: ${error.message}`;
      }
    }

    return NextResponse.json({
      success: true,
      organizationId: ORG_ID,
      tableStatuses,
      region: REGION
    });

  } catch (error: any) {
    console.error('❌ Error checking table status:', error);
    return NextResponse.json(
      { 
        error: 'Failed to check table status',
        details: error.message
      },
      { status: 500 }
    );
  }
}