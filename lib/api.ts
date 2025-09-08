/**
 * API Helper - Standardized API calls with proper authentication headers
 */

export interface ApiResponse<T = any> {
  ok: boolean
  data?: T
  error?: string
  message?: string
}

// Helper to safely parse JSON responses
export async function safeJson(response: Response): Promise<any> {
  const text = await response.text()
  let json: any = {}
  
  try {
    json = text ? JSON.parse(text) : {}
  } catch (error) {
    throw new Error(`API returned non-JSON response (status ${response.status}): ${text}`)
  }
  
  if (!response.ok) {
    const errorMessage = json?.error || json?.message || `HTTP ${response.status}`
    throw new Error(errorMessage)
  }
  
  return json
}

// Extract org ID from current pathname
export function getOrgIdFromPath(): string | null {
  if (typeof window === 'undefined') return null
  
  const pathSegments = window.location.pathname.split('/')
  if (pathSegments[1] === 'o' && pathSegments[2]) {
    return pathSegments[2]
  }
  return null
}

// Get stored tokens from localStorage
export function getAuthTokens() {
  if (typeof window === 'undefined') return { accessToken: null, idToken: null }
  
  return {
    accessToken: localStorage.getItem('access_token'),
    idToken: localStorage.getItem('id_token')
  }
}

// Make authenticated API GET request
export async function apiGet(path: string, options: RequestInit = {}): Promise<any> {
  const { accessToken } = getAuthTokens()
  const orgId = getOrgIdFromPath()
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  }
  
  // Add authorization header if token available
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }
  
  // Add org ID header if available
  if (orgId) {
    headers['x-org-id'] = orgId
  }
  
  const response = await fetch(path, {
    method: 'GET',
    headers,
    credentials: 'include',
    cache: 'no-store',
    ...options
  })
  
  return safeJson(response)
}

// Make authenticated API POST request
export async function apiPost(path: string, data: any = {}, options: RequestInit = {}): Promise<any> {
  const { accessToken } = getAuthTokens()
  const orgId = getOrgIdFromPath()
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  }
  
  // Add authorization header if token available
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }
  
  // Add org ID header if available
  if (orgId) {
    headers['x-org-id'] = orgId
  }
  
  const response = await fetch(path, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(data),
    ...options
  })
  
  return safeJson(response)
}

// Make authenticated API PUT request
export async function apiPut(path: string, data: any = {}, options: RequestInit = {}): Promise<any> {
  const { accessToken } = getAuthTokens()
  const orgId = getOrgIdFromPath()
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  }
  
  // Add authorization header if token available
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }
  
  // Add org ID header if available
  if (orgId) {
    headers['x-org-id'] = orgId
  }
  
  const response = await fetch(path, {
    method: 'PUT',
    headers,
    credentials: 'include',
    body: JSON.stringify(data),
    ...options
  })
  
  return safeJson(response)
}

// Make authenticated API DELETE request
export async function apiDelete(path: string, options: RequestInit = {}): Promise<any> {
  const { accessToken } = getAuthTokens()
  const orgId = getOrgIdFromPath()
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  }
  
  // Add authorization header if token available
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }
  
  // Add org ID header if available
  if (orgId) {
    headers['x-org-id'] = orgId
  }
  
  const response = await fetch(path, {
    method: 'DELETE',
    headers,
    credentials: 'include',
    ...options
  })
  
  return safeJson(response)
}

// Helper to check if user is authenticated
export function isAuthenticated(): boolean {
  const { accessToken } = getAuthTokens()
  return !!accessToken
}

// Helper for permission checking
export function can(userPermissions: string[] | undefined, requiredPermission: string | string[]): boolean {
  if (!userPermissions) return false
  if (userPermissions.includes('*')) return true // Admin/Owner wildcard
  
  if (typeof requiredPermission === 'string') {
    return userPermissions.includes(requiredPermission)
  }
  
  // Array of permissions - all required
  return requiredPermission.every(perm => userPermissions.includes(perm))
}

// Helper for "any permission" checking
export function canAny(userPermissions: string[] | undefined, requiredPermissions: string[]): boolean {
  if (!userPermissions) return false
  if (userPermissions.includes('*')) return true // Admin/Owner wildcard
  
  return requiredPermissions.some(perm => userPermissions.includes(perm))
}