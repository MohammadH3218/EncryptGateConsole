"use client"

import { useState, useEffect } from "react"
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
import { Cloud, MoreHorizontal, Plus, Search, Shield } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// Mock data for roles
const mockRoles = [
  {
    id: "role-1",
    name: "Security Admin",
    description: "Full access to all security features",
    userCount: 3,
    permissions: [
      "view_dashboard",
      "manage_users",
      "manage_roles",
      "view_detections",
      "manage_detections",
      "view_emails",
      "manage_allow_block_list",
      "manage_cloud_services",
    ],
  },
  {
    id: "role-2",
    name: "IT Specialist",
    description: "Access to view and manage detections",
    userCount: 5,
    permissions: ["view_dashboard", "view_detections", "manage_detections", "view_emails", "manage_allow_block_list"],
  },
  {
    id: "role-3",
    name: "Security Analyst",
    description: "Access to view and analyze security data",
    userCount: 2,
    permissions: ["view_dashboard", "view_detections", "view_emails"],
  },
]

// Mock data for users
const mockUsers = [
  {
    id: "user-1",
    email: "john.smith@company1.com",
    name: "John Smith",
    role: "Security Admin",
    status: "active",
    lastLogin: "2024-01-31T15:20:00Z",
  },
  {
    id: "user-2",
    email: "jane.doe@company1.com",
    name: "Jane Doe",
    role: "IT Specialist",
    status: "active",
    lastLogin: "2024-01-30T10:15:00Z",
  },
  {
    id: "user-3",
    email: "bob.johnson@company1.com",
    name: "Bob Johnson",
    role: "Security Analyst",
    status: "pending",
    lastLogin: null,
  },
]

// Mock data for permissions
const mockPermissions = [
  { id: "view_dashboard", name: "View Dashboard", description: "Can view the dashboard" },
  { id: "manage_users", name: "Manage Users", description: "Can add, edit, and delete users" },
  { id: "manage_roles", name: "Manage Roles", description: "Can add, edit, and delete roles" },
  { id: "view_detections", name: "View Detections", description: "Can view security detections" },
  { id: "manage_detections", name: "Manage Detections", description: "Can manage security detections" },
  { id: "view_emails", name: "View Emails", description: "Can view emails" },
  { id: "manage_allow_block_list", name: "Manage Allow/Block List", description: "Can manage the allow/block list" },
  { id: "manage_cloud_services", name: "Manage Cloud Services", description: "Can manage cloud service connections" },
]

// Mock data for connected services
const mockConnectedServices = [
  {
    id: "aws-cognito",
    name: "AWS Cognito",
    status: "connected",
    lastSynced: "2024-01-31T15:20:00Z",
    userCount: 24,
  },
]

