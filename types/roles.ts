// types/roles.ts - Discord-style role and permission system types

export interface Permission {
  id: string
  name: string
  description: string
  category: string
  dangerous?: boolean // For high-privilege permissions
}

export interface Role {
  id: string
  name: string
  description: string
  color: string // Hex color for the role
  priority: number // Higher number = higher role (like Discord)
  permissions: string[] // Array of permission IDs
  mentionable: boolean
  hoisted: boolean // Show separately in member list
  createdAt: string
  updatedAt: string
  userCount: number
}

export interface UserRole {
  userId: string
  roleId: string
  assignedBy: string
  assignedAt: string
}

export interface RoleHierarchy {
  roleId: string
  canManage: string[] // Array of role IDs this role can manage
  canView: string[] // Array of role IDs this role can view
}

// Available permissions in the system
export const PERMISSIONS: Permission[] = [
  // Dashboard & Navigation
  {
    id: 'view_dashboard',
    name: 'View Dashboard',
    description: 'Access the main security dashboard',
    category: 'Dashboard'
  },
  {
    id: 'view_all_emails',
    name: 'View All Emails',
    description: 'Access the all emails page and search functionality',
    category: 'Emails'
  },
  {
    id: 'view_investigations',
    name: 'View Investigations',
    description: 'Access investigations and case details',
    category: 'Investigations'
  },
  {
    id: 'create_investigations',
    name: 'Create Investigations',
    description: 'Create new investigations and cases',
    category: 'Investigations'
  },
  {
    id: 'edit_investigations',
    name: 'Edit Investigations',
    description: 'Modify existing investigations and case details',
    category: 'Investigations'
  },
  {
    id: 'delete_investigations',
    name: 'Delete Investigations',
    description: 'Delete investigations and cases',
    category: 'Investigations',
    dangerous: true
  },

  // Detection Management
  {
    id: 'view_detections',
    name: 'View Detections',
    description: 'View security detections and alerts',
    category: 'Detections'
  },
  {
    id: 'manage_detections',
    name: 'Manage Detections',
    description: 'Flag, unflag, and modify detections',
    category: 'Detections'
  },
  {
    id: 'dismiss_detections',
    name: 'Dismiss Detections',
    description: 'Mark detections as false positives',
    category: 'Detections'
  },

  // User Management
  {
    id: 'view_users',
    name: 'View Users',
    description: 'See user list and basic information',
    category: 'Users'
  },
  {
    id: 'invite_users',
    name: 'Invite Users',
    description: 'Send invitations to new users',
    category: 'Users'
  },
  {
    id: 'manage_user_roles',
    name: 'Manage User Roles',
    description: 'Assign and remove roles from users',
    category: 'Users',
    dangerous: true
  },
  {
    id: 'delete_users',
    name: 'Delete Users',
    description: 'Remove users from the system',
    category: 'Users',
    dangerous: true
  },

  // Role Management
  {
    id: 'view_roles',
    name: 'View Roles',
    description: 'See roles and their permissions',
    category: 'Roles'
  },
  {
    id: 'create_roles',
    name: 'Create Roles',
    description: 'Create new roles',
    category: 'Roles'
  },
  {
    id: 'edit_roles',
    name: 'Edit Roles',
    description: 'Modify existing roles and permissions',
    category: 'Roles',
    dangerous: true
  },
  {
    id: 'delete_roles',
    name: 'Delete Roles',
    description: 'Remove roles from the system',
    category: 'Roles',
    dangerous: true
  },

  // System Administration
  {
    id: 'manage_cloud_services',
    name: 'Manage Cloud Services',
    description: 'Connect and configure cloud services',
    category: 'Administration',
    dangerous: true
  },
  {
    id: 'view_system_settings',
    name: 'View System Settings',
    description: 'Access system configuration pages',
    category: 'Administration'
  },
  {
    id: 'manage_system_settings',
    name: 'Manage System Settings',
    description: 'Modify system configuration',
    category: 'Administration',
    dangerous: true
  },
  {
    id: 'view_audit_logs',
    name: 'View Audit Logs',
    description: 'Access system audit and activity logs',
    category: 'Administration'
  },
  {
    id: 'manage_integrations',
    name: 'Manage Integrations',
    description: 'Configure external integrations and APIs',
    category: 'Administration'
  },

  // AI Copilot
  {
    id: 'use_ai_copilot',
    name: 'Use AI Copilot',
    description: 'Access and interact with the AI security copilot',
    category: 'AI Features'
  },
  {
    id: 'configure_ai_copilot',
    name: 'Configure AI Copilot',
    description: 'Modify AI copilot settings and parameters',
    category: 'AI Features',
    dangerous: true
  },

  // Advanced Features
  {
    id: 'export_data',
    name: 'Export Data',
    description: 'Export emails, investigations, and reports',
    category: 'Data'
  },
  {
    id: 'bulk_operations',
    name: 'Bulk Operations',
    description: 'Perform bulk actions on multiple items',
    category: 'Data'
  },
  {
    id: 'api_access',
    name: 'API Access',
    description: 'Access REST API endpoints programmatically',
    category: 'Developer'
  },
  {
    id: 'manage_api_keys',
    name: 'Manage API Keys',
    description: 'Create and manage API access keys',
    category: 'Developer',
    dangerous: true
  }
]

