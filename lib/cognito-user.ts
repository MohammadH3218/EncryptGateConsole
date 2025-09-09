"use client"

export interface CognitoUserData {
  id: string
  email: string
  name?: string
  preferred_username?: string
  given_name?: string
  family_name?: string
  nickname?: string
  email_verified?: boolean
}

export function extractUserFromIdToken(idToken: string): CognitoUserData | null {
  try {
    // Decode JWT token manually (client-side safe)
    const parts = idToken.split('.')
    if (parts.length !== 3) return null
    
    const payload = JSON.parse(atob(parts[1]))
    
    return {
      id: payload.sub || payload.email,
      email: payload.email || '',
      name: payload.name,
      preferred_username: payload.preferred_username,
      given_name: payload.given_name,
      family_name: payload.family_name,
      nickname: payload.nickname,
      email_verified: payload.email_verified === 'true' || payload.email_verified === true
    }
  } catch (error) {
    console.error('Failed to decode ID token:', error)
    return null
  }
}

export function getDisplayName(userData: CognitoUserData): string {
  return (
    userData.preferred_username ||
    userData.name ||
    userData.given_name ||
    userData.nickname ||
    userData.email?.split('@')[0] ||
    'User'
  )
}

export function getUserFromLocalStorage(): CognitoUserData | null {
  try {
    const idToken = localStorage.getItem('id_token')
    if (!idToken) return null
    
    return extractUserFromIdToken(idToken)
  } catch (error) {
    console.error('Failed to get user from localStorage:', error)
    return null
  }
}