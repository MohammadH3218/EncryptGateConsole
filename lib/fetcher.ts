import { getOrgContext } from './orgContext'

export async function apiGet(path: string, init: RequestInit = {}) {
  const orgId = getOrgContext()
  const url = new URL(path, window.location.origin)
  
  // Add orgId to URL params if not already present
  if (orgId && !url.searchParams.has('orgId')) {
    url.searchParams.set('orgId', orgId)
  }
  
  // Add orgId to headers if not already present
  const headers = new Headers(init.headers)
  if (orgId && !headers.has('x-org-id')) {
    headers.set('x-org-id', orgId)
  }
  
  return fetch(url.toString(), { ...init, headers })
}

export async function apiPost(path: string, body?: any, init: RequestInit = {}) {
  return apiRequest('POST', path, body, init)
}

export async function apiPut(path: string, body?: any, init: RequestInit = {}) {
  return apiRequest('PUT', path, body, init)
}

export async function apiDelete(path: string, init: RequestInit = {}) {
  return apiRequest('DELETE', path, undefined, init)
}

async function apiRequest(method: string, path: string, body?: any, init: RequestInit = {}) {
  const orgId = getOrgContext()
  const url = new URL(path, window.location.origin)
  
  // Add orgId to URL params if not already present
  if (orgId && !url.searchParams.has('orgId')) {
    url.searchParams.set('orgId', orgId)
  }
  
  // Add orgId to headers if not already present
  const headers = new Headers(init.headers)
  if (orgId && !headers.has('x-org-id')) {
    headers.set('x-org-id', orgId)
  }
  
  // Set content type for JSON requests
  if (body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  
  return fetch(url.toString(), { 
    ...init, 
    method,
    headers,
    body: body ? JSON.stringify(body) : init.body
  })
}