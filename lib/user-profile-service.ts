import { jwtVerify } from 'jose'

export interface UserProfile {
  id: string
  email: string
  name?: string
  preferred_username?: string
  role: 'admin' | 'analyst' | 'security_lead'
  permissions: string[]
  assignedInvestigations: Investigation[]
  continuedInvestigations: Investigation[]
  completedInvestigations: Investigation[]
  createdAt: string
  lastActive: string
}

export interface Investigation {
  id: string
  uniqueId: string
  emailId: string
  emailSubject: string
  sender: string
  severity: 'Critical' | 'High' | 'Medium' | 'Low'
  status: 'new' | 'in_progress' | 'completed' | 'escalated' | 'blocked'
  assignedTo: string[]
  assignedBy?: string
  startedAt: string
  lastUpdated: string
  completedAt?: string
  notes: string[]
  escalatedToAdmin: boolean
  escalatedBy?: string
  escalationReason?: string
  conflictWarnings: ConflictWarning[]
}

export interface ConflictWarning {
  type: 'multiple_investigators' | 'already_assigned'
  message: string
  users: string[]
  timestamp: string
}

export interface Assignment {
  id: string
  uniqueId: string
  title: string
  description: string
  severity: 'Critical' | 'High' | 'Medium' | 'Low'
  status: 'new' | 'in_progress' | 'completed' | 'escalated'
  assignedTo: string[]
  assignedBy: string
  createdAt: string
  dueDate?: string
  priority: number
  tags: string[]
  relatedEmails: string[]
}

export interface BlockedEmail {
  id: string
  email: string
  reason: 'manual_block' | 'ai_detection' | 'security_team_block' | 'admin_block'
  blockedBy: string
  blockedAt: string
  severity: 'Critical' | 'High' | 'Medium' | 'Low'
  orgInteractions: number
  lastInteraction?: string
  notes?: string
}

export interface PushedRequest {
  id: string
  originalInvestigationId: string
  emailSubject: string
  sender: string
  severity: 'Critical' | 'High' | 'Medium' | 'Low'
  pushedBy: string
  pushedAt: string
  reason: string
  status: 'pending' | 'in_review' | 'completed' | 'rejected'
  reviewedBy?: string
  reviewedAt?: string
  adminNotes?: string
}

class UserProfileService {
  private profiles: Map<string, UserProfile> = new Map()
  private investigations: Map<string, Investigation> = new Map()
  private assignments: Map<string, Assignment> = new Map()
  private blockedEmails: Map<string, BlockedEmail> = new Map()
  private pushedRequests: Map<string, PushedRequest> = new Map()

  // Initialize default roles and permissions
  private readonly DEFAULT_PERMISSIONS = {
    admin: [
      'view_all_investigations',
      'assign_investigations',
      'escalate_investigations',
      'manage_users',
      'manage_roles',
      'view_pushed_requests',
      'review_pushed_requests',
      'block_emails',
      'manage_blocked_emails',
      'view_all_assignments',
      'create_assignments',
      'manage_employees'
    ],
    security_lead: [
      'view_team_investigations',
      'assign_investigations',
      'escalate_investigations',
      'view_assignments',
      'create_assignments',
      'push_to_admin',
      'block_emails',
      'view_blocked_emails'
    ],
    analyst: [
      'view_own_investigations',
      'update_investigations',
      'push_to_admin',
      'view_own_assignments',
      'view_blocked_emails'
    ]
  }

