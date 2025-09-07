"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { useRouter, useSearchParams } from "next/navigation"
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Cloud, MoreHorizontal, Plus, Search, Shield, Crown, Mail, UserPlus, Settings, Trash2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Role, Permission, PERMISSIONS, getUserPermissions, canManageRole } from "@/types/roles"
import { Separator } from "@/components/ui/separator"

interface User {
  id: string
  name: string
  email: string
  roles: Role[]
  status: string
  lastLogin?: string
}

interface Invitation {
  id: string
  email: string
  name: string
  roleIds: string[]
  invitedBy: string
  invitedAt: string
  expiresAt: string
  status: string
}

export default function RolesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const userId = searchParams.get("user")
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [permissions] = useState<Permission[]>(PERMISSIONS)
  const [connectedServices] = useState([{ type: 'cognito' }]) // Mock connected service
  const [isAddRoleDialogOpen, setIsAddRoleDialogOpen] = useState(false)
  const [isInviteUserDialogOpen, setIsInviteUserDialogOpen] = useState(false)
  const [isEditUserRoleDialogOpen, setIsEditUserRoleDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [newRole, setNewRole] = useState({
    name: "",
    description: "",
    color: "#95a5a6",
    permissions: [] as string[],
    priority: 400,
    mentionable: true,
    hoisted: false
  })
  const [inviteForm, setInviteForm] = useState({
    email: "",
    name: "",
    roleIds: [] as string[]
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationError, setValidationError] = useState("")
  const { toast } = useToast()
  const modalRef = useRef<HTMLDivElement>(null)
  const changeRoleButtonRef = useRef<HTMLButtonElement>(null)

  // Fetch data on component mount
  useEffect(() => {
    fetchRoles()
    fetchUsers()
    fetchInvitations()
    
    // If userId is provided, find the user and open the edit dialog
    if (userId) {
      const user = users.find((u) => u.id === userId)
      if (user) {
        setSelectedUser(user)
        setIsEditUserRoleDialogOpen(true)
      }
    }
  }, [userId])

  const fetchRoles = async () => {
    try {
      const response = await fetch('/api/company-settings/roles')
      if (response.ok) {
        const data = await response.json()
        setRoles(data.roles || [])
      } else {
        console.error('Failed to fetch roles:', response.statusText)
      }
    } catch (error) {
      console.error('Error fetching roles:', error)
    }
  }

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/company-settings/users')
      if (response.ok) {
        const usersData = await response.json()
        
        // Transform users and add role objects
        const usersWithRoles = usersData.map((user: any) => ({
          ...user,
          roles: roles.filter(role => user.roleIds?.includes(role.id) || role.name === user.role)
        }))
        
        setUsers(usersWithRoles)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  const fetchInvitations = async () => {
    try {
      const response = await fetch('/api/auth/invite')
      if (response.ok) {
        const data = await response.json()
        setInvitations(data.invitations || [])
      }
    } catch (error) {
      console.error('Error fetching invitations:', error)
    }
  }

  // Refetch users when roles change
  useEffect(() => {
    if (roles.length > 0) {
      fetchUsers()
    }
    setLoading(false)
  }, [roles])

  // Debounced search functionality
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 250)
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery])

  const filteredRoles = roles.filter(
    (role) =>
      role.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      role.description.toLowerCase().includes(debouncedSearchQuery.toLowerCase()),
  )

  const handleAddRole = async () => {
    if (!newRole.name) {
      toast({
        title: "Role name required",
        description: "Please provide a name for the role.",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/company-settings/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRole)
      })

      if (response.ok) {
        await fetchRoles() // Refresh roles list
        setIsAddRoleDialogOpen(false)
        setSelectedRole(null)
        setNewRole({
          name: "",
          description: "",
          color: "#95a5a6",
          permissions: [],
          priority: 400,
          mentionable: true,
          hoisted: false
        })

        toast({
          title: "Role Added",
          description: `${newRole.name} role has been added successfully.`,
        })
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create role')
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || 'Failed to create role',
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteRole = (roleId: string) => {
    // Filter out the role to delete
    const updatedRoles = roles.filter((role) => role.id !== roleId)
    setRoles(updatedRoles)

    toast({
      title: "Role Deleted",
      description: "The role has been deleted successfully.",
    })
  }

  const handleEditRole = (role: Role) => {
    setSelectedRole(role)
    setNewRole({
      name: role.name,
      description: role.description,
      color: role.color || "#95a5a6",
      permissions: [...role.permissions],
      priority: role.priority || 400,
      mentionable: role.mentionable !== undefined ? role.mentionable : true,
      hoisted: role.hoisted !== undefined ? role.hoisted : false
    })
    setIsAddRoleDialogOpen(true)
  }

  const handleUpdateUserRole = async () => {
    if (!selectedUser) return

    setIsSubmitting(true)
    setValidationError("")

    try {
      // Make actual API call to update user role
      const response = await fetch(`/api/company-settings/users/${selectedUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedUser.role })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to update role')
      }

      // Optimistic UI update
      const updatedUsers = users.map((user) => {
        if (user.id === selectedUser.id) {
          return {
            ...user,
            role: selectedUser.role,
          }
        }
        return user
      })

      setUsers(updatedUsers)
      setIsEditUserRoleDialogOpen(false)
      
      toast({
        title: "Role updated",
        description: `${selectedUser.name}'s role has been updated successfully.`,
      })
    } catch (error: any) {
      setValidationError(error.message || 'Failed to update role')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AppLayout username="John Doe" notificationsCount={0}>
      <FadeInSection>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Roles & Permissions</h2>
          <div className="flex gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search roles..."
                className="pl-8 bg-[#1f1f1f] border-[#1f1f1f] text-white placeholder:text-gray-400"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search roles"
              />
            </div>
            <Dialog open={isAddRoleDialogOpen} onOpenChange={setIsAddRoleDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Role
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{selectedRole ? "Edit Role" : "Add New Role"}</DialogTitle>
                  <DialogDescription>
                    {selectedRole
                      ? "Edit role details and permissions."
                      : "Create a new role with specific permissions."}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">
                      Role Name
                    </Label>
                    <Input
                      id="name"
                      value={newRole.name}
                      onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="description" className="text-right">
                      Description
                    </Label>
                    <Input
                      id="description"
                      value={newRole.description}
                      onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-start gap-4">
                    <Label className="text-right pt-2">Permissions</Label>
                    <div className="col-span-3 space-y-4">
                      {permissions.map((permission) => (
                        <div key={permission.id} className="flex items-start space-x-2">
                          <Checkbox
                            id={permission.id}
                            checked={newRole.permissions.includes(permission.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setNewRole({
                                  ...newRole,
                                  permissions: [...newRole.permissions, permission.id],
                                })
                              } else {
                                setNewRole({
                                  ...newRole,
                                  permissions: newRole.permissions.filter((p) => p !== permission.id),
                                })
                              }
                            }}
                          />
                          <div className="grid gap-1.5 leading-none">
                            <label
                              htmlFor={permission.id}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              {permission.name}
                            </label>
                            <p className="text-sm text-muted-foreground">{permission.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsAddRoleDialogOpen(false)
                      setSelectedRole(null)
                      setNewRole({
                        name: "",
                        description: "",
                        permissions: [],
                      })
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleAddRole} disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : selectedRole ? "Update Role" : "Add Role"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {connectedServices.length === 0 ? (
          <Card className="border-dashed border-2 border-[#1f1f1f] bg-[#0f0f0f]">
            <CardContent className="pt-6 flex flex-col items-center justify-center min-h-[300px] text-center">
              <Cloud className="h-16 w-16 text-gray-400 mb-4" />
              <h3 className="text-xl font-medium mb-2 text-white">No Cloud Services Connected</h3>
              <p className="text-gray-400 mb-6 max-w-md">
                You need to connect a cloud service before you can manage roles and permissions.
              </p>
              <Button onClick={() => router.push("/admin/company-settings/cloud-services")} className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]">Connect Service</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Alert className="bg-blue-900/20 border-blue-500/20 text-white">
              <Shield className="h-4 w-4 text-blue-400" />
              <AlertTitle className="text-white">Role Management</AlertTitle>
              <AlertDescription className="text-gray-300">
                Roles define what users can do in the system. Assign permissions carefully.
              </AlertDescription>
            </Alert>

            <Tabs defaultValue="roles">
              <TabsList className="mb-4 bg-[#1f1f1f] border-[#1f1f1f]">
                <TabsTrigger value="roles" className="text-white data-[state=active]:bg-[#0f0f0f] data-[state=active]:text-white">Roles</TabsTrigger>
                <TabsTrigger value="users" className="text-white data-[state=active]:bg-[#0f0f0f] data-[state=active]:text-white">Users & Assignments</TabsTrigger>
              </TabsList>

              <TabsContent value="roles">
                <Card className="bg-[#0f0f0f] border-none text-white">
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle className="text-white">Roles</CardTitle>
                        <CardDescription className="text-gray-400">Manage roles and their permissions.</CardDescription>
                      </div>
                      <Badge variant="secondary" className="bg-[#1f1f1f] text-gray-300">
                        {filteredRoles.length} {filteredRoles.length === 1 ? 'role' : 'roles'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {filteredRoles.length > 0 ? (
                      <div className="grid gap-3">
                        {filteredRoles.map((role) => (
                          <div 
                            key={role.id} 
                            className="flex flex-col lg:flex-row lg:items-center lg:justify-between p-4 rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] hover:bg-[#1a1a1a] transition-colors"
                          >
                            {/* Left section - Role info */}
                            <div className="flex-1 min-w-0 mb-4 lg:mb-0 lg:mr-4">
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
                                <h3 className="font-medium text-white truncate">{role.name}</h3>
                                <Badge 
                                  variant="secondary" 
                                  className="bg-[#1f1f1f] text-gray-300 shrink-0 w-fit"
                                >
                                  {role.userCount} {role.userCount === 1 ? 'user' : 'users'}
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-400 line-clamp-2 mb-3">
                                {role.description}
                              </p>
                              {/* Permission chips */}
                              <div className="flex flex-wrap gap-1 max-h-12 lg:max-h-16 overflow-hidden">
                                {role.permissions.length > 0 ? (
                                  <>
                                    {/* Show up to 3 permissions, but limit to 2 on smaller screens */}
                                    <div className="flex flex-wrap gap-1">
                                      {role.permissions.slice(0, 3).map((permission: string, index) => (
                                        <Badge 
                                          key={permission} 
                                          variant="outline" 
                                          className={`text-xs border-[#2f2f2f] text-gray-300 bg-transparent ${
                                            index >= 2 ? 'hidden lg:inline-flex' : ''
                                          }`}
                                        >
                                          {permissions.find((p) => p.id === permission)?.name || permission}
                                        </Badge>
                                      ))}
                                      {role.permissions.length > 3 && (
                                        <Badge 
                                          variant="outline" 
                                          className="text-xs border-[#2f2f2f] text-gray-400 bg-transparent"
                                        >
                                          <span className="lg:hidden">+{role.permissions.length - 2} more</span>
                                          <span className="hidden lg:inline">+{role.permissions.length - 3} more</span>
                                        </Badge>
                                      )}
                                      {role.permissions.length === 3 && (
                                        <Badge 
                                          variant="outline" 
                                          className="text-xs border-[#2f2f2f] text-gray-400 bg-transparent lg:hidden"
                                        >
                                          +1 more
                                        </Badge>
                                      )}
                                    </div>
                                  </>
                                ) : (
                                  <Badge 
                                    variant="outline" 
                                    className="text-xs border-[#2f2f2f] text-gray-500 bg-transparent"
                                  >
                                    No permissions
                                  </Badge>
                                )}
                              </div>
                            </div>
                            
                            {/* Right section - Actions */}
                            <div className="shrink-0 self-start lg:self-center">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    className="h-8 w-8 p-0 text-gray-400 hover:text-white hover:bg-[#2f2f2f]"
                                    aria-label={`Actions for ${role.name} role`}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-[#1f1f1f] border-[#2f2f2f]">
                                  <DropdownMenuItem 
                                    onClick={() => handleEditRole(role)}
                                    className="text-white hover:bg-[#2f2f2f] focus:bg-[#2f2f2f]"
                                  >
                                    <Settings className="h-4 w-4 mr-2" />
                                    Edit Role
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleDeleteRole(role.id)}
                                    className="text-red-400 hover:bg-red-500/10 focus:bg-red-500/10"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Role
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <Shield className="h-12 w-12 mx-auto mb-4 text-gray-500" />
                        <h3 className="text-lg font-medium text-gray-400 mb-2">No roles found</h3>
                        <p className="text-sm text-gray-500">
                          {searchQuery ? 'Try adjusting your search terms.' : 'Create your first role to get started.'}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="users">
                <Card className="bg-[#0f0f0f] border-none text-white">
                  <CardHeader>
                    <CardTitle className="text-white">User Role Assignments</CardTitle>
                    <CardDescription className="text-gray-400">Manage which roles are assigned to users.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-[#1f1f1f] border-[#1f1f1f]">
                          <TableHead className="text-white">Name</TableHead>
                          <TableHead className="text-white">Email</TableHead>
                          <TableHead className="text-white">Current Role</TableHead>
                          <TableHead className="text-right text-white">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((user) => (
                          <TableRow key={user.id} className="border-[#1f1f1f] hover:bg-[#1a1a1a]">
                            <TableCell className="font-medium text-white">{user.name}</TableCell>
                            <TableCell className="text-gray-300">{user.email}</TableCell>
                            <TableCell>
                              <Badge 
                                variant="secondary" 
                                className="bg-[#1f1f1f] text-gray-300"
                              >
                                {user.role || 'No Role'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                ref={user.id === selectedUser?.id ? changeRoleButtonRef : undefined}
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedUser(user)
                                  setIsEditUserRoleDialogOpen(true)
                                  setValidationError("")
                                }}
                                className="bg-transparent border-[#2f2f2f] text-white hover:bg-[#1f1f1f] hover:border-[#3f3f3f]"
                              >
                                Change Role
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </FadeInSection>

      {/* Edit User Role Dialog */}
      <Dialog 
        open={isEditUserRoleDialogOpen} 
        onOpenChange={(open) => {
          setIsEditUserRoleDialogOpen(open)
          if (!open) {
            setValidationError("")
            // Return focus to the button that opened the modal
            setTimeout(() => {
              changeRoleButtonRef.current?.focus()
            }, 100)
          }
        }}
      >
        <DialogContent 
          ref={modalRef}
          className="bg-[#0f0f0f] border-[#1f1f1f] text-white"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsEditUserRoleDialogOpen(false)
            }
            if (e.key === 'Enter' && !isSubmitting) {
              e.preventDefault()
              handleUpdateUserRole()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-white">Change User Role</DialogTitle>
            <DialogDescription className="text-gray-400">
              {selectedUser ? `Update the role assignment for ${selectedUser.name}` : "Select a new role for this user"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {selectedUser && (
              <>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right text-white">User</Label>
                  <div className="col-span-3">
                    <p className="font-medium text-white">{selectedUser.name}</p>
                    <p className="text-sm text-gray-400">{selectedUser.email}</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="role-select" className="text-right text-white">
                    Role
                  </Label>
                  <div className="col-span-3 space-y-2">
                    <Select
                      value={selectedUser.role}
                      onValueChange={(value) => {
                        setSelectedUser({ ...selectedUser, role: value })
                        setValidationError("")
                      }}
                    >
                      <SelectTrigger 
                        id="role-select"
                        className="bg-[#1f1f1f] border-[#2f2f2f] text-white"
                        aria-describedby={validationError ? "role-error" : undefined}
                      >
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1f1f1f] border-[#2f2f2f]">
                        {roles.map((role) => (
                          <SelectItem 
                            key={role.id} 
                            value={role.name}
                            className="text-white hover:bg-[#2f2f2f] focus:bg-[#2f2f2f]"
                          >
                            <div>
                              <div className="font-medium">{role.name}</div>
                              <div className="text-xs text-gray-400 truncate">
                                {role.description}
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-400">
                      Choose a role that matches the user's responsibilities and required permissions.
                    </p>
                  </div>
                </div>
                {validationError && (
                  <div className="grid grid-cols-4 gap-4">
                    <div></div>
                    <Alert className="col-span-3 bg-red-500/10 border-red-500/20">
                      <AlertDescription id="role-error" className="text-red-200 text-sm">
                        {validationError}
                      </AlertDescription>
                    </Alert>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsEditUserRoleDialogOpen(false)}
              className="bg-transparent border-[#2f2f2f] text-white hover:bg-[#1f1f1f]"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateUserRole} 
              disabled={isSubmitting || !selectedUser?.role}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSubmitting ? "Updating..." : "Update Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}