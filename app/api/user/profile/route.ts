import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'
import { DynamoDBClient, QueryCommand, GetItemCommand } from '@aws-sdk/client-dynamodb'

// DynamoDB setup
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' })
const CLOUDSERVICES_TABLE = process.env.CLOUDSERVICES_TABLE_NAME || 'CloudServices'
const ORGANIZATIONS_TABLE = process.env.ORGANIZATIONS_TABLE_NAME || 'Organizations'
const USERS_TABLE = process.env.USERS_TABLE_NAME || 'SecurityTeamUsers'

// Helper function to get organization info from Organizations table
async function getOrganizationInfo(orgId: string) {
  try {
    // First try Organizations table
    const response = await ddb.send(new GetItemCommand({
      TableName: ORGANIZATIONS_TABLE,
      Key: {
        'organizationId': { S: orgId }
      }
    }))
    
    const item = response.Item
    if (item && item.name?.S) {
      return {
        id: orgId,
        name: item.name.S
      }
    }
  } catch (error) {
    console.warn(`Failed to fetch org info from Organizations table for ${orgId}:`, error)
  }
  
  return {
    id: orgId,
    name: 'Your Organization'
  }
}

// Helper function to get user display name from Users table
async function getUserDisplayName(orgId: string, userEmail: string, fallbackName: string) {
  try {
    // Query Users table by orgId and email
    const response = await ddb.send(new QueryCommand({
      TableName: USERS_TABLE,
      KeyConditionExpression: 'orgId = :orgId',
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':orgId': { S: orgId },
        ':email': { S: userEmail }
      },
      Limit: 1
    }))
    
    const item = response.Items?.[0]
    if (item && item.name?.S) {
      return item.name.S
    }
  } catch (error) {
    console.warn(`Failed to fetch user display name for ${userEmail} in org ${orgId}:`, error)
  }
  
  return fallbackName
}

// Default permissions for each role
const DEFAULT_ROLE_PERMS = {
  "Owner": ["*"],
  "Admin": ["*"],
  "SecurityAnalyst": [
    "detections.read", "detections.update", "detections.create",
    "assignments.read", "assignments.update", "assignments.create",
    "team.read", "investigations.read", "investigations.update",
    "blocked_emails.read", "blocked_emails.create"
  ],
  "SecurityViewer": [
    "detections.read", "assignments.read", "team.read", "investigations.read"
  ],
  "Analyst": [
    "detections.read", "detections.update", "assignments.read", "assignments.update",
    "team.read", "investigations.read", "investigations.update"
  ],
  "Viewer": ["detections.read", "assignments.read", "team.read", "investigations.read"]
}

function expandRolePermissions(roles: string[]): string[] {
  const allPermissions = new Set<string>()
  
  for (const role of roles) {
    const rolePerms = DEFAULT_ROLE_PERMS[role as keyof typeof DEFAULT_ROLE_PERMS] || []
    rolePerms.forEach(perm => allPermissions.add(perm))
  }
  
  return Array.from(allPermissions)
}