// Default roles that should exist in every organization
export const DEFAULT_ROLES: Omit<Role, 'id' | 'createdAt' | 'updatedAt' | 'userCount'>[] = [
  {
    name: 'Owner',
    description: 'Full administrative access to everything',
    color: '#ff0000',
    priority: 1000,
    permissions: PERMISSIONS.map(p => p.id), // All permissions
    mentionable: false,
    hoisted: true
  },
  {
    name: 'Admin',
    description: 'Administrative access with most privileges',
    color: '#ff6b35',
    priority: 900,
    permissions: PERMISSIONS.filter(p => p.id !== 'manage_api_keys').map(p => p.id), // All except API key management
    mentionable: true,
    hoisted: true
  },
  {
    name: 'Security Lead',
    description: 'Lead security analyst with management capabilities',
    color: '#f7931e',
    priority: 800,
    permissions: [
      'view_dashboard', 'view_all_emails', 'view_investigations', 'create_investigations',
      'edit_investigations', 'view_detections', 'manage_detections', 'dismiss_detections',
      'view_users', 'invite_users', 'use_ai_copilot', 'export_data', 'bulk_operations',
      'view_system_settings', 'view_audit_logs'
    ],
    mentionable: true,
    hoisted: true
  },
  {
    name: 'Senior Analyst',
    description: 'Experienced security analyst with investigation privileges',
    color: '#ffcc02',
    priority: 700,
    permissions: [
      'view_dashboard', 'view_all_emails', 'view_investigations', 'create_investigations',
      'edit_investigations', 'view_detections', 'manage_detections', 'dismiss_detections',
      'use_ai_copilot', 'export_data'
    ],
    mentionable: true,
    hoisted: false
  },
  {
    name: 'Security Analyst',
    description: 'Standard security analyst with investigation capabilities',
    color: '#00d084',
    priority: 600,
    permissions: [
      'view_dashboard', 'view_all_emails', 'view_investigations', 'create_investigations',
      'view_detections', 'manage_detections', 'use_ai_copilot'
    ],
    mentionable: true,
    hoisted: false
  },
  {
    name: 'Junior Analyst',
    description: 'Entry-level analyst with limited privileges',
    color: '#0099e1',
    priority: 500,
    permissions: [
      'view_dashboard', 'view_all_emails', 'view_investigations', 'view_detections',
      'use_ai_copilot'
    ],
    mentionable: true,
    hoisted: false
  },
  {
    name: 'Viewer',
    description: 'Read-only access to security information',
    color: '#95a5a6',
    priority: 100,
    permissions: [
      'view_dashboard', 'view_all_emails', 'view_investigations', 'view_detections'
    ],
    mentionable: false,
    hoisted: false
  }
]

// Helper functions
export function canManageRole(userRoles: Role[], targetRole: Role): boolean {
  const highestUserRole = userRoles.reduce((highest, role) => 
    role.priority > highest.priority ? role : highest, userRoles[0])
  
  return highestUserRole && highestUserRole.priority > targetRole.priority
}

export function canManageUser(managerRoles: Role[], targetUserRoles: Role[]): boolean {
  const highestManagerRole = managerRoles.reduce((highest, role) => 
    role.priority > highest.priority ? role : highest, managerRoles[0])
  
  const highestTargetRole = targetUserRoles.reduce((highest, role) => 
    role.priority > highest.priority ? role : highest, targetUserRoles[0])
  
  return highestManagerRole && (!highestTargetRole || highestManagerRole.priority > highestTargetRole.priority)
}

export function hasPermission(userRoles: Role[], permission: string): boolean {
  return userRoles.some(role => role.permissions.includes(permission))
}

export function getUserPermissions(userRoles: Role[]): string[] {
  const permissions = new Set<string>()
  userRoles.forEach(role => {
    role.permissions.forEach(permission => permissions.add(permission))
  })
  return Array.from(permissions)
}

export function getRolesByPriority(roles: Role[]): Role[] {
  return [...roles].sort((a, b) => b.priority - a.priority)
}