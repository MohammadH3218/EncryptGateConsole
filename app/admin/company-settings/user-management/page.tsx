// app/(client)/admin/company-settings/user-management/page.tsx

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
import { Badge } from "@/components/ui/badge"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { UserPlus, MoreHorizontal, Cloud } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

import { useCloudServices } from "@/hooks/useCloudServices"
import { useUsers, User } from "@/hooks/useUsers"
import { useEmployees, Employee } from "@/hooks/useEmployees"
// NEW: hook to fetch *all* pool users from Cognito
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
  } = useUsers()

  const {
    employees,
    loading: empLoading,
    error: empError,
    addEmployee,
    removeEmployee,
  } = useEmployees()

  // NEW: pull in all Cognito users
  const {
    poolUsers,
    loading: poolLoading,
    error: poolError,
  } = usePoolUsers()

  const [searchUser, setSearchUser] = useState("")
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)

  // NEW: track which usernames are selected
  const [selected, setSelected] = useState<string[]>([])
  const [selectAll, setSelectAll] = useState(false)

  // NEW: shared role for all selected
  const [selectedRole, setSelectedRole] = useState("Security Admin")

  const [searchEmp, setSearchEmp] = useState("")
  const [isAddEmpOpen, setIsAddEmpOpen] = useState(false)
  const [newEmpEmail, setNewEmpEmail] = useState("")

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchUser.toLowerCase()) ||
      u.email.toLowerCase().includes(searchUser.toLowerCase())
  )
  const filteredEmps = employees.filter((e) =>
    e.email.toLowerCase().includes(searchEmp.toLowerCase())
  )

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
          <Button
            onClick={() =>
              router.push("/admin/company-settings/cloud-services")
            }
          >
            Connect Service
          </Button>
        </FadeInSection>
      </AppLayout>
    )
  }

  const toggleSelect = (username: string) => {
    setSelected((prev) =>
      prev.includes(username)
        ? prev.filter((u) => u !== username)
        : [...prev, username]
    )
  }

  // keep “Select All” in sync
  useEffect(() => {
    if (!poolUsers || poolUsers.length === 0) return
    if (selectAll) {
      setSelected(poolUsers.map((u) => u.username))
    } else if (selected.length === poolUsers.length) {
      setSelectAll(true)
    }
  }, [selectAll, poolUsers, selected.length])

  const handleAddUser = async () => {
    try {
      // for each selected, lookup poolUsers for name/email then call addUser
      await Promise.all(
        selected.map((username) => {
          const pu = poolUsers.find((u) => u.username === username)!
          return addUser({
            name: pu.name,
            email: pu.email,
            role: selectedRole,
          })
        })
      )
      toast({
        title: "User(s) Added",
        description: `Added ${selected.length} user${
          selected.length > 1 ? "s" : ""
        }.`,
      })
      setIsAddUserOpen(false)
      setSelected([])
      setSelectAll(false)
      setSelectedRole("Security Admin")
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: (err as Error).message,
      })
    }
  }

  const handleAddEmployee = async () => {
    try {
      await addEmployee(newEmpEmail)
      toast({
        title: "Employee Added",
        description: `${newEmpEmail} was added.`,
      })
      setIsAddEmpOpen(false)
      setNewEmpEmail("")
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: (err as Error).message,
      })
    }
  }

  return (
    <AppLayout username="John Doe" onSearch={() => {}} notificationsCount={0}>
      <FadeInSection>
        <Alert>
          <AlertTitle>User Management</AlertTitle>
          <AlertDescription>
            Users added here will be created in {services[0].name}.
          </AlertDescription>
        </Alert>

        {/* --- Security Team Users --- */}
        <div className="flex justify-between items-center mt-6 mb-4">
          <Input
            placeholder="Search users..."
            value={searchUser}
            onChange={(e) => setSearchUser(e.target.value)}
            className="w-1/3"
          />
          <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Existing Cognito User(s)</DialogTitle>
                <DialogDescription>
                  Pick one or more users to invite.
                </DialogDescription>
              </DialogHeader>

              {/* show loading / error */}
              {poolLoading && <p>Loading users…</p>}
              {poolError && (
                <Alert variant="destructive">
                  <AlertTitle>Error loading pool users</AlertTitle>
                  <AlertDescription>
                    {poolError.message}
                  </AlertDescription>
                </Alert>
              )}

              {/* multi-select list */}
              {poolUsers.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <input
                      id="selectAll"
                      type="checkbox"
                      checked={selectAll}
                      onChange={(e) => setSelectAll(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="selectAll" className="font-medium">
                      Select All
                    </Label>
                  </div>
                  <div className="h-40 overflow-auto border rounded p-2">
                    {poolUsers.map((u: PoolUser) => (
                      <div
                        key={u.username}
                        className="flex items-center py-1"
                      >
                        <input
                          id={`user-${u.username}`}
                          type="checkbox"
                          checked={selected.includes(u.username)}
                          onChange={() => toggleSelect(u.username)}
                          className="h-4 w-4"
                        />
                        <label
                          htmlFor={`user-${u.username}`}
                          className="ml-2"
                        >
                          {u.name} ({u.email})
                        </label>
                      </div>
                    ))}
                  </div>

                  {/* role picker */}
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="role" className="text-right">
                      Role
                    </Label>
                    <select
                      id="role"
                      value={selectedRole}
                      onChange={(e) =>
                        setSelectedRole(e.target.value)
                      }
                      className="col-span-3 input"
                    >
                      <option>Security Admin</option>
                      <option>IT Specialist</option>
                      <option>Security Analyst</option>
                      <option>Team Lead</option>
                    </select>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsAddUserOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddUser}
                  disabled={poolLoading || usersLoading || selected.length === 0}
                >
                  {usersLoading ? "Adding…" : "Add Selected"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {usersError && (
          <Alert variant="destructive" className="mb-4">
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
              filteredUsers.map((u: User) => (
                <TableRow key={u.id}>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.role}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        u.status === "active"
                          ? "bg-green-500/10 text-green-500"
                          : "bg-yellow-500/10 text-yellow-500"
                      }
                    >
                      {u.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.lastLogin
                      ? new Date(u.lastLogin).toLocaleString()
                      : "Never"}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        router.push(
                          `/admin/company-settings/roles?user=${encodeURIComponent(
                            u.id
                          )}`
                        )
                      }
                    >
                      <MoreHorizontal className="mr-1 h-4 w-4" />
                      Roles
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600"
                      onClick={() => deleteUser(u.id)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6">
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* --- Organization Employees (unchanged) --- */}
        <div className="flex justify-between items-center mt-8 mb-4">
          <Input
            placeholder="Search employees..."
            value={searchEmp}
            onChange={(e) => setSearchEmp(e.target.value)}
            className="w-1/3"
          />
          <Dialog open={isAddEmpOpen} onOpenChange={setIsAddEmpOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Employee
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Employee</DialogTitle>
                <DialogDescription>
                  Enter the email of the employee to onboard.
                </DialogDescription>
              </DialogHeader>
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
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsAddEmpOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleAddEmployee} disabled={empLoading}>
                  {empLoading ? "Adding…" : "Add Employee"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {empError && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Error loading employees</AlertTitle>
            <AlertDescription>{empError.message}</AlertDescription>
          </Alert>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEmps.length > 0 ? (
              filteredEmps.map((e: Employee) => (
                <TableRow key={e.id}>
                  <TableCell>{e.email}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEmployee(e.id)}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={2} className="text-center py-6">
                  No employees found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </FadeInSection>
    </AppLayout>
  )
}
