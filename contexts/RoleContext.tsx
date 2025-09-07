"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Role, hasPermission, getUserPermissions } from '@/types/roles'

interface User {
  id: string
  email: string
  name: string
  roles: Role[]
  role?: string // Single role for backward compatibility
  organizationId?: string
  organizationName?: string
}

interface RoleContextType {
  user: User | null
  roles: Role[]
  permissions: string[]
  organizationId: string | null
  organizationName: string | null
  hasPermission: (permission: string) => boolean
  canAccess: (requiredPermissions: string[]) => boolean
  isAdmin: () => boolean
  isOwner: () => boolean
  updateUserRole: (newRole: string) => void
  refreshUser: () => void
  loading: boolean
}

const RoleContext = createContext<RoleContextType | undefined>(undefined)

interface RoleProviderProps {
  children: ReactNode
}

export function RoleProvider({ children }: RoleProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [organizationName, setOrganizationName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch user profile and roles
  const fetchUserProfile = async () => {
    try {
      const token = localStorage.getItem('access_token')
      if (!token) {
        setLoading(false)
        return
      }

      // Fetch user profile
      const userResponse = await fetch('/api/user/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (userResponse.ok) {
        const userData = await userResponse.json()
        
        // Fetch available roles
        const rolesResponse = await fetch('/api/company-settings/roles')
        let availableRoles: Role[] = []
        
        if (rolesResponse.ok) {
          const rolesData = await rolesResponse.json()
          availableRoles = rolesData.roles || []
        }

        // Map user role to Role objects
        const userRoles = availableRoles.filter(role => 
          userData.role === role.name || userData.roles?.includes(role.name)
        )

        // Extract organization context
        const orgId = userData.organizationId || process.env.NEXT_PUBLIC_ORGANIZATION_ID || 'default-org'
        const orgName = userData.organizationName || localStorage.getItem('organization_name') || 'Your Organization'
        
        setUser({
          ...userData,
          roles: userRoles,
          organizationId: orgId,
          organizationName: orgName
        })
        setRoles(availableRoles)
        setOrganizationId(orgId)
        setOrganizationName(orgName)
      }
    } catch (error) {
      console.error('Error fetching user profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateUserRole = (newRole: string) => {
    if (!user) return
    
    const newRoleObj = roles.find(role => role.name === newRole)
    if (newRoleObj) {
      setUser({
        ...user,
        role: newRole,
        roles: [newRoleObj]
      })
    }
  }

  useEffect(() => {
    fetchUserProfile()
  }, [])

  const permissions = user ? getUserPermissions(user.roles) : []

  const contextValue: RoleContextType = {
    user,
    roles,
    permissions,
    organizationId,
    organizationName,
    hasPermission: (permission: string) => {
      return user ? hasPermission(user.roles, permission) : false
    },
    canAccess: (requiredPermissions: string[]) => {
      if (!user) return false
      return requiredPermissions.every(permission => 
        hasPermission(user.roles, permission)
      )
    },
    isAdmin: () => {
      return user?.roles.some(role => 
        ['Owner', 'Admin'].includes(role.name)
      ) || false
    },
    isOwner: () => {
      return user?.roles.some(role => role.name === 'Owner') || false
    },
    updateUserRole,
    refreshUser: fetchUserProfile,
    loading
  }

  return (
    <RoleContext.Provider value={contextValue}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  const context = useContext(RoleContext)
  if (context === undefined) {
    throw new Error('useRole must be used within a RoleProvider')
  }
  return context
}

// Helper component for conditional rendering based on permissions
interface PermissionGateProps {
  permissions?: string[]
  roles?: string[]
  requireAll?: boolean
  fallback?: ReactNode
  children: ReactNode
}

export function PermissionGate({ 
  permissions = [], 
  roles = [], 
  requireAll = true, 
  fallback = null, 
  children 
}: PermissionGateProps) {
  const { hasPermission, user } = useRole()

  const hasRequiredPermissions = permissions.length === 0 || (
    requireAll 
      ? permissions.every(permission => hasPermission(permission))
      : permissions.some(permission => hasPermission(permission))
  )

  const hasRequiredRoles = roles.length === 0 || (
    requireAll
      ? roles.every(roleName => user?.roles.some(role => role.name === roleName))
      : roles.some(roleName => user?.roles.some(role => role.name === roleName))
  )

  const canRender = hasRequiredPermissions && hasRequiredRoles

  return <>{canRender ? children : fallback}</>
}