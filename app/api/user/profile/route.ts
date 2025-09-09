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

// Role aliases for normalization (handles case sensitivity and variations)
const ROLE_ALIASES: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  securityanalyst: "SecurityAnalyst",
  securityviewer: "SecurityViewer",
  analyst: "Analyst",
  viewer: "Viewer",
}

function normalizeRole(role: string): string {
  if (!role) return role
  const key = role.replace(/[^a-z]/gi, "").toLowerCase()
  return ROLE_ALIASES[key] ?? role // fall back to original if unknown
}

// Default permissions for each role
const DEFAULT_ROLE_PERMS = {
  "Owner": ["*"],
  "Admin": ["*"],
  "SecurityAnalyst": [
    "dashboard.read",
    "detections.read", "detections.update", "detections.create",
    "assignments.read", "assignments.update", "assignments.create",
    "team.read", "investigations.read", "investigations.update",
    "blocked_emails.read", "blocked_emails.create",
    "pushed_requests.read"
  ],
  "SecurityViewer": [
    "dashboard.read",
    "detections.read", "assignments.read", "team.read",
    "investigations.read",
    "pushed_requests.read"
  ],
  "Analyst": [
    "dashboard.read",
    "detections.read", "detections.update",
    "assignments.read", "assignments.update",
    "team.read", "investigations.read", "investigations.update",
    "pushed_requests.read"
  ],
  "Viewer": [
    "dashboard.read",
    "detections.read", "assignments.read", "team.read",
    "investigations.read",
    "pushed_requests.read"
  ]
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
    const rawRoles = Array.isArray(roles) ? roles : [roles]
    const rolesArray = rawRoles.map(normalizeRole)
    const permissions = expandRolePermissions(rolesArray)
    // Try multiple ways to get orgId
    let orgId = claims['custom:orgId'] || claims.orgId || request.headers.get('x-org-id')
    
    // Also try to extract from URL query params or referer for pre-login scenarios
    if (!orgId) {
      const url = new URL(request.url)
      orgId = url.searchParams.get('orgId')
    }
    
    // Try orgId_hint cookie set by middleware
    if (!orgId) {
      const cookieStore = cookies()
      orgId = cookieStore.get('orgId_hint')?.value
    }
    
    // Try to extract from referer path for login page scenarios
    if (!orgId) {
      const referer = request.headers.get('referer') || ''
      const match = referer.match(/\/o\/([^/]+)\//)
      if (match) {
        orgId = match[1]
      }
    }

    if (!orgId) {
      console.log('❌ No organization ID found - returning minimal profile for pre-login')
      return NextResponse.json({ 
        ok: false, 
        error: 'ORG_ID_MISSING',
        message: 'No organization ID supplied yet (pre-login is allowed)',
        user: null,
        org: null
      }, { status: 200 }) // Return 200, not 400, so UI doesn't redirect
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

    const roles = claims['cognito:groups'] || claims.roles || []
    const rolesArray = Array.isArray(roles) ? roles : [roles]
    const permissions = expandRolePermissions(rolesArray)
    
    // Check if user has permission to update profiles (Admin/Owner only)
    if (!permissions.includes('*')) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Insufficient permissions',
        message: 'Only Admin or Owner can update user profiles'
      }, { status: 403 })
    }

    const updateData = await request.json()
    
    // For now, return success since we don't have a database implementation
    // In a real implementation, you would update the user in your database
    console.log(`✅ Profile update requested by ${claims.email} with data:`, updateData)
    
    return NextResponse.json({ 
      ok: true,
      message: 'Profile update requested successfully',
      updatedFields: updateData
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