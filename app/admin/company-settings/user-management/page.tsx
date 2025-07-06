"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { useRouter } from "next/navigation"
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { AlertCircle, Check, Cloud, MoreHorizontal, Search, UserPlus } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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

export default function UserManagementPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [users, setUsers] = useState(mockUsers)
  const [connectedServices, setConnectedServices] = useState(mockConnectedServices)
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false)
  const [newUser, setNewUser] = useState({
    email: "",
    name: "",
    role: "IT Specialist",
    password: "",
    confirmPassword: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  // Check if user is logged in
  useEffect(() => {
    const token = localStorage.getItem("access_token")
    if (!token) {
      router.push("/login")
    }
  }, [router]) 

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.role.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const handleAddUser = () => {
    if (newUser.password !== newUser.confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your passwords match.",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    // Simulate API call
    setTimeout(() => {
      const newUserData = {
        id: `user-${Date.now()}`,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        status: "active",
        lastLogin: null,
      }

      setUsers([...users, newUserData])
      setIsSubmitting(false)
      setIsAddUserDialogOpen(false)
      setNewUser({
        email: "",
        name: "",
        role: "IT Specialist",
        password: "",
        confirmPassword: "",
      })

      toast({
        title: "User Added",
        description: `${newUser.name} has been added successfully.`,
      })
    }, 2000)
  }

  const handleDeleteUser = (userId: string) => {
    // Filter out the user to delete
    const updatedUsers = users.filter((user) => user.id !== userId)
    setUsers(updatedUsers)

    toast({
      title: "User Deleted",
      description: "The user has been deleted successfully.",
    })
  }

  const handleResendInvite = (userId: string) => {
    toast({
      title: "Invitation Sent",
      description: "The invitation has been resent successfully.",
    })
  }

  return (
    <AppLayout username="John Doe" onSearch={setSearchQuery} notificationsCount={0}>
      <FadeInSection>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">User Management</h2>
          <div className="flex gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Dialog open={isAddUserDialogOpen} onOpenChange={setIsAddUserDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New User</DialogTitle>
                  <DialogDescription>
                    Add a new user to your organization. They will receive an email invitation.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">
                      Full Name
                    </Label>
                    <Input
                      id="name"
                      value={newUser.name}
                      onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="email" className="text-right">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="role" className="text-right">
                      Role
                    </Label>
                    <Select value={newUser.role} onValueChange={(value) => setNewUser({ ...newUser, role: value })}>
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Security Admin">Security Admin</SelectItem>
                        <SelectItem value="IT Specialist">IT Specialist</SelectItem>
                        <SelectItem value="Security Analyst">Security Analyst</SelectItem>
                        <SelectItem value="Team Lead">Team Lead</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="password" className="text-right">
                      Password
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="confirmPassword" className="text-right">
                      Confirm Password
                    </Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={newUser.confirmPassword}
                      onChange={(e) => setNewUser({ ...newUser, confirmPassword: e.target.value })}
                      className="col-span-3"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddUserDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddUser} disabled={isSubmitting}>
                    {isSubmitting ? "Adding..." : "Add User"}
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
                You need to connect a cloud service before you can manage users.
              </p>
              <Button onClick={() => router.push("/admin/company-settings/cloud-services")}>Connect Service</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>User Management</AlertTitle>
              <AlertDescription>
                Users added here will be created in your connected cloud service ({connectedServices[0].name}).
              </AlertDescription>
            </Alert>

            <Card>
              <CardHeader>
                <CardTitle>Users</CardTitle>
                <CardDescription>Manage users in your organization.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length > 0 ? (
                      filteredUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{user.name}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>{user.role}</TableCell>
                          <TableCell>
                            {user.status === "active" ? (
                              <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                                <Check className="mr-1 h-3 w-3" /> Active
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                              >
                                Pending
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{user.lastLogin ? new Date(user.lastLogin).toLocaleString() : "Never"}</TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <span className="sr-only">Open menu</span>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => router.push(`/admin/company-settings/roles?user=${user.id}`)}
                                >
                                  Edit Roles
                                </DropdownMenuItem>
                                {user.status === "pending" && (
                                  <DropdownMenuItem onClick={() => handleResendInvite(user.id)}>
                                    Resend Invite
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleDeleteUser(user.id)} className="text-red-600">
                                  Delete User
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                          No users found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
      </FadeInSection>
    </AppLayout>
  )
}
