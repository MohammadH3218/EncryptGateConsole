export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';

const ORG_ID = process.env.ORGANIZATION_ID || 'default-org';
const EMPLOYEES_TABLE = process.env.EMPLOYEES_TABLE_NAME || 'Employees';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

const ddb = new DynamoDBClient({ region: AWS_REGION });

export async function GET() {
  try {
    console.log('🔍 DEBUG: Fetching monitored employees...');
    console.log('🔍 DEBUG: Using config:', { ORG_ID, EMPLOYEES_TABLE, AWS_REGION });
    
    const resp = await ddb.send(new QueryCommand({
      TableName: EMPLOYEES_TABLE,
      KeyConditionExpression: 'orgId = :orgId',
      ExpressionAttributeValues: {
        ':orgId': { S: ORG_ID }
      }
    }));
    
    const employees = (resp.Items || []).map(item => ({
      email: item.email?.S || 'unknown',
      name: item.name?.S || 'unknown',
      status: item.status?.S || 'unknown'
    }));
    
    console.log('🔍 DEBUG: Found employees:', employees);
    
    
    return NextResponse.json({
      status: 'debug-success',
      config: { ORG_ID, EMPLOYEES_TABLE, AWS_REGION },
      totalEmployees: employees.length,
      employees,
      timestamp: new Date().toISOString()
    });
    
  } catch (err: any) {
    console.error('🔍 DEBUG: Error:', err);
    return NextResponse.json({
      error: 'Failed to fetch employees',
      message: err.message,
      config: { ORG_ID, EMPLOYEES_TABLE, AWS_REGION }
    }, { status: 500 });
  }
}