"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { UserPlus, MoreHorizontal, Cloud, ChevronDown, Check, Users, X, RefreshCw, Loader2, Info } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import { useCloudServices } from "@/hooks/useCloudServices"
import { useUsers, User } from "@/hooks/useUsers"
import { useEmployees, Employee } from "@/hooks/useEmployees"
import { usePoolUsers, PoolUser } from "@/hooks/usePoolUsers"

export default function UserManagementPage() {
  const router = useRouter()
  const { toast } = useToast()

  const { services } = useCloudServices()
  const {
    users,
    loading: usersLoading,
    error: usersError,
    addUser,
    deleteUser,
    refresh: refreshUsers,
  } = useUsers()

  const {
    employees,
    loading: empLoading,
    error: empError,
    addEmployee,
    removeEmployee,
    refresh: refreshEmployees,
  } = useEmployees()

  const {
    poolUsers,
    loading: poolLoading,
    error: poolError,
    refresh: refreshPoolUsers,
  } = usePoolUsers()

  const [searchUser, setSearchUser] = useState("")
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)
  const [searchEmp, setSearchEmp] = useState("")
  const [isAddEmpOpen, setIsAddEmpOpen] = useState(false)

  // User selection states
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [selectedRole, setSelectedRole] = useState("Security Admin")
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false)
  const [userSearchQuery, setUserSearchQuery] = useState("")

  // Employee management states
  const [newEmpName, setNewEmpName] = useState("")
  const [newEmpEmail, setNewEmpEmail] = useState("")
  const [newEmpDepartment, setNewEmpDepartment] = useState("")
  const [newEmpJobTitle, setNewEmpJobTitle] = useState("")

  // WorkMail integration states
  const [isWorkmailSyncing, setIsWorkmailSyncing] = useState(false)
  const [workmailStatus, setWorkmailStatus] = useState<any>(null)

  // Available roles
  const availableRoles = ["Security Admin", "IT Specialist", "Security Analyst", "Team Lead"]

  // Filter available pool users (exclude already added users)
  const availablePoolUsers = poolUsers.filter(
    poolUser => !users.find(user => user.email === poolUser.email)
  )

  // Filter users based on search
  const filteredAvailableUsers = availablePoolUsers.filter(user =>
    user.name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(userSearchQuery.toLowerCase())
  )

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchUser.toLowerCase()) ||
      u.email.toLowerCase().includes(searchUser.toLowerCase())
  )
  
  const filteredEmps = employees.filter((e) =>
    (e.name && e.name.toLowerCase().includes(searchEmp.toLowerCase())) ||
    e.email.toLowerCase().includes(searchEmp.toLowerCase())
  )

  // Handle user selection
  const toggleUserSelection = (username: string) => {
    setSelectedUsers(prev =>
      prev.includes(username)
        ? prev.filter(u => u !== username)
        : [...prev, username]
    )
  }

  const handleSelectAll = () => {
    if (selectedUsers.length === filteredAvailableUsers.length && filteredAvailableUsers.length > 0) {
      setSelectedUsers([])
    } else {
      setSelectedUsers(filteredAvailableUsers.map(u => u.username))
    }
  }

  const handleAddSelectedUsers = async () => {
    if (selectedUsers.length === 0) {
      toast({
        variant: "destructive",
        title: "No users selected",
        description: "Please select at least one user to add.",
      })
      return
    }

    try {
      // Add each selected user
      await Promise.all(
        selectedUsers.map((username) => {
          const poolUser = poolUsers.find(u => u.username === username)!
          return addUser({
            name: poolUser.name,
            email: poolUser.email,
            role: selectedRole,
          })
        })
      )
      
      toast({
        title: "Users Added",
        description: `Successfully added ${selectedUsers.length} user${selectedUsers.length > 1 ? "s" : ""}.`,
      })
      
      // Reset selection and refresh
      setSelectedUsers([])
      setIsAddUserOpen(false)
      setUserSearchQuery("")
      
      // Refresh pool users to update available list
      await refreshPoolUsers()
    } catch (err) {
      console.error("Error adding users:", err)
      toast({
        variant: "destructive",
        title: "Error",
        description: (err as Error).message || "Failed to add users",
      })
    }
  }

  const handleDeleteUser = async (userId: string) => {
    try {
      await deleteUser(userId)
      toast({
        title: "User Removed",
        description: "User has been removed from the security team.",
      })
      
      // Refresh pool users to update available list
      await refreshPoolUsers()
    } catch (err) {
      console.error("Error removing user:", err)
      toast({
        variant: "destructive",
        title: "Error",
        description: (err as Error).message || "Failed to remove user",
      })
    }
  }

  const handleAddEmployee = async () => {
    if (!newEmpName.trim() || !newEmpEmail.trim()) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please provide both name and email.",
      })
      return
    }

    try {
      await addEmployee({
        name: newEmpName,
        email: newEmpEmail,
        department: newEmpDepartment,
        jobTitle: newEmpJobTitle,
      })
      
      toast({
        title: "Employee Added",
        description: `${newEmpName} has been added to monitoring.`,
      })
      
      setIsAddEmpOpen(false)
      setNewEmpName("")
      setNewEmpEmail("")
      setNewEmpDepartment("")
      setNewEmpJobTitle("")
    } catch (err) {
      console.error("Error adding employee:", err)
      toast({
        variant: "destructive",
        title: "Error",
        description: (err as Error).message || "Failed to add employee",
      })
    }
  }

  const checkWorkmailStatus = async () => {
    try {
      const res = await fetch("/api/company-settings/employees/sync-workmail")
      const status = await res.json()
      setWorkmailStatus(status)
    } catch (err) {
      console.error("Error checking WorkMail status:", err)
    }
  }

  const handleSyncFromWorkMail = async () => {
    setIsWorkmailSyncing(true)
    try {
      const res = await fetch("/api/company-settings/employees/sync-workmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      })
      
      const result = await res.json()
      
      if (res.ok && result.success) {
        toast({
          title: "WorkMail Sync Complete",
          description: `Successfully synced ${result.synced} employees from WorkMail.`,
        })
        
        // Refresh employee list
        await refreshEmployees()
      } else {
        throw new Error(result.error || "Sync failed")
      }
    } catch (err) {
      console.error("WorkMail sync error:", err)
      toast({
        variant: "destructive",
        title: "WorkMail Sync Failed",
        description: (err as Error).message || "Failed to sync from WorkMail",
      })
    } finally {
      setIsWorkmailSyncing(false)
    }
  }

  const resetDialogState = () => {
    setSelectedUsers([])
    setUserSearchQuery("")
    setSelectedRole("Security Admin")
    setIsUserDropdownOpen(false)
  }

  // Auto-refresh data periodically and check WorkMail status
  useEffect(() => {
    const interval = setInterval(() => {
      refreshUsers()
      refreshPoolUsers()
    }, 30000) // Refresh every 30 seconds

    return () => clearInterval(interval)
  }, [refreshUsers, refreshPoolUsers])

  // Check WorkMail status on component mount
  useEffect(() => {
    checkWorkmailStatus()
  }, [])

  if (!services.length) {
    return (
      <AppLayout username="John Doe" onSearch={() => {}} notificationsCount={0}>
        <FadeInSection>
          <Alert>
            <Cloud className="mr-2 h-4 w-4" />
            <AlertTitle>No Cloud Services Connected</AlertTitle>
            <AlertDescription>
              You need to connect a cloud service before managing users.
            </AlertDescription>
          </Alert>
          <div className="mt-4">
            <Button
              onClick={() =>
                router.push("/admin/company-settings/cloud-services")
              }
            >
              Connect Service
            </Button>
          </div>
        </FadeInSection>
      </AppLayout>
    )
  }

  return (
    <AppLayout username="John Doe" onSearch={() => {}} notificationsCount={0}>
      <FadeInSection>
        <div className="space-y-8">
          <Alert>
            <AlertTitle>User Management</AlertTitle>
            <AlertDescription>
              Manage security team users and organization employees. Security team users access this dashboard, while employees' emails are monitored for threats.
            </AlertDescription>
          </Alert>

          {/* Security Team Users Section */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Security Team Users
                  </CardTitle>
                  <CardDescription>
                    Manage users who have access to the security dashboard
                  </CardDescription>
                </div>
                <Dialog open={isAddUserOpen} onOpenChange={(open) => {
                  setIsAddUserOpen(open)
                  if (!open) resetDialogState()
                }}>
                  <DialogTrigger asChild>
                    <Button>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add User
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Add Security Team Users</DialogTitle>
                      <DialogDescription>
                        Select users from your Security Team Cognito user pool to add to the security team.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                      {/* Role Selection */}
                      <div className="space-y-2">
                        <Label htmlFor="role">Assign Role</Label>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="w-full justify-between">
                              {selectedRole}
                              <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-full">
                            {availableRoles.map((role) => (
                              <DropdownMenuItem
                                key={role}
                                onClick={() => setSelectedRole(role)}
                              >
                                {role}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* User Selection Dropdown */}
                      <div className="space-y-2">
                        <Label>Select Users</Label>
                        <DropdownMenu open={isUserDropdownOpen} onOpenChange={setIsUserDropdownOpen}>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="w-full justify-between">
                              {selectedUsers.length === 0 
                                ? "Select users..." 
                                : `${selectedUsers.length} user${selectedUsers.length > 1 ? 's' : ''} selected`}
                              <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-80 max-h-80 overflow-auto">
                            {/* Search */}
                            <div className="p-2">
                              <Input
                                placeholder="Search users..."
                                value={userSearchQuery}
                                onChange={(e) => setUserSearchQuery(e.target.value)}
                                className="h-8"
                              />
                            </div>
                            
                            <DropdownMenuSeparator />
                            
                            {/* Select All */}
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                              <div className="flex items-center space-x-2 w-full">
                                <Checkbox
                                  checked={selectedUsers.length === filteredAvailableUsers.length && filteredAvailableUsers.length > 0}
                                  onCheckedChange={handleSelectAll}
                                />
                                <span className="font-medium">Select All</span>
                              </div>
                            </DropdownMenuItem>
                            
                            <DropdownMenuSeparator />

                            {/* Loading State */}
                            {poolLoading && (
                              <DropdownMenuLabel className="text-muted-foreground">
                                Loading users...
                              </DropdownMenuLabel>
                            )}

                            {/* Error State */}
                            {poolError && (
                              <DropdownMenuLabel className="text-destructive">
                                Error loading users: {poolError.message}
                              </DropdownMenuLabel>
                            )}

                            {/* User List */}
                            {!poolLoading && !poolError && filteredAvailableUsers.length === 0 && (
                              <DropdownMenuLabel className="text-muted-foreground">
                                {availablePoolUsers.length === 0 
                                  ? "All users have been added to the security team"
                                  : "No users match your search"}
                              </DropdownMenuLabel>
                            )}

                            {filteredAvailableUsers.map((user) => (
                              <DropdownMenuItem key={user.username} onSelect={(e) => e.preventDefault()}>
                                <div className="flex items-center space-x-2 w-full">
                                  <Checkbox
                                    checked={selectedUsers.includes(user.username)}
                                    onCheckedChange={() => toggleUserSelection(user.username)}
                                  />
                                  <div className="flex-1">
                                    <div className="font-medium">{user.name}</div>
                                    <div className="text-sm text-muted-foreground">{user.email}</div>
                                  </div>
                                  {selectedUsers.includes(user.username) && (
                                    <Check className="h-4 w-4 text-primary" />
                                  )}
                                </div>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Selected Users Preview */}
                      {selectedUsers.length > 0 && (
                        <div className="space-y-2">
                          <Label>Selected Users ({selectedUsers.length})</Label>
                          <div className="max-h-24 overflow-auto space-y-1 p-2 border rounded">
                            {selectedUsers.map((username) => {
                              const user = poolUsers.find(u => u.username === username)
                              return (
                                <div key={username} className="flex items-center justify-between text-sm">
                                  <span className="truncate flex-1">{user?.name} ({user?.email})</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => toggleUserSelection(username)}
                                    className="h-6 w-6 p-0 ml-2"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsAddUserOpen(false)
                          resetDialogState()
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAddSelectedUsers}
                        disabled={usersLoading || selectedUsers.length === 0}
                      >
                        {usersLoading ? "Adding..." : `Add ${selectedUsers.length} User${selectedUsers.length > 1 ? 's' : ''}`}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Input
                    placeholder="Search users..."
                    value={searchUser}
                    onChange={(e) => setSearchUser(e.target.value)}
                    className="max-w-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      refreshUsers()
                      refreshPoolUsers()
                    }}
                    disabled={usersLoading || poolLoading}
                  >
                    Refresh
                  </Button>
                </div>

                {usersError && (
                  <Alert variant="destructive">
                    <AlertTitle>Error loading users</AlertTitle>
                    <AlertDescription>{usersError.message}</AlertDescription>
                  </Alert>
                )}

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
                      filteredUsers.map((user: User) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{user.name}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{user.role}</Badge>
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
                            {user.lastLogin
                              ? new Date(user.lastLogin).toLocaleString()
                              : "Never"}
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
                                <DropdownMenuItem
                                  onClick={() =>
                                    router.push(
                                      `/admin/company-settings/roles?user=${encodeURIComponent(
                                        user.id
                                      )}`
                                    )
                                  }
                                >
                                  Manage Roles
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => handleDeleteUser(user.id)}
                                >
                                  Remove User
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                          {usersLoading ? "Loading users..." : "No users found."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Organization Employees Section - WITH WORKMAIL SYNC */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Organization Employees</CardTitle>
                  <CardDescription>
                    Manage employees whose emails will be monitored for security threats. Sync directly from AWS WorkMail.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Dialog open={isAddEmpOpen} onOpenChange={setIsAddEmpOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <UserPlus className="mr-2 h-4 w-4" />
                        Add Employee
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Employee</DialogTitle>
                        <DialogDescription>
                          Add an employee to email monitoring.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="empName" className="text-right">
                            Name
                          </Label>
                          <Input
                            id="empName"
                            value={newEmpName}
                            onChange={(e) => setNewEmpName(e.target.value)}
                            className="col-span-3"
                            placeholder="John Doe"
                          />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="empEmail" className="text-right">
                            Email
                          </Label>
                          <Input
                            id="empEmail"
                            type="email"
                            value={newEmpEmail}
                            onChange={(e) => setNewEmpEmail(e.target.value)}
                            className="col-span-3"
                            placeholder="john.doe@company.com"
                          />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="empDept" className="text-right">
                            Department
                          </Label>
                          <Input
                            id="empDept"
                            value={newEmpDepartment}
                            onChange={(e) => setNewEmpDepartment(e.target.value)}
                            className="col-span-3"
                            placeholder="Engineering (optional)"
                          />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="empJobTitle" className="text-right">
                            Job Title
                          </Label>
                          <Input
                            id="empJobTitle"
                            value={newEmpJobTitle}
                            onChange={(e) => setNewEmpJobTitle(e.target.value)}
                            className="col-span-3"
                            placeholder="Software Engineer (optional)"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsAddEmpOpen(false)
                            setNewEmpName("")
                            setNewEmpEmail("")
                            setNewEmpDepartment("")
                            setNewEmpJobTitle("")
                          }}
                        >
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleAddEmployee} 
                          disabled={empLoading || !newEmpName.trim() || !newEmpEmail.trim()}
                        >
                          {empLoading ? "Adding..." : "Add Employee"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  
                  <Button 
                    variant="default"
                    onClick={handleSyncFromWorkMail}
                    disabled={isWorkmailSyncing}
                  >
                    {isWorkmailSyncing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Sync from WorkMail
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* WorkMail Connection Status */}
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>AWS WorkMail Integration</AlertTitle>
                  <AlertDescription>
                    {workmailStatus?.connected ? (
                      <>
                        ✅ Connected to WorkMail Organization: <code>{workmailStatus.organizationAlias}</code>
                      </>
                    ) : (
                      <>
                        ❌ WorkMail not configured. Set WORKMAIL_ORGANIZATION_ID environment variable.
                      </>
                    )}
                  </AlertDescription>
                </Alert>

                <div className="flex items-center justify-between">
                  <Input
                    placeholder="Search employees..."
                    value={searchEmp}
                    onChange={(e) => setSearchEmp(e.target.value)}
                    className="max-w-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={checkWorkmailStatus}
                      disabled={empLoading}
                    >
                      Check WorkMail
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refreshEmployees()}
                      disabled={empLoading}
                    >
                      Refresh
                    </Button>
                  </div>
                </div>

                {empError && (
                  <Alert variant="destructive">
                    <AlertTitle>Error loading employees</AlertTitle>
                    <AlertDescription>{empError.message}</AlertDescription>
                  </Alert>
                )}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Job Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Sync</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmps.length > 0 ? (
                      filteredEmps.map((employee: Employee) => (
                        <TableRow key={employee.id}>
                          <TableCell className="font-medium">{employee.name || "Unknown User"}</TableCell>
                          <TableCell>{employee.email}</TableCell>
                          <TableCell>{employee.department || "—"}</TableCell>
                          <TableCell>{employee.jobTitle || "—"}</TableCell>
                          <TableCell>
                            <Badge
                              variant={employee.status === "active" ? "default" : "secondary"}
                              className={
                                employee.status === "active"
                                  ? "bg-green-500/10 text-green-500 border-green-500/20"
                                  : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                              }
                            >
                              {employee.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {employee.syncedFromWorkMail ? (
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className="text-xs">
                                  WorkMail
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(employee.syncedFromWorkMail).toLocaleDateString()}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Manual</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600"
                              onClick={() => removeEmployee(employee.id)}
                            >
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                          {empLoading ? "Loading employees..." : "No employees being monitored. Click 'Sync from WorkMail' to import your organization's users."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </FadeInSection>
    </AppLayout>
  )
}