export default function RolesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const userId = searchParams.get("user")
  const [searchQuery, setSearchQuery] = useState("")
  const [roles, setRoles] = useState(mockRoles)
  const [users, setUsers] = useState(mockUsers)
  const [permissions, setPermissions] = useState(mockPermissions)
  const [connectedServices, setConnectedServices] = useState(mockConnectedServices)
  const [isAddRoleDialogOpen, setIsAddRoleDialogOpen] = useState(false)
  const [isEditUserRoleDialogOpen, setIsEditUserRoleDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<(typeof mockUsers)[0] | null>(null)
  const [selectedRole, setSelectedRole] = useState<(typeof mockRoles)[0] | null>(null)
  const [newRole, setNewRole] = useState({
    name: "",
    description: "",
    permissions: [] as string[],
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  // Check if user is logged in
   useEffect(() => {
    const token = localStorage.getItem("access_token")
    if (!token) {
      router.push("/login")
    } 

    // If userId is provided, find the user and open the edit dialog
    if (userId) {
      const user = mockUsers.find((u) => u.id === userId)
      if (user) {
        setSelectedUser(user)
        setIsEditUserRoleDialogOpen(true)
      }
    }
  }, [router, userId])

  const filteredRoles = roles.filter(
    (role) =>
      role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      role.description.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const handleAddRole = () => {
    if (!newRole.name) {
      toast({
        title: "Role name required",
        description: "Please provide a name for the role.",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    // Simulate API call
    setTimeout(() => {
      const newRoleData = {
        id: `role-${Date.now()}`,
        name: newRole.name,
        description: newRole.description,
        userCount: 0,
        permissions: newRole.permissions,
      }

      setRoles([...roles, newRoleData])
      setIsSubmitting(false)
      setIsAddRoleDialogOpen(false)
      setNewRole({
        name: "",
        description: "",
        permissions: [],
      })

      toast({
        title: "Role Added",
        description: `${newRole.name} role has been added successfully.`,
      })
    }, 2000)
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

  const handleEditRole = (role: (typeof mockRoles)[0]) => {
    setSelectedRole(role)
    setNewRole({
      name: role.name,
      description: role.description,
      permissions: [...role.permissions],
    })
    setIsAddRoleDialogOpen(true)
  }

  const handleUpdateUserRole = () => {
    if (!selectedUser) return

    setIsSubmitting(true)

    // Simulate API call
    setTimeout(() => {
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
      setIsSubmitting(false)
      setIsEditUserRoleDialogOpen(false)

      toast({
        title: "User Role Updated",
        description: `${selectedUser.name}'s role has been updated successfully.`,
      })
    }, 2000)
  }

  return (
    <AppLayout username="John Doe" onSearch={setSearchQuery} notificationsCount={0}>
      <FadeInSection>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Roles & Permissions</h2>
          <div className="flex gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search roles..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Dialog open={isAddRoleDialogOpen} onOpenChange={setIsAddRoleDialogOpen}>
              <DialogTrigger asChild>
                <Button>
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
          <Card className="border-dashed border-2">
            <CardContent className="pt-6 flex flex-col items-center justify-center min-h-[300px] text-center">
              <Cloud className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-medium mb-2">No Cloud Services Connected</h3>
              <p className="text-muted-foreground mb-6 max-w-md">
                You need to connect a cloud service before you can manage roles and permissions.
              </p>
              <Button onClick={() => router.push("/admin/company-settings/cloud-services")}>Connect Service</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertTitle>Role Management</AlertTitle>
              <AlertDescription>
                Roles define what users can do in the system. Assign permissions carefully.
              </AlertDescription>
            </Alert>

            <Tabs defaultValue="roles">
              <TabsList className="mb-4">
                <TabsTrigger value="roles">Roles</TabsTrigger>
                <TabsTrigger value="users">Users & Assignments</TabsTrigger>
              </TabsList>

              <TabsContent value="roles">
                <Card>
                  <CardHeader>
                    <CardTitle>Roles</CardTitle>
                    <CardDescription>Manage roles and their permissions.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Role Name</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Users</TableHead>
                          <TableHead>Permissions</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRoles.length > 0 ? (
                          filteredRoles.map((role) => (
                            <TableRow key={role.id}>
                              <TableCell className="font-medium">{role.name}</TableCell>
                              <TableCell>{role.description}</TableCell>
                              <TableCell>{role.userCount}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {role.permissions.length > 3 ? (
                                    <>
                                      {role.permissions.slice(0, 2).map((permission) => (
                                        <Badge key={permission} variant="outline" className="mr-1">
                                          {permissions.find((p) => p.id === permission)?.name || permission}
                                        </Badge>
                                      ))}
                                      <Badge variant="outline">+{role.permissions.length - 2} more</Badge>
                                    </>
                                  ) : (
                                    role.permissions.map((permission) => (
                                      <Badge key={permission} variant="outline" className="mr-1">
                                        {permissions.find((p) => p.id === permission)?.name || permission}
                                      </Badge>
                                    ))
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                      <span className="sr-only">Open menu</span>
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleEditRole(role)}>Edit Role</DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleDeleteRole(role.id)}
                                      className="text-red-600"
                                    >
                                      Delete Role
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                              No roles found
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="users">
                <Card>
                  <CardHeader>
                    <CardTitle>User Role Assignments</CardTitle>
                    <CardDescription>Manage which roles are assigned to users.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Current Role</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.name}</TableCell>
                            <TableCell>{user.email}</TableCell>
                            <TableCell>{user.role}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedUser(user)
                                  setIsEditUserRoleDialogOpen(true)
                                }}
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
      <Dialog open={isEditUserRoleDialogOpen} onOpenChange={setIsEditUserRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
            <DialogDescription>
              {selectedUser ? `Update role for ${selectedUser.name}` : "Select a new role for this user"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {selectedUser && (
              <>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">User</Label>
                  <div className="col-span-3">
                    <p className="font-medium">{selectedUser.name}</p>
                    <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="role" className="text-right">
                    Role
                  </Label>
                  <Select
                    value={selectedUser.role}
                    onValueChange={(value) => setSelectedUser({ ...selectedUser, role: value })}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.name}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditUserRoleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateUserRole} disabled={isSubmitting}>
              {isSubmitting ? "Updating..." : "Update Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
