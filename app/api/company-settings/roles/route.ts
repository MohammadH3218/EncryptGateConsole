// app/api/company-settings/roles/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  GetItemCommand,
} from '@aws-sdk/client-dynamodb';
import { Role, DEFAULT_ROLES, PERMISSIONS } from '@/types/roles';

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

// Helper to convert Role to DynamoDB item
function roleToItem(role: Role, orgId: string) {
  return {
    orgId: { S: orgId },
    roleId: { S: role.id },
    name: { S: role.name },
    description: { S: role.description },
    color: { S: role.color },
    priority: { N: role.priority.toString() },
    permissions: { SS: role.permissions },
    mentionable: { BOOL: role.mentionable },
    hoisted: { BOOL: role.hoisted },
    createdAt: { S: role.createdAt },
    updatedAt: { S: role.updatedAt },
    userCount: { N: role.userCount.toString() }
  };
}

// Initialize default roles for a new organization
async function initializeDefaultRoles(orgId: string): Promise<void> {
  console.log('🔧 Initializing default roles for organization:', orgId);
  
  for (const defaultRole of DEFAULT_ROLES) {
    const role: Role = {
      ...defaultRole,
      id: `${orgId}-${defaultRole.name.toLowerCase().replace(/\s+/g, '-')}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userCount: 0
    };

    try {
      await ddb.send(new PutItemCommand({
        TableName: ROLES_TABLE,
        Item: roleToItem(role, orgId),
        ConditionExpression: 'attribute_not_exists(roleId)' // Don't overwrite existing
      }));
      console.log(`✅ Created default role: ${role.name}`);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        console.log(`⚠️ Role ${role.name} already exists, skipping`);
      } else {
        console.error(`❌ Failed to create role ${role.name}:`, error);
      }
    }
  }
}

// GET: List all roles for the organization
export async function GET() {
  try {
    console.log('📋 Fetching roles for organization:', ORG_ID);

    // Query roles for this organization
    const response = await ddb.send(new QueryCommand({
      TableName: ROLES_TABLE,
      KeyConditionExpression: 'orgId = :orgId',
      ExpressionAttributeValues: {
        ':orgId': { S: ORG_ID }
      }
    }));

    let roles: Role[] = (response.Items || []).map(itemToRole);

    // If no roles exist, initialize default roles
    if (roles.length === 0) {
      await initializeDefaultRoles(ORG_ID);
      
      // Re-fetch after initialization
      const retryResponse = await ddb.send(new QueryCommand({
        TableName: ROLES_TABLE,
        KeyConditionExpression: 'orgId = :orgId',
        ExpressionAttributeValues: {
          ':orgId': { S: ORG_ID }
        }
      }));
      
      roles = (retryResponse.Items || []).map(itemToRole);
    }

    // Sort by priority (highest first)
    roles.sort((a, b) => b.priority - a.priority);

    console.log(`✅ Found ${roles.length} roles`);
    
    return NextResponse.json({
      success: true,
      roles,
      permissions: PERMISSIONS,
      count: roles.length
    });

  } catch (error: any) {
    console.error('❌ Error fetching roles:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch roles',
        details: error.message,
        code: error.name
      },
      { status: 500 }
    );
  }
}

// POST: Create a new role
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, color, permissions, mentionable, hoisted, priority } = body;

    if (!name || !description) {
      return NextResponse.json(
        { error: 'Name and description are required' },
        { status: 400 }
      );
    }

    console.log('➕ Creating new role:', name);

    // Generate role ID
    const roleId = `${ORG_ID}-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    
    const newRole: Role = {
      id: roleId,
      name,
      description,
      color: color || '#95a5a6',
      priority: priority || 400, // Default priority between Junior Analyst and Viewer
      permissions: permissions || [],
      mentionable: mentionable !== undefined ? mentionable : true,
      hoisted: hoisted !== undefined ? hoisted : false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userCount: 0
    };

    // Validate permissions
    const validPermissions = PERMISSIONS.map(p => p.id);
    const invalidPerms = newRole.permissions.filter(p => !validPermissions.includes(p));
    if (invalidPerms.length > 0) {
      return NextResponse.json(
        { error: 'Invalid permissions', invalid: invalidPerms },
        { status: 400 }
      );
    }

    // Save to DynamoDB
    await ddb.send(new PutItemCommand({
      TableName: ROLES_TABLE,
      Item: roleToItem(newRole, ORG_ID),
      ConditionExpression: 'attribute_not_exists(roleId)'
    }));

    console.log('✅ Role created successfully:', roleId);

    return NextResponse.json({
      success: true,
      role: newRole
    });

  } catch (error: any) {
    console.error('❌ Error creating role:', error);
    
    let statusCode = 500;
    let errorMessage = 'Failed to create role';
    
    if (error.name === 'ConditionalCheckFailedException') {
      statusCode = 409;
      errorMessage = 'Role with this name already exists';
    }

    return NextResponse.json(
      { 
        error: errorMessage,
        details: error.message,
        code: error.name
      },
      { status: statusCode }
    );
  }
}