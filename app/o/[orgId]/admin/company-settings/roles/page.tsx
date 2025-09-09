"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { useRouter, useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator 
} from "@/components/ui/dropdown-menu"
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  Shield, 
  Users, 
  Settings, 
  MoreHorizontal, 
  Edit, 
  Crown, 
  UserCog,
  Search,
  RefreshCw,
  Loader2,
  Info
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { ScrollArea } from "@/components/ui/scroll-area"

interface User {
  id: string
  email: string
  name: string
  role: string
  status: string
  lastLogin?: string
  customPermissions?: string[]
}

// Predefined role hierarchy
const ROLE_HIERARCHY = [
  {
    name: "Owner",
    icon: Crown,
    description: "Full access to all features and settings. Can manage all users and permissions.",
    color: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    permissions: ["*"] // Wildcard - all permissions
  },
  {
    name: "Sr. Admin", 
    icon: Shield,
    description: "Senior administrator with full access. Can manage company settings and user permissions.",
    color: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    permissions: ["*"] // Wildcard - all permissions
  },
  {
    name: "Admin",
    icon: UserCog,
    description: "Administrator access to main features and pushed requests. Cannot access company settings.",
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    permissions: [
      "dashboard.read", "detections.read", "detections.update", "detections.create",
      "assignments.read", "assignments.update", "assignments.create",
      "team.read", "investigations.read", "investigations.update",
      "blocked_emails.read", "blocked_emails.create",
      "pushed_requests.read", "manage_employees.read"
    ]
  },
  {
    name: "Analyst",
    icon: Users,
    description: "Access to main security features. Can view and manage detections, investigations, and employees.",
    color: "bg-green-500/10 text-green-500 border-green-500/20", 
    permissions: [
      "dashboard.read", "detections.read", "detections.update", "detections.create",
      "assignments.read", "assignments.update", "assignments.create",
      "team.read", "investigations.read", "investigations.update",
      "blocked_emails.read", "blocked_emails.create", "manage_employees.read"
    ]
  },
  {
    name: "Viewer",
    icon: Settings,
    description: "Limited access to personal settings only. Can view profile, notifications, and security settings.",
    color: "bg-gray-500/10 text-gray-500 border-gray-500/20",
    permissions: [
      "profile.read", "profile.update",
      "notifications.read", "notifications.update", 
      "security.read", "security.update"
    ]
  }
]

// All available permissions for custom permission editing
const ALL_PERMISSIONS = [
  { category: "Dashboard", permissions: ["dashboard.read"] },
  { category: "Detections", permissions: ["detections.read", "detections.update", "detections.create"] },
  { category: "Assignments", permissions: ["assignments.read", "assignments.update", "assignments.create"] },
  { category: "Team", permissions: ["team.read"] },
  { category: "Investigations", permissions: ["investigations.read", "investigations.update"] },
  { category: "Blocked Emails", permissions: ["blocked_emails.read", "blocked_emails.create"] },
  { category: "Pushed Requests", permissions: ["pushed_requests.read"] },
  { category: "Manage Employees", permissions: ["manage_employees.read"] },
  { category: "Company Settings", permissions: ["company_settings.read"] },
  { category: "Profile", permissions: ["profile.read", "profile.update"] },
  { category: "Notifications", permissions: ["notifications.read", "notifications.update"] },
  { category: "Security", permissions: ["security.read", "security.update"] }
]

