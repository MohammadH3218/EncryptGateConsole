// app/api/debug/route.ts - Debug API configuration
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';

export async function GET() {
  try {
    const envVars = {
      AWS_REGION: process.env.AWS_REGION || 'not_set',
      ORGANIZATION_ID: process.env.ORGANIZATION_ID ? 'set' : 'not_set',
      USERS_TABLE_NAME: process.env.USERS_TABLE_NAME || 'not_set',
      ROLES_TABLE_NAME: process.env.ROLES_TABLE_NAME || 'not_set',
      USER_ROLES_TABLE_NAME: process.env.USER_ROLES_TABLE_NAME || 'not_set',
      INVITATIONS_TABLE_NAME: process.env.INVITATIONS_TABLE_NAME || 'not_set',
      CLOUDSERVICES_TABLE_NAME: process.env.CLOUDSERVICES_TABLE_NAME || 'not_set'
    };

    // Test DynamoDB connection
    const ddb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
    
    try {
      const tablesResult = await ddb.send(new ListTablesCommand({}));
      const existingTables = tablesResult.TableNames || [];
      
      return NextResponse.json({
        success: true,
        environmentVariables: envVars,
        dynamoDBConnection: 'success',
        existingTables: existingTables,
        tableCount: existingTables.length
      });
    } catch (dbError: any) {
      return NextResponse.json({
        success: false,
        environmentVariables: envVars,
        dynamoDBConnection: 'failed',
        dbError: dbError.message,
        errorCode: dbError.name
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { 
        success: false,
        error: 'Debug endpoint failed',
        details: error.message
      },
      { status: 500 }
    );
  }
}