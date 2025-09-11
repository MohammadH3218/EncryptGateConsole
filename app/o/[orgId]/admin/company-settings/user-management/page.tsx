"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
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
import { useWorkMailUsers, WorkMailUser } from "@/hooks/useWorkMailUsers"

export default function UserManagementPage() {
  const router = useRouter()
  const params = useParams()
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

  const {
    workMailUsers,
    loading: workMailLoading,
    error: workMailError,
    refresh: refreshWorkMailUsers,
  } = useWorkMailUsers()

  const [searchUser, setSearchUser] = useState("")
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)
  const [searchEmp, setSearchEmp] = useState("")
  const [isAddEmpOpen, setIsAddEmpOpen] = useState(false)

  // User selection states
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [selectedRole, setSelectedRole] = useState("Security Admin")
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false)
  const [userSearchQuery, setUserSearchQuery] = useState("")

  // Employee selection states (NEW)
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([])
  const [isEmpDropdownOpen, setIsEmpDropdownOpen] = useState(false)
  const [empSearchQuery, setEmpSearchQuery] = useState("")

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

  // Filter available WorkMail users (exclude already added employees)
  const availableWorkMailUsers = workMailUsers.filter(
    workMailUser => !employees.find(employee => employee.email === workMailUser.email)
  )

  // Filter WorkMail users based on search
  const filteredAvailableWorkMailUsers = availableWorkMailUsers.filter(user =>
    user.name.toLowerCase().includes(empSearchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(empSearchQuery.toLowerCase()) ||
    (user.department && user.department.toLowerCase().includes(empSearchQuery.toLowerCase()))
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

  const handleSelectAllUsers = () => {
    if (selectedUsers.length === filteredAvailableUsers.length && filteredAvailableUsers.length > 0) {
      setSelectedUsers([])
    } else {
      setSelectedUsers(filteredAvailableUsers.map(u => u.username))
    }
  }

  // Handle employee selection (NEW)
  const toggleEmployeeSelection = (userId: string) => {
    setSelectedEmployees(prev =>
      prev.includes(userId)
        ? prev.filter(u => u !== userId)
        : [...prev, userId]
    )
  }

  const handleSelectAllEmployees = () => {
    if (selectedEmployees.length === filteredAvailableWorkMailUsers.length && filteredAvailableWorkMailUsers.length > 0) {
      setSelectedEmployees([])
    } else {
      setSelectedEmployees(filteredAvailableWorkMailUsers.map(u => u.id))
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

  // Handle adding selected employees (NEW)
  const handleAddSelectedEmployees = async () => {
    if (selectedEmployees.length === 0) {
      toast({
        variant: "destructive",
        title: "No employees selected",
        description: "Please select at least one employee to add.",
      })
      return
    }

    try {
      // Add each selected employee
      await Promise.all(
        selectedEmployees.map((userId) => {
          const workMailUser = workMailUsers.find(u => u.id === userId)!
          return addEmployee({
            name: workMailUser.name,
            email: workMailUser.email,
            department: workMailUser.department || '',
            jobTitle: workMailUser.jobTitle || '',
          })
        })
      )
      
      toast({
        title: "Employees Added",
        description: `Successfully added ${selectedEmployees.length} employee${selectedEmployees.length > 1 ? "s" : ""} to monitoring.`,
      })
      
      // Reset selection and refresh
      setSelectedEmployees([])
      setIsAddEmpOpen(false)
      setEmpSearchQuery("")
      
      // Refresh WorkMail users to update available list
      await refreshWorkMailUsers()
    } catch (err) {
      console.error("Error adding employees:", err)
      toast({
        variant: "destructive",
        title: "Error",
        description: (err as Error).message || "Failed to add employees",
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

  const handleSyncFromWorkMail = async () => {
    setIsWorkmailSyncing(true)
    try {
      const res = await fetch("/api/company-settings/employees/sync-workmail", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-org-id": params.orgId as string
        },
        body: JSON.stringify({})
      })
      
      const result = await res.json()
      
      if (res.ok && result.success) {
        toast({
          title: "WorkMail Sync Complete",
          description: `Successfully synced ${result.synced} employees from WorkMail.`,
        })
        
        // Refresh employee list and available WorkMail users
        await refreshEmployees()
        await refreshWorkMailUsers()
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

  const checkWorkmailStatus = async () => {
    try {
      const res = await fetch("/api/company-settings/employees/sync-workmail", {
        headers: {
          "x-org-id": params.orgId as string
        }
      })
      const status = await res.json()
      setWorkmailStatus(status)
    } catch (err) {
      console.error("Error checking WorkMail status:", err)
    }
  }

  const resetUserDialogState = () => {
    setSelectedUsers([])
    setUserSearchQuery("")
    setSelectedRole("Security Admin")
    setIsUserDropdownOpen(false)
  }

  const resetEmpDialogState = () => {
    setSelectedEmployees([])
    setEmpSearchQuery("")
    setIsEmpDropdownOpen(false)
  }

  // Auto-refresh data periodically and check WorkMail status
  useEffect(() => {
    const interval = setInterval(() => {
      refreshUsers()
      refreshPoolUsers()
      refreshWorkMailUsers()
    }, 30000) // Refresh every 30 seconds

    return () => clearInterval(interval)
  }, [refreshUsers, refreshPoolUsers, refreshWorkMailUsers])

  // Check WorkMail status on component mount
  useEffect(() => {
    checkWorkmailStatus()
  }, [])

  if (!services.length) {
    return (
      <AppLayout notificationsCount={0}>
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
                router.push(`/o/${params.orgId}/admin/company-settings/cloud-services`)
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
    <AppLayout notificationsCount={0}>
      <FadeInSection>
        <div className="space-y-8">
          <Alert className="bg-blue-900/20 border-blue-500/20 text-white">
            <AlertTitle className="text-white">User Management</AlertTitle>
            <AlertDescription className="text-gray-300">
              Manage security team users and organization employees. Security team users access this dashboard, while employees' emails are monitored for threats.
            </AlertDescription>
          </Alert>

          {/* Security Team Users Section */}
          <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Users className="h-5 w-5 text-white" />
                    Security Team Users
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    Manage users who have access to the security dashboard
                  </CardDescription>
                </div>
                <Dialog open={isAddUserOpen} onOpenChange={(open) => {
                  setIsAddUserOpen(open)
                  if (!open) resetUserDialogState()
                }}>
                  <DialogTrigger asChild>
                    <Button className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]">
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add User
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md bg-[#0f0f0f] border-[#1f1f1f] text-white">
                    <DialogHeader>
                      <DialogTitle className="text-white">Add Security Team Users</DialogTitle>
                      <DialogDescription className="text-gray-400">
                        Select users from your Security Team Cognito user pool to add to the security team.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                      {/* Role Selection */}
                      <div className="space-y-2">
                        <Label htmlFor="role" className="text-white">Assign Role</Label>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="w-full justify-between bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]">
                              {selectedRole}
                              <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-full bg-[#1f1f1f] border-[#1f1f1f]">
                            {availableRoles.map((role) => (
                              <DropdownMenuItem
                                key={role}
                                onClick={() => setSelectedRole(role)}
                                className="text-white focus:bg-[#2a2a2a] focus:text-white"
                              >
                                {role}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* User Selection Dropdown */}
                      <div className="space-y-2">
                        <Label className="text-white">Select Users</Label>
                        <DropdownMenu open={isUserDropdownOpen} onOpenChange={setIsUserDropdownOpen}>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="w-full justify-between bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]">
                              {selectedUsers.length === 0 
                                ? "Select users..." 
                                : `${selectedUsers.length} user${selectedUsers.length > 1 ? 's' : ''} selected`}
                              <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-80 max-h-80 overflow-auto bg-[#1f1f1f] border-[#1f1f1f]">
                            {/* Search */}
                            <div className="p-2">
                              <Input
                                placeholder="Search users..."
                                value={userSearchQuery}
                                onChange={(e) => setUserSearchQuery(e.target.value)}
                                className="h-8 bg-[#1f1f1f] border-[#1f1f1f] text-white placeholder:text-gray-400 focus:bg-[#2a2a2a] focus:border-[#2a2a2a]"
                              />
                            </div>
                            
                            <DropdownMenuSeparator />
                            
                            {/* Select All */}
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                              <div className="flex items-center space-x-2 w-full">
                                <Checkbox
                                  checked={selectedUsers.length === filteredAvailableUsers.length && filteredAvailableUsers.length > 0}
                                  onCheckedChange={handleSelectAllUsers}
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
                          resetUserDialogState()
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
                    className="max-w-sm bg-[#1f1f1f] border-[#1f1f1f] text-white placeholder:text-gray-400 focus:bg-[#2a2a2a] focus:border-[#2a2a2a]"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      refreshUsers()
                      refreshPoolUsers()
                    }}
                    disabled={usersLoading || poolLoading}
                    className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
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
                    <TableRow className="hover:bg-[#1f1f1f] border-[#1f1f1f]">
                      <TableHead className="text-white">Name</TableHead>
                      <TableHead className="text-white">Email</TableHead>
                      <TableHead className="text-white">Role</TableHead>
                      <TableHead className="text-white">Status</TableHead>
                      <TableHead className="text-white">Last Login</TableHead>
                      <TableHead className="text-right text-white">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length > 0 ? (
                      filteredUsers.map((user: User) => (
                        <TableRow key={user.id} className="hover:bg-[#1f1f1f] border-[#1f1f1f]">
                          <TableCell className="font-medium text-white">{user.name || user.email}</TableCell>
                          <TableCell className="text-white">{user.email}</TableCell>
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

          {/* Organization Employees Section - UPDATED WITH DROPDOWN */}
          <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-white">Organization Employees</CardTitle>
                  <CardDescription className="text-gray-400">
                    Manage employees whose emails will be monitored for security threats. Select directly from AWS WorkMail.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Dialog open={isAddEmpOpen} onOpenChange={(open) => {
                    setIsAddEmpOpen(open)
                    if (!open) resetEmpDialogState()
                  }}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]">
                        <UserPlus className="mr-2 h-4 w-4" />
                        Add Employee
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md bg-[#0f0f0f] border-[#1f1f1f] text-white">
                      <DialogHeader>
                        <DialogTitle className="text-white">Add Employees to Monitoring</DialogTitle>
                        <DialogDescription className="text-gray-400">
                          Select employees from your WorkMail organization to add to email monitoring.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4">
                        {/* Employee Selection Dropdown */}
                        <div className="space-y-2">
                          <Label className="text-white">Select Employees</Label>
                          <DropdownMenu open={isEmpDropdownOpen} onOpenChange={setIsEmpDropdownOpen}>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" className="w-full justify-between bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]">
                                {selectedEmployees.length === 0 
                                  ? "Select employees..." 
                                  : `${selectedEmployees.length} employee${selectedEmployees.length > 1 ? 's' : ''} selected`}
                                <ChevronDown className="ml-2 h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-80 max-h-80 overflow-auto bg-[#1f1f1f] border-[#1f1f1f]">
                              {/* Search */}
                              <div className="p-2">
                                <Input
                                  placeholder="Search employees..."
                                  value={empSearchQuery}
                                  onChange={(e) => setEmpSearchQuery(e.target.value)}
                                  className="h-8 bg-[#1f1f1f] border-[#1f1f1f] text-white placeholder:text-gray-400 focus:bg-[#2a2a2a] focus:border-[#2a2a2a]"
                                />
                              </div>
                              
                              <DropdownMenuSeparator />
                              
                              {/* Select All */}
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                <div className="flex items-center space-x-2 w-full">
                                  <Checkbox
                                    checked={selectedEmployees.length === filteredAvailableWorkMailUsers.length && filteredAvailableWorkMailUsers.length > 0}
                                    onCheckedChange={handleSelectAllEmployees}
                                  />
                                  <span className="font-medium">Select All</span>
                                </div>
                              </DropdownMenuItem>
                              
                              <DropdownMenuSeparator />

                              {/* Loading State */}
                              {workMailLoading && (
                                <DropdownMenuLabel className="text-muted-foreground">
                                  Loading employees...
                                </DropdownMenuLabel>
                              )}

                              {/* Error State */}
                              {workMailError && (
                                <DropdownMenuLabel className="text-destructive">
                                  Error loading employees: {workMailError.message}
                                </DropdownMenuLabel>
                              )}

                              {/* Employee List */}
                              {!workMailLoading && !workMailError && filteredAvailableWorkMailUsers.length === 0 && (
                                <DropdownMenuLabel className="text-muted-foreground">
                                  {availableWorkMailUsers.length === 0 
                                    ? "All employees have been added to monitoring"
                                    : "No employees match your search"}
                                </DropdownMenuLabel>
                              )}

                              {filteredAvailableWorkMailUsers.map((user) => (
                                <DropdownMenuItem key={user.id} onSelect={(e) => e.preventDefault()}>
                                  <div className="flex items-center space-x-2 w-full">
                                    <Checkbox
                                      checked={selectedEmployees.includes(user.id)}
                                      onCheckedChange={() => toggleEmployeeSelection(user.id)}
                                    />
                                    <div className="flex-1">
                                      <div className="font-medium">{user.name}</div>
                                      <div className="text-sm text-muted-foreground">{user.email}</div>
                                      {user.department && (
                                        <div className="text-xs text-muted-foreground">{user.department}</div>
                                      )}
                                    </div>
                                    {selectedEmployees.includes(user.id) && (
                                      <Check className="h-4 w-4 text-primary" />
                                    )}
                                  </div>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Selected Employees Preview */}
                        {selectedEmployees.length > 0 && (
                          <div className="space-y-2">
                            <Label>Selected Employees ({selectedEmployees.length})</Label>
                            <div className="max-h-24 overflow-auto space-y-1 p-2 border rounded">
                              {selectedEmployees.map((userId) => {
                                const user = workMailUsers.find(u => u.id === userId)
                                return (
                                  <div key={userId} className="flex items-center justify-between text-sm">
                                    <span className="truncate flex-1">{user?.name} ({user?.email})</span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => toggleEmployeeSelection(userId)}
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
                            setIsAddEmpOpen(false)
                            resetEmpDialogState()
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleAddSelectedEmployees}
                          disabled={empLoading || selectedEmployees.length === 0}
                        >
                          {empLoading ? "Adding..." : `Add ${selectedEmployees.length} Employee${selectedEmployees.length > 1 ? 's' : ''}`}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  
                  <Button 
                    variant="default"
                    onClick={handleSyncFromWorkMail}
                    disabled={isWorkmailSyncing}
                    className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
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
                <Alert className="bg-blue-900/20 border-blue-500/20 text-white">
                  <Info className="h-4 w-4 text-blue-400" />
                  <AlertTitle className="text-white">AWS WorkMail Integration</AlertTitle>
                  <AlertDescription className="text-gray-300">
                    {workmailStatus?.connected ? (
                      <>
                        ✅ Connected to WorkMail Organization: <code>{workmailStatus.organizationAlias || workmailStatus.organizationId}</code>
                      </>
                    ) : (
                      <>
                        ❌ WorkMail not configured. Please connect AWS WorkMail in Cloud Services.
                      </>
                    )}
                  </AlertDescription>
                </Alert>

                <div className="flex items-center justify-between">
                  <Input
                    placeholder="Search employees..."
                    value={searchEmp}
                    onChange={(e) => setSearchEmp(e.target.value)}
                    className="max-w-sm bg-[#1f1f1f] border-[#1f1f1f] text-white placeholder:text-gray-400 focus:bg-[#2a2a2a] focus:border-[#2a2a2a]"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        refreshEmployees()
                        refreshWorkMailUsers()
                      }}
                      disabled={empLoading || workMailLoading}
                      className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
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
                    <TableRow className="hover:bg-[#1f1f1f] border-[#1f1f1f]">
                      <TableHead className="text-white">Name</TableHead>
                      <TableHead className="text-white">Email</TableHead>
                      <TableHead className="text-white">Department</TableHead>
                      <TableHead className="text-white">Job Title</TableHead>
                      <TableHead className="text-white">Status</TableHead>
                      <TableHead className="text-white">Last Sync</TableHead>
                      <TableHead className="text-right text-white">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmps.length > 0 ? (
                      filteredEmps.map((employee: Employee) => (
                        <TableRow key={employee.id} className="hover:bg-[#1f1f1f] border-[#1f1f1f]">
                          <TableCell className="font-medium text-white">{employee.name || employee.email}</TableCell>
                          <TableCell className="text-white">{employee.email}</TableCell>
                          <TableCell className="text-white">{employee.department || "—"}</TableCell>
                          <TableCell className="text-white">{employee.jobTitle || "—"}</TableCell>
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
                                <span className="text-xs text-gray-400">
                                  {new Date(employee.syncedFromWorkMail).toLocaleDateString()}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">Manual</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-400 hover:bg-red-900/30 hover:text-red-300"
                              onClick={() => removeEmployee(employee.id)}
                            >
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-gray-400">
                          {empLoading ? "Loading employees..." : "No employees being monitored. Use 'Add Employee' to select from WorkMail or 'Sync from WorkMail' to import all."}
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