export default function RolesPermissionsPage() {
  const router = useRouter()
  const params = useParams()
  const { toast } = useToast()

  // State
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  
  // Dialog states
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false)
  const [isPermissionDialogOpen, setIsPermissionDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [selectedRole, setSelectedRole] = useState("")
  const [customPermissions, setCustomPermissions] = useState<string[]>([])

  // Load users from the Security Team Users table
  const loadUsers = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const response = await fetch('/api/company-settings/users', {
        headers: {
          'x-org-id': params.orgId as string
        }
      })
      
      if (!response.ok) {
        throw new Error(`Failed to load users: ${response.statusText}`)
      }
      
      const data = await response.json()
      setUsers(data.users || [])
    } catch (err: any) {
      console.error('Error loading users:', err)
      setError(err)
    } finally {
      setIsLoading(false)
    }
  }

  // Update user role
  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      const response = await fetch(`/api/company-settings/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': params.orgId as string
        },
        body: JSON.stringify({ role: newRole })
      })
      
      if (!response.ok) {
        throw new Error(`Failed to update role: ${response.statusText}`)
      }
      
      // Refresh users list
      await loadUsers()
      toast({
        title: "Role Updated",
        description: `User role has been updated to ${newRole}`,
      })
    } catch (err: any) {
      console.error('Error updating role:', err)
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive"
      })
    }
  }

  // Update user custom permissions
  const updateUserPermissions = async (userId: string, permissions: string[]) => {
    try {
      const response = await fetch(`/api/company-settings/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': params.orgId as string
        },
        body: JSON.stringify({ customPermissions: permissions })
      })
      
      if (!response.ok) {
        throw new Error(`Failed to update permissions: ${response.statusText}`)
      }
      
      // Refresh users list
      await loadUsers()
      toast({
        title: "Permissions Updated",
        description: "User permissions have been updated successfully",
      })
    } catch (err: any) {
      console.error('Error updating permissions:', err)
      toast({
        title: "Error", 
        description: err.message,
        variant: "destructive"
      })
    }
  }

  // Handle role change
  const handleRoleChange = async () => {
    if (!selectedUser || !selectedRole) return
    
    await updateUserRole(selectedUser.id, selectedRole)
    setIsRoleDialogOpen(false)
    setSelectedUser(null)
    setSelectedRole("")
  }

  // Handle permission change
  const handlePermissionChange = async () => {
    if (!selectedUser) return
    
    await updateUserPermissions(selectedUser.id, customPermissions)
    setIsPermissionDialogOpen(false)
    setSelectedUser(null)
    setCustomPermissions([])
  }

  // Open role change dialog
  const openRoleDialog = (user: User) => {
    setSelectedUser(user)
    setSelectedRole(user.role)
    setIsRoleDialogOpen(true)
  }

  // Open permission edit dialog
  const openPermissionDialog = (user: User) => {
    setSelectedUser(user)
    setCustomPermissions(user.customPermissions || [])
    setIsPermissionDialogOpen(true)
  }

  // Get role info
  const getRoleInfo = (roleName: string) => {
    return ROLE_HIERARCHY.find(role => role.name === roleName) || ROLE_HIERARCHY[4] // Default to Viewer
  }

  // Filter users based on search
  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.role.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Load users on component mount
  useEffect(() => {
    loadUsers()
  }, [params.orgId])

  if (isLoading) {
    return (
      <AppLayout notificationsCount={0}>
        <FadeInSection>
          <div className="flex items-center justify-center min-h-64">
            <div className="text-center space-y-4">
              <Loader2 className="w-8 h-8 text-white animate-spin mx-auto" />
              <div className="text-white text-lg font-medium">Loading roles and permissions...</div>
            </div>
          </div>
        </FadeInSection>
      </AppLayout>
    )
  }

  return (
    <AppLayout notificationsCount={0}>
      <FadeInSection>
        <div className="space-y-8">
          <Alert className="bg-blue-900/20 border-blue-500/20 text-white">
            <Shield className="h-4 w-4" />
            <AlertTitle className="text-white">Roles & Permissions</AlertTitle>
            <AlertDescription className="text-gray-300">
              Manage user roles and permissions. Owner and Sr. Admin can assign roles and customize permissions for individual users.
            </AlertDescription>
          </Alert>

          {/* Role Hierarchy Overview */}
          <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Shield className="h-5 w-5 text-white" />
                Role Hierarchy
              </CardTitle>
              <CardDescription className="text-gray-400">
                Understanding the role-based access control system
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {ROLE_HIERARCHY.map((role, index) => {
                  const Icon = role.icon
                  return (
                    <div key={role.name} className="p-4 rounded-lg border border-[#1f1f1f] bg-[#0a0a0a]">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="h-4 w-4" />
                        <span className="font-medium text-sm">{role.name}</span>
                      </div>
                      <p className="text-xs text-gray-400 leading-relaxed">{role.description}</p>
                      {role.permissions[0] === "*" ? (
                        <Badge variant="outline" className="mt-2 text-xs bg-green-500/10 text-green-500 border-green-500/20">
                          Full Access
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="mt-2 text-xs bg-blue-500/10 text-blue-500 border-blue-500/20">
                          {role.permissions.length} permissions
                        </Badge>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* User Management */}
          <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Users className="h-5 w-5 text-white" />
                    Security Team Users
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    Manage roles and permissions for security team members
                  </CardDescription>
                </div>
                <Button
                  onClick={loadUsers}
                  disabled={isLoading}
                  variant="outline"
                  className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Search */}
              <div className="flex items-center space-x-2 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users by name, email, or role..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 bg-[#1f1f1f] border-[#1f1f1f] text-white"
                  />
                </div>
              </div>

              {/* Error state */}
              {error && (
                <Alert variant="destructive" className="mb-6">
                  <AlertTitle>Error loading users</AlertTitle>
                  <AlertDescription>{error.message}</AlertDescription>
                </Alert>
              )}

              {/* Users table */}
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-[#1f1f1f] border-[#1f1f1f]">
                    <TableHead className="text-white">User</TableHead>
                    <TableHead className="text-white">Role</TableHead>
                    <TableHead className="text-white">Status</TableHead>
                    <TableHead className="text-white">Custom Permissions</TableHead>
                    <TableHead className="text-white">Last Login</TableHead>
                    <TableHead className="text-right text-white">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map((user: User) => {
                      const roleInfo = getRoleInfo(user.role)
                      const Icon = roleInfo.icon
                      
                      return (
                        <TableRow key={user.id} className="hover:bg-[#1f1f1f] border-[#1f1f1f]">
                          <TableCell>
                            <div>
                              <div className="font-medium text-white">{user.name || user.email}</div>
                              <div className="text-sm text-gray-400">{user.email}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={roleInfo.color}>
                              <Icon className="mr-1 h-3 w-3" />
                              {user.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={user.status === "active" ? "default" : "secondary"}
                              className={
                                user.status === "active"
                                  ? "bg-green-500/10 text-green-500 border-green-500/20"
                                  : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                              }
                            >
                              {user.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {user.customPermissions && user.customPermissions.length > 0 ? (
                              <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">
                                {user.customPermissions.length} custom
                              </Badge>
                            ) : (
                              <span className="text-gray-500 text-sm">Default</span>
                            )}
                          </TableCell>
                          <TableCell className="text-white">
                            {user.lastLogin
                              ? new Date(user.lastLogin).toLocaleString()
                              : "Never"}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-[#0f0f0f] border-[#1f1f1f]">
                                <DropdownMenuLabel className="text-white">Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator className="bg-[#1f1f1f]" />
                                <DropdownMenuItem 
                                  onClick={() => openRoleDialog(user)}
                                  className="text-white hover:bg-[#1f1f1f]"
                                >
                                  <UserCog className="mr-2 h-4 w-4" />
                                  Change Role
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => openPermissionDialog(user)}
                                  className="text-white hover:bg-[#1f1f1f]"
                                >
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit Permissions
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-gray-400 py-8">
                        {searchQuery ? "No users found matching your search" : "No security team users found"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Change Role Dialog */}
          <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
            <DialogContent className="bg-[#0f0f0f] border-[#1f1f1f] text-white max-w-md">
              <DialogHeader>
                <DialogTitle className="text-white">Change User Role</DialogTitle>
                <DialogDescription className="text-gray-400">
                  Update the role for {selectedUser?.name || selectedUser?.email}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-white">Select New Role</Label>
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger className="bg-[#1f1f1f] border-[#1f1f1f] text-white">
                      <SelectValue placeholder="Choose a role" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0f0f0f] border-[#1f1f1f]">
                      {ROLE_HIERARCHY.map(role => {
                        const Icon = role.icon
                        return (
                          <SelectItem 
                            key={role.name} 
                            value={role.name}
                            className="text-white hover:bg-[#1f1f1f]"
                          >
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              <div>
                                <div className="font-medium">{role.name}</div>
                                <div className="text-xs text-gray-400">{role.description}</div>
                              </div>
                            </div>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => setIsRoleDialogOpen(false)}
                  className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a]"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleRoleChange}
                  disabled={!selectedRole}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Update Role
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Permissions Dialog */}
          <Dialog open={isPermissionDialogOpen} onOpenChange={setIsPermissionDialogOpen}>
            <DialogContent className="bg-[#0f0f0f] border-[#1f1f1f] text-white max-w-2xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle className="text-white">Edit Custom Permissions</DialogTitle>
                <DialogDescription className="text-gray-400">
                  Customize permissions for {selectedUser?.name || selectedUser?.email}. These will override the default role permissions.
                </DialogDescription>
              </DialogHeader>
              
              <ScrollArea className="max-h-[400px] pr-4">
                <div className="space-y-6">
                  <Alert className="bg-orange-900/20 border-orange-500/20 text-white">
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-gray-300">
                      Custom permissions override role-based permissions. Leave empty to use default role permissions.
                    </AlertDescription>
                  </Alert>

                  {ALL_PERMISSIONS.map(category => (
                    <div key={category.category} className="space-y-2">
                      <Label className="text-white font-medium">{category.category}</Label>
                      <div className="grid grid-cols-1 gap-2">
                        {category.permissions.map(permission => (
                          <div key={permission} className="flex items-center space-x-2">
                            <Checkbox
                              id={permission}
                              checked={customPermissions.includes(permission)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setCustomPermissions(prev => [...prev, permission])
                                } else {
                                  setCustomPermissions(prev => prev.filter(p => p !== permission))
                                }
                              }}
                            />
                            <Label 
                              htmlFor={permission} 
                              className="text-sm text-gray-300 cursor-pointer"
                            >
                              {permission.replace(/\./g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => setIsPermissionDialogOpen(false)}
                  className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a]"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handlePermissionChange}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Update Permissions
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </FadeInSection>
    </AppLayout>
  )
}