// app/api/company-settings/roles/[id]/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { Role, PERMISSIONS } from '@/types/roles';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ORG_ID = process.env.ORGANIZATION_ID!;
const ROLES_TABLE = process.env.ROLES_TABLE_NAME || 'SecurityRoles';
const USER_ROLES_TABLE = process.env.USER_ROLES_TABLE_NAME || 'SecurityUserRoles';

const ddb = new DynamoDBClient({ region: REGION });

// Helper to convert DynamoDB item to Role
function itemToRole(item: any): Role {
  return {
    id: item.roleId?.S || '',
    name: item.name?.S || '',
    description: item.description?.S || '',
    color: item.color?.S || '#95a5a6',
    priority: parseInt(item.priority?.N || '0'),
    permissions: item.permissions?.SS || [],
    mentionable: item.mentionable?.BOOL || false,
    hoisted: item.hoisted?.BOOL || false,
    createdAt: item.createdAt?.S || '',
    updatedAt: item.updatedAt?.S || '',
    userCount: parseInt(item.userCount?.N || '0')
  };
}

// GET: Get specific role details
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roleId } = await params;
    console.log('🔍 Fetching role:', roleId);

    const response = await ddb.send(new GetItemCommand({
      TableName: ROLES_TABLE,
      Key: {
        orgId: { S: ORG_ID },
        roleId: { S: roleId }
      }
    }));

    if (!response.Item) {
      return NextResponse.json(
        { error: 'Role not found' },
        { status: 404 }
      );
    }

    const role = itemToRole(response.Item);
    
    return NextResponse.json({
      success: true,
      role
    });

  } catch (error: any) {
    console.error('❌ Error fetching role:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch role',
        details: error.message
      },
      { status: 500 }
    );
  }
}

// PUT: Update role
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roleId } = await params;
    const body = await request.json();
    const { name, description, color, permissions, mentionable, hoisted, priority } = body;

    console.log('📝 Updating role:', roleId);

    // First check if role exists
    const getResponse = await ddb.send(new GetItemCommand({
      TableName: ROLES_TABLE,
      Key: {
        orgId: { S: ORG_ID },
        roleId: { S: roleId }
      }
    }));

    if (!getResponse.Item) {
      return NextResponse.json(
        { error: 'Role not found' },
        { status: 404 }
      );
    }

    const currentRole = itemToRole(getResponse.Item);

    // Prevent modification of certain built-in roles
    if (currentRole.name === 'Owner' && priority && priority !== currentRole.priority) {
      return NextResponse.json(
        { error: 'Cannot change Owner role priority' },
        { status: 403 }
      );
    }

    // Validate permissions if provided
    if (permissions) {
      const validPermissions = PERMISSIONS.map(p => p.id);
      const invalidPerms = permissions.filter((p: string) => !validPermissions.includes(p));
      if (invalidPerms.length > 0) {
        return NextResponse.json(
          { error: 'Invalid permissions', invalid: invalidPerms },
          { status: 400 }
        );
      }
    }

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeValues: any = {};
    const expressionAttributeNames: any = {};

    if (name !== undefined) {
      updateExpressions.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = { S: name };
    }

    if (description !== undefined) {
      updateExpressions.push('description = :description');
      expressionAttributeValues[':description'] = { S: description };
    }

    if (color !== undefined) {
      updateExpressions.push('color = :color');
      expressionAttributeValues[':color'] = { S: color };
    }

    if (priority !== undefined) {
      updateExpressions.push('priority = :priority');
      expressionAttributeValues[':priority'] = { N: priority.toString() };
    }

    if (permissions !== undefined) {
      updateExpressions.push('permissions = :permissions');
      expressionAttributeValues[':permissions'] = { SS: permissions };
    }

    if (mentionable !== undefined) {
      updateExpressions.push('mentionable = :mentionable');
      expressionAttributeValues[':mentionable'] = { BOOL: mentionable };
    }

    if (hoisted !== undefined) {
      updateExpressions.push('hoisted = :hoisted');
      expressionAttributeValues[':hoisted'] = { BOOL: hoisted };
    }

    // Always update updatedAt
    updateExpressions.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = { S: new Date().toISOString() };

    if (updateExpressions.length === 1) { // Only updatedAt
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    // Update the role
    await ddb.send(new UpdateItemCommand({
      TableName: ROLES_TABLE,
      Key: {
        orgId: { S: ORG_ID },
        roleId: { S: roleId }
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ...(Object.keys(expressionAttributeNames).length > 0 && {
        ExpressionAttributeNames: expressionAttributeNames
      }),
      ReturnValues: 'ALL_NEW'
    }));

    console.log('✅ Role updated successfully:', roleId);

    return NextResponse.json({
      success: true,
      message: 'Role updated successfully'
    });

  } catch (error: any) {
    console.error('❌ Error updating role:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update role',
        details: error.message
      },
      { status: 500 }
    );
  }
}

// DELETE: Delete role
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roleId } = await params;
    console.log('🗑️ Deleting role:', roleId);

    // First check if role exists and get its details
    const getResponse = await ddb.send(new GetItemCommand({
      TableName: ROLES_TABLE,
      Key: {
        orgId: { S: ORG_ID },
        roleId: { S: roleId }
      }
    }));

    if (!getResponse.Item) {
      return NextResponse.json(
        { error: 'Role not found' },
        { status: 404 }
      );
    }

    const role = itemToRole(getResponse.Item);

    // Prevent deletion of built-in roles
    const protectedRoles = ['Owner', 'Admin'];
    if (protectedRoles.includes(role.name)) {
      return NextResponse.json(
        { error: `Cannot delete ${role.name} role` },
        { status: 403 }
      );
    }

    // Check if any users have this role
    const userRoleResponse = await ddb.send(new QueryCommand({
      TableName: USER_ROLES_TABLE,
      IndexName: 'RoleId-Index', // Assuming you have a GSI on roleId
      KeyConditionExpression: 'roleId = :roleId',
      ExpressionAttributeValues: {
        ':roleId': { S: roleId }
      },
      Limit: 1
    }));

    if (userRoleResponse.Items && userRoleResponse.Items.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete role that is assigned to users. Remove all users from this role first.' },
        { status: 409 }
      );
    }

    // Delete the role
    await ddb.send(new DeleteItemCommand({
      TableName: ROLES_TABLE,
      Key: {
        orgId: { S: ORG_ID },
        roleId: { S: roleId }
      }
    }));

    console.log('✅ Role deleted successfully:', roleId);

    return NextResponse.json({
      success: true,
      message: 'Role deleted successfully'
    });

  } catch (error: any) {
    console.error('❌ Error deleting role:', error);
    return NextResponse.json(
      { 
        error: 'Failed to delete role',
        details: error.message
      },
      { status: 500 }
    );
  }
}