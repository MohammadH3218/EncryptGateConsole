// app/api/auth/accept-invite/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ORG_ID = process.env.ORGANIZATION_ID!;
const INVITATIONS_TABLE = process.env.INVITATIONS_TABLE_NAME || 'UserInvitations';
const USERS_TABLE = process.env.USERS_TABLE_NAME || 'SecurityTeamUsers';
const CS_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || 'CloudServices';

const ddb = new DynamoDBClient({ region: REGION });

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

// GET: Validate invitation token and get invitation details
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Invitation token is required' },
        { status: 400 }
      );
    }

    console.log('🔍 Validating invitation token');

    // Find invitation by token
    const response = await ddb.send(new QueryCommand({
      TableName: INVITATIONS_TABLE,
      KeyConditionExpression: 'orgId = :orgId',
      FilterExpression: 'token = :token',
      ExpressionAttributeValues: {
        ':orgId': { S: ORG_ID },
        ':token': { S: token }
      }
    }));

    if (!response.Items || response.Items.length === 0) {
      return NextResponse.json(
        { error: 'Invalid or expired invitation token' },
        { status: 404 }
      );
    }

    const invitation = response.Items[0];
    const status = invitation.status?.S || '';
    const expiresAt = new Date(invitation.expiresAt?.S || '');
    const now = new Date();

    // Check if invitation is expired
    if (now > expiresAt) {
      return NextResponse.json(
        { error: 'Invitation has expired' },
        { status: 410 }
      );
    }

    // Check if invitation is still pending
    if (status !== 'pending') {
      return NextResponse.json(
        { error: 'Invitation is no longer valid' },
        { status: 410 }
      );
    }

    // Return invitation details
    return NextResponse.json({
      success: true,
      invitation: {
        id: invitation.invitationId?.S || '',
        email: invitation.email?.S || '',
        name: invitation.name?.S || '',
        roleIds: invitation.roleIds?.SS || [],
        invitedBy: invitation.invitedBy?.S || '',
        invitedAt: invitation.invitedAt?.S || '',
        expiresAt: invitation.expiresAt?.S || ''
      }
    });

  } catch (error: any) {
    console.error('❌ Error validating invitation:', error);
    return NextResponse.json(
      { 
        error: 'Failed to validate invitation',
        details: error.message
      },
      { status: 500 }
    );
  }
}

// POST: Accept invitation and create user account
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, password, name } = body;

    if (!token || !password) {
      return NextResponse.json(
        { error: 'Token and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    console.log('✅ Accepting invitation with token');

    // Find and validate invitation
    const inviteResponse = await ddb.send(new QueryCommand({
      TableName: INVITATIONS_TABLE,
      KeyConditionExpression: 'orgId = :orgId',
      FilterExpression: 'token = :token',
      ExpressionAttributeValues: {
        ':orgId': { S: ORG_ID },
        ':token': { S: token }
      }
    }));

    if (!inviteResponse.Items || inviteResponse.Items.length === 0) {
      return NextResponse.json(
        { error: 'Invalid invitation token' },
        { status: 404 }
      );
    }

    const invitation = inviteResponse.Items[0];
    const email = invitation.email?.S || '';
    const invitationId = invitation.invitationId?.S || '';
    const roleIds = invitation.roleIds?.SS || [];
    const status = invitation.status?.S || '';
    const expiresAt = new Date(invitation.expiresAt?.S || '');

    // Validate invitation
    if (status !== 'pending') {
      return NextResponse.json(
        { error: 'Invitation is no longer valid' },
        { status: 410 }
      );
    }

    if (new Date() > expiresAt) {
      return NextResponse.json(
        { error: 'Invitation has expired' },
        { status: 410 }
      );
    }

    // Get Cognito configuration
    const { userPoolId, region: cognitoRegion } = await getCognitoConfig();
    const cognito = new CognitoIdentityProviderClient({ region: cognitoRegion });

    console.log('👤 Creating user in Cognito:', email);

    // Create user in Cognito
    try {
      await cognito.send(new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: name || invitation.name?.S || email }
        ],
        TemporaryPassword: password + 'Temp!', // Temporary password
        MessageAction: 'SUPPRESS' // Don't send welcome email since we're setting permanent password
      }));

      // Set permanent password immediately
      await cognito.send(new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: email,
        Password: password,
        Permanent: true
      }));

      console.log('✅ User created in Cognito successfully');
    } catch (cognitoError: any) {
      console.error('❌ Cognito user creation failed:', cognitoError);
      if (cognitoError.name === 'UsernameExistsException') {
        return NextResponse.json(
          { error: 'User with this email already exists' },
          { status: 409 }
        );
      }
      throw cognitoError;
    }

    // Add user to security team roles in Cognito (if groups exist)
    for (const roleId of roleIds) {
      try {
        await cognito.send(new AdminAddUserToGroupCommand({
          UserPoolId: userPoolId,
          Username: email,
          GroupName: roleId
        }));
        console.log(`✅ Added user to group: ${roleId}`);
      } catch (groupError) {
        console.warn(`⚠️ Failed to add user to group ${roleId}:`, groupError);
        // Continue - group might not exist yet
      }
    }

    // Add user to SecurityTeamUsers table
    const finalName = name || invitation.name?.S || email.split('@')[0];
    await ddb.send(new PutItemCommand({
      TableName: USERS_TABLE,
      Item: {
        orgId: { S: ORG_ID },
        email: { S: email },
        name: { S: finalName },
        role: { S: roleIds.join(', ') }, // For compatibility with existing code
        roleIds: { SS: roleIds },
        status: { S: 'active' },
        addedAt: { S: new Date().toISOString() },
        lastLogin: { S: new Date().toISOString() },
        invitationAcceptedAt: { S: new Date().toISOString() }
      }
    }));

    // Update invitation status
    await ddb.send(new UpdateItemCommand({
      TableName: INVITATIONS_TABLE,
      Key: {
        orgId: { S: ORG_ID },
        invitationId: { S: invitationId }
      },
      UpdateExpression: 'SET #status = :status, acceptedAt = :acceptedAt',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': { S: 'accepted' },
        ':acceptedAt': { S: new Date().toISOString() }
      }
    }));

    console.log('🎉 User account created and invitation accepted:', email);

    return NextResponse.json({
      success: true,
      message: 'Account created successfully! You can now sign in.',
      user: {
        email,
        name: finalName,
        roles: roleIds
      }
    });

  } catch (error: any) {
    console.error('❌ Error accepting invitation:', error);
    return NextResponse.json(
      { 
        error: 'Failed to accept invitation',
        details: error.message
      },
      { status: 500 }
    );
  }
}