  // Get or create user profile from JWT token
  async getUserProfile(token: string): Promise<UserProfile> {
    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key')
      const { payload } = await jwtVerify(token, secret)
      
      const userId = payload.sub || payload.email as string
      const email = payload.email as string
      const name = payload.name as string || payload.preferred_username as string
      const preferred_username = payload.preferred_username as string

      // Check if profile exists, create if not
      if (!this.profiles.has(userId)) {
        const newProfile: UserProfile = {
          id: userId,
          email,
          name,
          preferred_username,
          role: 'analyst', // Default role
          permissions: this.DEFAULT_PERMISSIONS.analyst,
          assignedInvestigations: [],
          continuedInvestigations: [],
          completedInvestigations: [],
          createdAt: new Date().toISOString(),
          lastActive: new Date().toISOString()
        }
        this.profiles.set(userId, newProfile)
      }

      // Update last active
      const profile = this.profiles.get(userId)!
      profile.lastActive = new Date().toISOString()
      
      return profile
    } catch (error) {
      throw new Error('Invalid token')
    }
  }

  // Update user role and permissions
  updateUserRole(userId: string, role: UserProfile['role']): UserProfile | null {
    const profile = this.profiles.get(userId)
    if (!profile) return null

    profile.role = role
    profile.permissions = this.DEFAULT_PERMISSIONS[role]
    return profile
  }

  // Check if user has permission
  hasPermission(userId: string, permission: string): boolean {
    const profile = this.profiles.get(userId)
    if (!profile) return false
    return profile.permissions.includes(permission)
  }

  // Investigation management
  createInvestigation(data: Omit<Investigation, 'id' | 'startedAt' | 'lastUpdated' | 'conflictWarnings'>): Investigation {
    const investigation: Investigation = {
      ...data,
      id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      conflictWarnings: []
    }
    
    this.investigations.set(investigation.id, investigation)
    
    // Add to assigned users' profiles
    investigation.assignedTo.forEach(userId => {
      const profile = this.profiles.get(userId)
      if (profile) {
        profile.assignedInvestigations.push(investigation)
      }
    })
    
    return investigation
  }

  // Assign investigation with conflict detection
  assignInvestigation(investigationId: string, assignToUserId: string, assignedBy: string): { success: boolean, warnings: ConflictWarning[] } {
    const investigation = this.investigations.get(investigationId)
    if (!investigation) return { success: false, warnings: [] }

    const warnings: ConflictWarning[] = []

    // Check if already assigned to someone else
    if (investigation.assignedTo.length > 0 && !investigation.assignedTo.includes(assignToUserId)) {
      const warning: ConflictWarning = {
        type: 'multiple_investigators',
        message: `This investigation is already being worked on by ${investigation.assignedTo.length} other user(s)`,
        users: investigation.assignedTo,
        timestamp: new Date().toISOString()
      }
      warnings.push(warning)
      investigation.conflictWarnings.push(warning)
    }

    // Add user to investigation
    if (!investigation.assignedTo.includes(assignToUserId)) {
      investigation.assignedTo.push(assignToUserId)
      investigation.status = 'in_progress'
      investigation.lastUpdated = new Date().toISOString()

      // Add to user's profile
      const profile = this.profiles.get(assignToUserId)
      if (profile) {
        profile.assignedInvestigations.push(investigation)
      }
    }

    return { success: true, warnings }
  }

  // Get user's investigations
  getUserInvestigations(userId: string): {
    assigned: Investigation[]
    continued: Investigation[]
    completed: Investigation[]
  } {
    const profile = this.profiles.get(userId)
    if (!profile) return { assigned: [], continued: [], completed: [] }

    const assigned = Array.from(this.investigations.values()).filter(
      inv => inv.assignedTo.includes(userId) && inv.status !== 'completed'
    )

    const continued = assigned.filter(inv => inv.status === 'in_progress')
    const completed = Array.from(this.investigations.values()).filter(
      inv => inv.assignedTo.includes(userId) && inv.status === 'completed'
    )

    return { assigned, continued, completed }
  }

  // Assignment management
  createAssignment(data: Omit<Assignment, 'id' | 'createdAt'>): Assignment {
    const assignment: Assignment = {
      ...data,
      id: `asn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString()
    }
    
    this.assignments.set(assignment.id, assignment)
    return assignment
  }

  getUserAssignments(userId: string): Assignment[] {
    return Array.from(this.assignments.values()).filter(
      assignment => assignment.assignedTo.includes(userId)
    ).sort((a, b) => {
      // Priority: in_progress first, then by priority number, then by creation date
      if (a.status === 'in_progress' && b.status !== 'in_progress') return -1
      if (b.status === 'in_progress' && a.status !== 'in_progress') return 1
      if (a.priority !== b.priority) return a.priority - b.priority
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }

  // Push request to admin
  pushToAdmin(investigationId: string, pushedBy: string, reason: string): PushedRequest {
    const investigation = this.investigations.get(investigationId)
    if (!investigation) throw new Error('Investigation not found')

    const pushedRequest: PushedRequest = {
      id: `push_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      originalInvestigationId: investigationId,
      emailSubject: investigation.emailSubject,
      sender: investigation.sender,
      severity: investigation.severity,
      pushedBy,
      pushedAt: new Date().toISOString(),
      reason,
      status: 'pending'
    }

    this.pushedRequests.set(pushedRequest.id, pushedRequest)
    
    // Update investigation status
    investigation.status = 'escalated'
    investigation.escalatedToAdmin = true
    investigation.escalatedBy = pushedBy
    investigation.escalationReason = reason
    investigation.lastUpdated = new Date().toISOString()

    return pushedRequest
  }

  // Blocked email management
  blockEmail(email: string, reason: BlockedEmail['reason'], blockedBy: string, notes?: string): BlockedEmail {
    const blockedEmail: BlockedEmail = {
      id: `blk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      email,
      reason,
      blockedBy,
      blockedAt: new Date().toISOString(),
      severity: 'Medium', // Default severity
      orgInteractions: 0, // This would be populated from email analysis
      notes
    }

    this.blockedEmails.set(email, blockedEmail)
    return blockedEmail
  }

  // Get all data for different views
  getAllPushedRequests(): PushedRequest[] {
    return Array.from(this.pushedRequests.values()).sort(
      (a, b) => new Date(b.pushedAt).getTime() - new Date(a.pushedAt).getTime()
    )
  }

  getAllBlockedEmails(): BlockedEmail[] {
    return Array.from(this.blockedEmails.values()).sort(
      (a, b) => new Date(b.blockedAt).getTime() - new Date(a.blockedAt).getTime()
    )
  }

  getAllUsers(): UserProfile[] {
    return Array.from(this.profiles.values())
  }

  getAllInvestigations(): Investigation[] {
    return Array.from(this.investigations.values())
  }

  getAllAssignments(): Assignment[] {
    return Array.from(this.assignments.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }
}
  // Update a pushed request status (accept -> in_review, deny -> rejected, complete -> completed)
  reviewPushedRequest(id: string, action: 'accept' | 'deny' | 'complete', reviewedBy: string, notes?: string): PushedRequest | null {
    const req = this.pushedRequests.get(id)
    if (!req) return null

    if (action === 'accept') {
      req.status = 'in_review'
    } else if (action === 'deny') {
      req.status = 'rejected'
    } else if (action === 'complete') {
      req.status = 'completed'
    }
    req.reviewedBy = reviewedBy
    req.reviewedAt = new Date().toISOString()
    if (notes) req.adminNotes = notes

    this.pushedRequests.set(req.id, req)
    return req
  }

  getRecentPushedRequests(limit = 5, status: PushedRequest['status'] | 'any' = 'pending'): PushedRequest[] {
    const all = this.getAllPushedRequests()
    const filtered = status === 'any' ? all : all.filter(r => r.status === status)
    return filtered.slice(0, limit)
    // Update a pushed request status (accept -> in_review, deny -> rejected, complete -> completed)
  reviewPushedRequest(id: string, action: 'accept' | 'deny' | 'complete', reviewedBy: string, notes?: string): PushedRequest | null {
    const req = this.pushedRequests.get(id)
    if (!req) return null

    if (action === 'accept') {
      req.status = 'in_review'
    } else if (action === 'deny') {
      req.status = 'rejected'
    } else if (action === 'complete') {
      req.status = 'completed'
    }
    req.reviewedBy = reviewedBy
    req.reviewedAt = new Date().toISOString()
    if (notes) req.adminNotes = notes

    this.pushedRequests.set(req.id, req)
    return req
  }

  getRecentPushedRequests(limit = 5, status: PushedRequest['status'] | 'any' = 'pending'): PushedRequest[] {
    const all = this.getAllPushedRequests()
    const filtered = status === 'any' ? all : all.filter(r => r.status === status)
    return filtered.slice(0, limit)
  }}


// Export singleton instance
export const userProfileService = new UserProfileService()
