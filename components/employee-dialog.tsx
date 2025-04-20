"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Mail, UserCog } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "next/navigation"

interface Employee {
  id: string
  name: string
  username: string
  email: string
  position: string
  department: string
  hireDate: string
  roles?: string[]
}

interface EmployeeDialogProps {
  employee: Employee | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onViewEmails: (employee: Employee) => void
  showRoles?: boolean
}

export function EmployeeDialog({ employee, open, onOpenChange, onViewEmails, showRoles = false }: EmployeeDialogProps) {
  const router = useRouter()
  const [showRolesDialog, setShowRolesDialog] = useState(false)

  const handleViewEmails = (employee: Employee) => {
    const isAdmin = window.location.pathname.includes("/admin")
    const baseRoute = isAdmin ? "/admin" : "/employee"
    router.push(`${baseRoute}/all-emails?employee=${employee.email}`)
  }

  if (!employee) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{employee.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium">ID:</span>
            <span className="col-span-3">{employee.id}</span>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium">Username:</span>
            <span className="col-span-3">{employee.username}</span>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium">Email:</span>
            <span className="col-span-3">{employee.email}</span>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium">Position:</span>
            <span className="col-span-3">{employee.position}</span>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium">Department:</span>
            <span className="col-span-3">{employee.department}</span>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium">Hire Date:</span>
            <span className="col-span-3">{employee.hireDate}</span>
          </div>
          {showRoles && employee.roles && (
            <div className="grid grid-cols-4 items-center gap-4">
              <span className="text-sm font-medium">Roles:</span>
              <div className="col-span-3 flex flex-wrap gap-2">
                {employee.roles.map((role) => (
                  <Badge key={role} variant="secondary">
                    {role}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={() => handleViewEmails(employee)}>
            <Mail className="mr-2 h-4 w-4" />
            View Emails
          </Button>
          {showRoles && (
            <Button onClick={() => setShowRolesDialog(true)}>
              <UserCog className="mr-2 h-4 w-4" />
              Manage Roles
            </Button>
          )}
        </div>
      </DialogContent>
      {showRoles && (
        <Dialog open={showRolesDialog} onOpenChange={setShowRolesDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Manage Roles for {employee.name}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-muted-foreground mb-4">
                Here you can manage roles and permissions for this IT Team member. This feature is not yet implemented.
              </p>
              <div className="space-y-2">
                {employee.roles?.map((role) => (
                  <div key={role} className="flex items-center justify-between">
                    <span>{role}</span>
                    <Button variant="outline" size="sm">
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setShowRolesDialog(false)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  )
}
