// app/api/auth/invite/route.ts - In-app user invitation system
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  GetItemCommand,
  CreateTableCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import crypto from 'crypto';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ORG_ID = process.env.ORGANIZATION_ID!;
const INVITATIONS_TABLE = process.env.INVITATIONS_TABLE_NAME || 'UserInvitations';
const USERS_TABLE = process.env.USERS_TABLE_NAME || 'SecurityTeamUsers';
const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || 'CloudServices';

const ddb = new DynamoDBClient({ region: REGION });
const ses = new SESClient({ region: REGION });

// Ensure required tables exist
async function ensureTablesExist(): Promise<void> {
  const tables = [
    {
      name: INVITATIONS_TABLE,
      keySchema: [
        { AttributeName: 'orgId', KeyType: 'HASH' },
        { AttributeName: 'invitationId', KeyType: 'RANGE' }
      ],
      attributeDefinitions: [
        { AttributeName: 'orgId', AttributeType: 'S' },
        { AttributeName: 'invitationId', AttributeType: 'S' }
      ]
    }
  ];

  for (const table of tables) {
    try {
      await ddb.send(new DescribeTableCommand({ TableName: table.name }));
      console.log(`✅ Table ${table.name} exists`);
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        console.log(`📝 Creating table ${table.name}...`);
        try {
          await ddb.send(new CreateTableCommand({
            TableName: table.name,
            KeySchema: table.keySchema,
            AttributeDefinitions: table.attributeDefinitions,
            BillingMode: 'PAY_PER_REQUEST'
          }));
          console.log(`✅ Created table ${table.name}`);
        } catch (createError: any) {
          console.error(`❌ Failed to create table ${table.name}:`, createError.message);
        }
      } else {
        console.error(`❌ Error checking table ${table.name}:`, error.message);
      }
    }
  }
}

interface Invitation {
  id: string
  email: string
  name: string
  roleIds: string[]
  invitedBy: string
  invitedAt: string
  expiresAt: string
  status: 'pending' | 'accepted' | 'expired' | 'cancelled'
  acceptedAt?: string
  token: string
}

// Get Cognito configuration
async function getCognitoConfig() {
  const resp = await ddb.send(new GetItemCommand({
    TableName: CS_TABLE,
    Key: {
      orgId: { S: ORG_ID },
      serviceType: { S: 'aws-cognito' },
    },
  }));
  
  if (!resp.Item) {
    throw new Error('AWS Cognito not configured');
  }
  
  return {
    userPoolId: resp.Item.userPoolId?.S!,
    region: resp.Item.region?.S!,
  };
}

