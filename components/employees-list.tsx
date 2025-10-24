"use client"

import { useState, useEffect, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useToast } from "@/components/ui/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Plus, Trash2, CheckSquare, Square, Loader2, AlertTriangle, ExternalLink, Search } from "lucide-react"
import { useEmployees } from "@/hooks/useEmployees"

interface Employee {
  id: string
  name: string
  email: string
  department?: string
  jobTitle?: string
  status: string
  addedAt: string | null
  lastEmailProcessed: string | null
}

interface WorkMailUser {
  id: string
  name: string
  email: string
  department?: string
  jobTitle?: string
  state: string
}

export function EmployeesList() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string
  const { toast } = useToast()
  const { employees, loading, error, addEmployee, removeEmployee, refresh } = useEmployees()

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set())
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  // WorkMail integration
  const [workMailUsers, setWorkMailUsers] = useState<WorkMailUser[]>([])
  const [selectedWorkMailUsers, setSelectedWorkMailUsers] = useState<Set<string>>(new Set())
  const [loadingWorkMailUsers, setLoadingWorkMailUsers] = useState(false)
  const [workMailError, setWorkMailError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Fetch available WorkMail users
  const fetchWorkMailUsers = async () => {
    setLoadingWorkMailUsers(true)
    setWorkMailError(null)
    try {
      const res = await fetch("/api/company-settings/employees/workmail-users", {
        headers: { "x-org-id": orgId },
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || data.message || "Failed to fetch WorkMail users")
      }

      const data: WorkMailUser[] = await res.json()
      setWorkMailUsers(data)
    } catch (err: any) {
      console.error("Error fetching WorkMail users:", err)
      setWorkMailError(err.message)
    } finally {
      setLoadingWorkMailUsers(false)
    }
  }

  // Handle opening add dialog
  const handleOpenAddDialog = () => {
    setIsAddDialogOpen(true)
    fetchWorkMailUsers()
  }

  // Handle adding selected employees
  const handleAddEmployees = async () => {
    if (selectedWorkMailUsers.size === 0) {
      toast({
        variant: "destructive",
        title: "No employees selected",
        description: "Please select at least one employee to add.",
      })
      return
    }

    setAdding(true)
    try {
      const usersToAdd = workMailUsers.filter(user => selectedWorkMailUsers.has(user.id))

      for (const user of usersToAdd) {
        await addEmployee({
          name: user.name,
          email: user.email,
          department: user.department || "",
          jobTitle: user.jobTitle || "",
        })
      }

      toast({
        title: "Employees added",
        description: `Successfully added ${usersToAdd.length} employee(s) to monitoring.`,
      })

      setIsAddDialogOpen(false)
      setSelectedWorkMailUsers(new Set())
      refresh()
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error adding employees",
        description: err.message,
      })
    } finally {
      setAdding(false)
    }
  }

  // Handle deleting selected employees
  const handleDeleteEmployees = async () => {
    setDeleting(true)
    try {
      for (const employeeId of selectedEmployees) {
        await removeEmployee(employeeId)
      }

      toast({
        title: "Employees removed",
        description: `Successfully removed ${selectedEmployees.size} employee(s) from monitoring.`,
      })

      setSelectedEmployees(new Set())
      setIsDeleteDialogOpen(false)
      refresh()
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error removing employees",
        description: err.message,
      })
    } finally {
      setDeleting(false)
    }
  }

  // Filter employees based on search query
  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) =>
      employee.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      employee.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      employee.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      employee.jobTitle?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [employees, searchQuery])

  // Select all employees
  const handleSelectAll = () => {
    if (selectedEmployees.size === filteredEmployees.length) {
      setSelectedEmployees(new Set())
    } else {
      setSelectedEmployees(new Set(filteredEmployees.map(e => e.id)))
    }
  }

  // Toggle employee selection
  const toggleEmployeeSelection = (employeeId: string) => {
    const newSelected = new Set(selectedEmployees)
    if (newSelected.has(employeeId)) {
      newSelected.delete(employeeId)
    } else {
      newSelected.add(employeeId)
    }
    setSelectedEmployees(newSelected)
  }

  // Toggle WorkMail user selection
  const toggleWorkMailUserSelection = (userId: string) => {
    const newSelected = new Set(selectedWorkMailUsers)
    if (newSelected.has(userId)) {
      newSelected.delete(userId)
    } else {
      newSelected.add(userId)
    }
    setSelectedWorkMailUsers(newSelected)
  }

  // Select all WorkMail users
  const handleSelectAllWorkMailUsers = () => {
    if (selectedWorkMailUsers.size === workMailUsers.length) {
      setSelectedWorkMailUsers(new Set())
    } else {
      setSelectedWorkMailUsers(new Set(workMailUsers.map(u => u.id)))
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filter employees..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-[300px] bg-[#1f1f1f] border-[#2a2a2a] text-white"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            className="bg-[#1f1f1f] border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
          >
            {selectedEmployees.size === filteredEmployees.length && filteredEmployees.length > 0 ? (
              <>
                <CheckSquare className="mr-2 h-4 w-4" />
                Deselect All
              </>
            ) : (
              <>
                <Square className="mr-2 h-4 w-4" />
                Select All
              </>
            )}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenAddDialog}
            className="bg-[#1f1f1f] border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Employees
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsDeleteDialogOpen(true)}
            disabled={selectedEmployees.size === 0}
            className="bg-[#1f1f1f] border-[#2a2a2a] text-red-500 hover:bg-[#2a2a2a] hover:text-red-400 disabled:opacity-50"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete ({selectedEmployees.size})
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className="border-none bg-[#0f0f0f] shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-[#1f1f1f] border-[#1f1f1f]">
              <TableHead className="w-[50px]"></TableHead>
              <TableHead className="text-white">Name</TableHead>
              <TableHead className="text-white">Email</TableHead>
              <TableHead className="text-white">Department</TableHead>
              <TableHead className="text-white">Job Title</TableHead>
              <TableHead className="text-white">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-white py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Loading employees...
                </TableCell>
              </TableRow>
            ) : filteredEmployees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-400 py-8">
                  No employees found. Click "Add Employees" to get started.
                </TableCell>
              </TableRow>
            ) : (
              filteredEmployees.map((employee) => (
                <TableRow
                  key={employee.id}
                  className="cursor-pointer hover:bg-[#1f1f1f] border-[#1f1f1f]"
                  onClick={() => toggleEmployeeSelection(employee.id)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedEmployees.has(employee.id)}
                      onCheckedChange={() => toggleEmployeeSelection(employee.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium text-white">{employee.name}</TableCell>
                  <TableCell className="text-white">{employee.email}</TableCell>
                  <TableCell className="text-white">{employee.department || "—"}</TableCell>
                  <TableCell className="text-white">{employee.jobTitle || "—"}</TableCell>
                  <TableCell className="text-white">
                    <span className="px-2 py-1 rounded-full text-xs bg-green-500/10 text-green-500">
                      {employee.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Add Employees Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="bg-[#0f0f0f] border-[#1f1f1f] text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">Add Employees from WorkMail</DialogTitle>
            <DialogDescription className="text-gray-400">
              Select employees from your AWS WorkMail organization to monitor their emails.
            </DialogDescription>
          </DialogHeader>

          {workMailError ? (
            <Alert variant="destructive" className="bg-red-900/20 border-red-500/20">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>WorkMail Not Connected</AlertTitle>
              <AlertDescription className="mt-2">
                {workMailError}
                <div className="mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/o/${orgId}/admin/company-settings/cloud-services`)}
                    className="bg-[#1f1f1f] border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Go to Cloud Services
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : loadingWorkMailUsers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span className="text-gray-400">Loading WorkMail users...</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">
                  {workMailUsers.length} available employees
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAllWorkMailUsers}
                  className="bg-[#1f1f1f] border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
                >
                  {selectedWorkMailUsers.size === workMailUsers.length && workMailUsers.length > 0
                    ? "Deselect All"
                    : "Select All"}
                </Button>
              </div>

              <div className="border border-[#2a2a2a] rounded-md max-h-[400px] overflow-y-auto">
                {workMailUsers.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">
                    No available employees found in WorkMail.
                  </div>
                ) : (
                  <div className="space-y-1 p-2">
                    {workMailUsers.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center space-x-3 p-3 rounded-md hover:bg-[#1f1f1f] cursor-pointer"
                        onClick={() => toggleWorkMailUserSelection(user.id)}
                      >
                        <Checkbox
                          checked={selectedWorkMailUsers.has(user.id)}
                          onCheckedChange={() => toggleWorkMailUserSelection(user.id)}
                        />
                        <div className="flex-1">
                          <p className="font-medium text-white">{user.name}</p>
                          <p className="text-sm text-gray-400">{user.email}</p>
                          {user.department && (
                            <p className="text-xs text-gray-500">{user.department}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddDialogOpen(false)
                setSelectedWorkMailUsers(new Set())
              }}
              className="bg-[#1f1f1f] border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddEmployees}
              disabled={selectedWorkMailUsers.size === 0 || adding || !!workMailError}
              className="bg-[#1f1f1f] border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
            >
              {adding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>Add {selectedWorkMailUsers.size} Employee(s)</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="bg-[#0f0f0f] border-[#1f1f1f] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Delete Employees</DialogTitle>
            <DialogDescription className="text-gray-400">
              Are you sure you want to remove {selectedEmployees.size} employee(s) from monitoring?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              className="bg-[#1f1f1f] border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteEmployees}
              disabled={deleting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>Delete</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
