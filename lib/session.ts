/**
 * Session Management - Single source of truth for user and org data
 */

export interface SessionUser {
  id: string
  email: string
  name: string
  username: string
  rawRoles: string[]
  permissions: string[]
  isAdmin: boolean
  isOwner: boolean
}

export interface SessionOrg {
  id: string
  name: string
}

export interface Session {
  user: SessionUser
  org: SessionOrg
}

/**
 * Load session data from the profile API
 */
export async function loadSession(accessToken: string, orgId: string): Promise<Session> {
  const response = await fetch('/api/user/profile', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'x-org-id': orgId,
      'Content-Type': 'application/json'
    },
    cache: 'no-store',
  })

  const text = await response.text()
  let json: any = {}
  
  try {
    json = text ? JSON.parse(text) : {}
  } catch (error) {
    throw new Error(`Profile API returned invalid JSON: ${text}`)
  }
  
  if (!response.ok || !json.ok) {
    const errorMessage = json.error || json.message || `HTTP ${response.status}`
    throw new Error(`Failed to load session: ${errorMessage}`)
  }

  // Return the structured session data
  return {
    user: json.user,
    org: json.org
  }
}

/**
 * Permission checking helper
 */
export function can(userPermissions: string[] | undefined, requiredPermission: string | string[]): boolean {
  if (!userPermissions) return false
  if (userPermissions.includes('*')) return true // Admin/Owner wildcard
  
  if (typeof requiredPermission === 'string') {
    return userPermissions.includes(requiredPermission)
  }
  
  // Array of permissions - all required
  return requiredPermission.every(perm => userPermissions.includes(perm))
}

/**
 * Check if user has ANY of the required permissions
 */
export function canAny(userPermissions: string[] | undefined, requiredPermissions: string[]): boolean {
  if (!userPermissions) return false
  if (userPermissions.includes('*')) return true // Admin/Owner wildcard
  
  return requiredPermissions.some(perm => userPermissions.includes(perm))
}