// Generate secure invitation token
function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Send invitation email
async function sendInvitationEmail(invitation: Invitation, inviterName: string): Promise<void> {
  const inviteUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/auth/accept-invite?token=${invitation.token}`;
  
  const emailParams = {
    Source: process.env.FROM_EMAIL || 'noreply@encryptgate.com',
    Destination: {
      ToAddresses: [invitation.email],
    },
    Message: {
      Subject: {
        Data: `You've been invited to join EncryptGate Security Console`,
        Charset: 'UTF-8',
      },
      Body: {
        Html: {
          Data: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>EncryptGate Invitation</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
                .btn { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
                .btn:hover { background: #5a6fd8; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; font-size: 14px; color: #6c757d; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🛡️ EncryptGate Security Console</h1>
                  <p>You've been invited to join our security team</p>
                </div>
                <div class="content">
                  <h2>Hi ${invitation.name || invitation.email}!</h2>
                  <p><strong>${inviterName}</strong> has invited you to join the EncryptGate Security Console as a team member.</p>
                  
                  <p>With EncryptGate, you'll be able to:</p>
                  <ul>
                    <li>🔍 Monitor and analyze security threats</li>
                    <li>📧 Investigate suspicious email activities</li>
                    <li>🤖 Use AI-powered security insights</li>
                    <li>👥 Collaborate with your security team</li>
                  </ul>
                  
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${inviteUrl}" class="btn">Accept Invitation & Set Password</a>
                  </div>
                  
                  <p><strong>⚠️ This invitation expires in 7 days.</strong></p>
                  <p>If you can't click the button above, copy and paste this link into your browser:</p>
                  <p style="word-break: break-all; background: #e9ecef; padding: 10px; border-radius: 4px; font-family: monospace;">${inviteUrl}</p>
                  
                  <div class="footer">
                    <p>If you didn't expect this invitation, you can safely ignore this email.</p>
                    <p>© ${new Date().getFullYear()} EncryptGate Security Console</p>
                  </div>
                </div>
              </div>
            </body>
            </html>
          `,
          Charset: 'UTF-8',
        },
      },
    },
  };

  await ses.send(new SendEmailCommand(emailParams));
}

// POST: Send invitation
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, name, roleIds, invitedBy } = body;

    if (!email || !roleIds || !Array.isArray(roleIds) || roleIds.length === 0) {
      return NextResponse.json(
        { error: 'Email and at least one role are required' },
        { status: 400 }
      );
    }

    console.log('📨 Sending invitation to:', email);

    // Ensure tables exist first
    await ensureTablesExist();

    // Check if user already exists
    const existingUserResponse = await ddb.send(new QueryCommand({
      TableName: USERS_TABLE,
      KeyConditionExpression: 'orgId = :orgId',
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':orgId': { S: ORG_ID },
        ':email': { S: email },
      },
    }));

    if (existingUserResponse.Items && existingUserResponse.Items.length > 0) {
      return NextResponse.json(
        { error: 'User already exists in the organization' },
        { status: 409 }
      );
    }

    // Check for existing pending invitation
    const existingInviteResponse = await ddb.send(new QueryCommand({
      TableName: INVITATIONS_TABLE,
      KeyConditionExpression: 'orgId = :orgId',
      FilterExpression: 'email = :email AND #status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':orgId': { S: ORG_ID },
        ':email': { S: email },
        ':status': { S: 'pending' },
      },
    }));

    if (existingInviteResponse.Items && existingInviteResponse.Items.length > 0) {
      return NextResponse.json(
        { error: 'User already has a pending invitation' },
        { status: 409 }
      );
    }

    // Create invitation
    const invitationId = `${ORG_ID}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const token = generateInviteToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const invitation: Invitation = {
      id: invitationId,
      email,
      name: name || '',
      roleIds,
      invitedBy: invitedBy || 'System',
      invitedAt: new Date().toISOString(),
      expiresAt,
      status: 'pending',
      token
    };

    // Save invitation to DynamoDB
    await ddb.send(new PutItemCommand({
      TableName: INVITATIONS_TABLE,
      Item: {
        orgId: { S: ORG_ID },
        invitationId: { S: invitationId },
        email: { S: email },
        name: { S: name || '' },
        roleIds: { SS: roleIds },
        invitedBy: { S: invitedBy || 'System' },
        invitedAt: { S: invitation.invitedAt },
        expiresAt: { S: expiresAt },
        status: { S: 'pending' },
        token: { S: token }
      }
    }));

    // Send invitation email
    try {
      await sendInvitationEmail(invitation, invitedBy || 'System Administrator');
      console.log('✅ Invitation email sent to:', email);
    } catch (emailError) {
      console.error('⚠️ Failed to send invitation email:', emailError);
      // Continue anyway - invitation is created, user can be notified manually
    }

    return NextResponse.json({
      success: true,
      invitation: {
        id: invitationId,
        email,
        name,
        roleIds,
        invitedAt: invitation.invitedAt,
        expiresAt,
        status: 'pending'
      }
    });

  } catch (error: any) {
    console.error('❌ Error sending invitation:', error);
    return NextResponse.json(
      { 
        error: 'Failed to send invitation',
        details: error.message
      },
      { status: 500 }
    );
  }
}

// GET: List pending invitations
export async function GET() {
  try {
    console.log('📋 Fetching pending invitations');

    // Ensure tables exist first
    await ensureTablesExist();

    const response = await ddb.send(new QueryCommand({
      TableName: INVITATIONS_TABLE,
      KeyConditionExpression: 'orgId = :orgId',
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':orgId': { S: ORG_ID },
        ':status': { S: 'pending' }
      }
    }));

    const invitations = (response.Items || []).map(item => ({
      id: item.invitationId?.S || '',
      email: item.email?.S || '',
      name: item.name?.S || '',
      roleIds: item.roleIds?.SS || [],
      invitedBy: item.invitedBy?.S || '',
      invitedAt: item.invitedAt?.S || '',
      expiresAt: item.expiresAt?.S || '',
      status: item.status?.S || 'pending'
    }));

    return NextResponse.json({
      success: true,
      invitations,
      count: invitations.length
    });

  } catch (error: any) {
    console.error('❌ Error fetching invitations:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch invitations',
        details: error.message
      },
      { status: 500 }
    );
  }
}