export async function GET(request: NextRequest) {
  try {
    console.log('📋 GET /api/user/profile - Fetching user profile')
    
    // Get token from authorization header or cookies
    const authHeader = request.headers.get('Authorization')
    let token = null
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '').trim()
      console.log('✅ Using token from Authorization header')
    } else {
      const cookieStore = cookies()
      token = cookieStore.get('access_token')?.value || cookieStore.get('id_token')?.value
      console.log('✅ Using token from cookies')
    }

    if (!token) {
      console.log('❌ No authentication token found')
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Decode token (unverified for development)
    const claims = jwt.decode(token) as any
    if (!claims) {
      console.log('❌ Invalid token format')
      return NextResponse.json({ ok: false, error: 'Invalid token' }, { status: 401 })
    }

    // Extract user information from token claims
    const roles = claims['cognito:groups'] || claims.roles || []
    const rolesArray = Array.isArray(roles) ? roles : [roles]
    const permissions = expandRolePermissions(rolesArray)
    const orgId = claims['custom:orgId'] || claims.orgId || request.headers.get('x-org-id')

    if (!orgId) {
      console.log('❌ No organization ID found in token or headers')
      return NextResponse.json({ 
        ok: false, 
        error: 'Organization ID not found',
        details: 'No orgId in token or x-org-id header' 
      }, { status: 400 })
    }

    // Get organization info from database
    const orgInfo = await getOrganizationInfo(orgId)
    
    // Extract display name from various token fields, fallback to email local part
    // Match the same order as AppLayout for consistency
    const tokenDisplayName = (
      claims.preferred_username || 
      claims.name || 
      claims.given_name || 
      claims['custom:displayName'] ||
      (claims.email || claims['cognito:username'])?.split('@')[0] ||
      'User'
    )
    
    // Try to get stored display name from Users table, fallback to token name
    const userEmail = claims.email || claims['cognito:username']
    const displayName = await getUserDisplayName(orgId, userEmail, tokenDisplayName)

    const profile = {
      ok: true,
      user: {
        id: claims.sub,
        email: claims.email || claims['cognito:username'],
        name: displayName,
        username: claims['cognito:username'] || claims.email,
        rawRoles: rolesArray,
        permissions: permissions,
        isAdmin: permissions.includes('*'),
        isOwner: rolesArray.includes('Owner'),
        createdAt: new Date(claims.iat * 1000).toISOString(),
        lastActive: new Date().toISOString()
      },
      org: {
        id: orgId,
        name: orgInfo.name
      },
      // Legacy fields for backward compatibility
      id: claims.sub,
      email: claims.email || claims['cognito:username'],
      name: displayName,
      role: rolesArray[0] || 'Viewer',
      roles: rolesArray,
      permissions: permissions,
      organizationId: orgId,
      organizationName: orgInfo.name
    }

    console.log(`✅ Profile loaded for user: ${profile.user.email} (${profile.user.name}) in org: ${profile.org.name} with roles: [${rolesArray.join(', ')}]`)
    
    return NextResponse.json(profile)
  } catch (error: any) {
    console.error('❌ Profile fetch error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: 'Failed to get profile',
      details: error.message 
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    console.log('📋 PUT /api/user/profile - Updating user profile')
    
    // Get token from authorization header or cookies
    const authHeader = request.headers.get('Authorization')
    let token = null
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '').trim()
    } else {
      const cookieStore = cookies()
      token = cookieStore.get('access_token')?.value
    }

    if (!token) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Decode token
    const claims = jwt.decode(token) as any
    if (!claims) {
      return NextResponse.json({ ok: false, error: 'Invalid token' }, { status: 401 })
    }

    const orgId = claims['custom:orgId'] || claims.orgId || request.headers.get('x-org-id')
    if (!orgId) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Organization ID not found'
      }, { status: 400 })
    }

    const updateData = await request.json()
    const userEmail = claims.email || claims['cognito:username']
    
    // Import additional dependencies for Cognito and DynamoDB operations
    const { 
      CognitoIdentityProviderClient, 
      AdminUpdateUserAttributesCommand,
      AdminGetUserCommand 
    } = require('@aws-sdk/client-cognito-identity-provider')
    const { UpdateItemCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb')
    
    let updatedFields: any = {}
    
    // Update display name in Users table if provided
    if (updateData.name && updateData.name.trim() !== '') {
      try {
        await ddb.send(new UpdateItemCommand({
          TableName: USERS_TABLE,
          Key: {
            'orgId': { S: orgId },
            'email': { S: userEmail }
          },
          UpdateExpression: 'SET #name = :name, updatedAt = :updatedAt',
          ExpressionAttributeNames: {
            '#name': 'name'
          },
          ExpressionAttributeValues: {
            ':name': { S: updateData.name.trim() },
            ':updatedAt': { S: new Date().toISOString() }
          }
        }))
        
        updatedFields.name = updateData.name.trim()
        console.log(`✅ Updated display name in Users table for ${userEmail}`)
      } catch (error) {
        console.error('❌ Failed to update display name in Users table:', error)
      }
    }

    // Update preferred_username in Cognito if provided and different from current
    if (updateData.preferredUsername && updateData.preferredUsername.trim() !== '') {
      try {
        // Get Cognito configuration
        const cognitoConfig = await getCognitoConfig(orgId)
        if (cognitoConfig) {
          const cognitoClient = new CognitoIdentityProviderClient({
            region: cognitoConfig.region,
            credentials: cognitoConfig.accessKeyId && cognitoConfig.secretAccessKey ? {
              accessKeyId: cognitoConfig.accessKeyId,
              secretAccessKey: cognitoConfig.secretAccessKey,
            } : undefined,
          })

          // Update preferred_username attribute in Cognito
          await cognitoClient.send(new AdminUpdateUserAttributesCommand({
            UserPoolId: cognitoConfig.userPoolId,
            Username: userEmail,
            UserAttributes: [
              {
                Name: 'preferred_username',
                Value: updateData.preferredUsername.trim()
              }
            ]
          }))
          
          updatedFields.preferredUsername = updateData.preferredUsername.trim()
          console.log(`✅ Updated preferred_username in Cognito for ${userEmail}`)
        }
      } catch (error) {
        console.error('❌ Failed to update preferred_username in Cognito:', error)
        return NextResponse.json({
          ok: false,
          error: 'Failed to update username',
          details: 'Could not update username in authentication system'
        }, { status: 500 })
      }
    }

    // Update other profile fields in Users table
    const otherFields = ['jobTitle', 'department', 'phone', 'bio']
    const updateExpressions = []
    const attributeNames: any = {}
    const attributeValues: any = {}
    let expressionIndex = 0

    for (const field of otherFields) {
      if (updateData[field] !== undefined) {
        const attrName = `#field${expressionIndex}`
        const attrValue = `:value${expressionIndex}`
        
        updateExpressions.push(`${attrName} = ${attrValue}`)
        attributeNames[attrName] = field
        attributeValues[attrValue] = { S: String(updateData[field] || '') }
        updatedFields[field] = updateData[field]
        expressionIndex++
      }
    }

    // Update additional profile fields if any
    if (updateExpressions.length > 0) {
      try {
        updateExpressions.push('updatedAt = :updatedAt')
        attributeValues[':updatedAt'] = { S: new Date().toISOString() }

        await ddb.send(new UpdateItemCommand({
          TableName: USERS_TABLE,
          Key: {
            'orgId': { S: orgId },
            'email': { S: userEmail }
          },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: attributeNames,
          ExpressionAttributeValues: attributeValues
        }))
        
        console.log(`✅ Updated additional profile fields for ${userEmail}`)
      } catch (error) {
        console.error('❌ Failed to update profile fields in Users table:', error)
      }
    }
    
    console.log(`✅ Profile updated successfully for ${userEmail} with fields:`, updatedFields)
    
    return NextResponse.json({ 
      ok: true,
      success: true,
      message: 'Profile updated successfully',
      updatedFields: updatedFields
    })
  } catch (error: any) {
    console.error('❌ Profile update error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: 'Failed to update profile',
      details: error.message 
    }, { status: 500 })
  }
}

// Helper function to get Cognito configuration (reused from change-password)
async function getCognitoConfig(orgId: string) {
  try {
    const response = await ddb.send(new GetItemCommand({
      TableName: 'CloudServices',
      Key: {
        'orgId': { S: orgId },
        'serviceType': { S: 'aws-cognito' }
      }
    }))

    if (response.Item) {
      return {
        userPoolId: response.Item.userPoolId?.S,
        clientId: response.Item.clientId?.S,
        clientSecret: response.Item.clientSecret?.S,
        region: response.Item.region?.S || process.env.AWS_REGION || 'us-east-1',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    }
  } catch (error) {
    console.error('Failed to get Cognito config:', error)
  }
  return null
}