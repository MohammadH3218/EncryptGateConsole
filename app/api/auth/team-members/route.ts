// app/api/auth/team-members/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';

// Environment variables
const ORG_ID = process.env.ORGANIZATION_ID!;
const USERS_TABLE = process.env.USERS_TABLE_NAME || 'SecurityTeamUsers';

// DynamoDB client
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });

// Helper function to determine online status and activity
function calculateUserStatus(lastLogin: string | null) {
  if (!lastLogin) {
    return { status: 'offline', online: false };
  }

  const lastLoginTime = new Date(lastLogin).getTime();
  const now = Date.now();
  const timeDiff = now - lastLoginTime;

  // Active if logged in within 5 minutes
  if (timeDiff <= 300000) { // 5 minutes
    return { status: 'active', online: true };
  }
  // Away if logged in within 30 minutes
  else if (timeDiff <= 1800000) { // 30 minutes
    return { status: 'away', online: true };
  }
  // Offline if longer than 30 minutes
  else {
    return { status: 'offline', online: false };
  }
}

// Helper function to generate avatar initials
function generateAvatar(name: string, email: string): string {
  if (name && name.trim()) {
    const nameParts = name.trim().split(' ');
    if (nameParts.length >= 2) {
      return (nameParts[0][0] + nameParts[1][0]).toUpperCase();
    } else if (nameParts.length === 1) {
      return nameParts[0].substring(0, 2).toUpperCase();
    }
  }
  
  // Fallback to email
  const emailParts = email.split('@')[0];
  return emailParts.substring(0, 2).toUpperCase();
}

// GET: fetch real team members from SecurityTeamUsers table
export async function GET() {
  try {
    console.log('📋 Fetching team members from SecurityTeamUsers table...');

    if (!ORG_ID) {
      return NextResponse.json(
        { error: 'Organization ID not configured' },
        { status: 500 }
      );
    }

    // Query SecurityTeamUsers table for all users in this organization
    const resp = await ddb.send(
      new QueryCommand({
        TableName: USERS_TABLE,
        KeyConditionExpression: 'orgId = :orgId',
        ExpressionAttributeValues: {
          ':orgId': { S: ORG_ID },
        },
      })
    );

    const users = (resp.Items || []).map((item) => {
      const name = item.name?.S || '';
      const email = item.email?.S || '';
      const lastLogin = item.lastLogin?.S || null;
      const userStatus = calculateUserStatus(lastLogin);

      return {
        id: item.email?.S || '',
        name: name,
        email: email,
        role: item.role?.S || 'Team Member',
        status: userStatus.status,
        avatar: generateAvatar(name, email),
        lastActive: lastLogin || new Date().toISOString(),
        online: userStatus.online,
        lastLogin: lastLogin
      };
    });

    console.log(`✅ Found ${users.length} team members`);

    return NextResponse.json({
      success: true,
      team_members: users,  // Use team_members to match frontend expectation
      teamMembers: users,   // Keep both for compatibility
      count: users.length
    });

  } catch (error: any) {
    console.error('❌ Team members error:', error);
    
    // Provide helpful error messages
    let errorMessage = 'Failed to fetch team members';
    if (error.name === 'ResourceNotFoundException') {
      errorMessage = 'SecurityTeamUsers table not found. Please ensure users are added through the user management page.';
    } else if (error.name === 'UnrecognizedClientException') {
      errorMessage = 'AWS credentials not configured properly';
    }
    
    return NextResponse.json(
      { 
        error: errorMessage, 
        details: error.message,
        code: error.name
      },
      { status: 500 }
    );
  }
}