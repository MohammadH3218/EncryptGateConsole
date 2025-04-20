"use client"

import { useState, useEffect, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmployeeDialog } from "./employee-dialog"
import { useRouter } from "next/navigation"

interface Employee {
  id: string
  name: string
  username: string
  email: string
  position: string
  department: string
  hireDate: string
}

interface EmployeesListProps {
  searchQuery: string
}

export function EmployeesList({ searchQuery }: EmployeesListProps) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        // TODO: Implement API call to fetch employees
        // const data = await fetchEmployeesFromAPI()
        // setEmployees(data)
      } catch (error) {
        console.error("Error fetching employees:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchEmployees()
  }, [])

  const filteredEmployees = useMemo(() => {
    return employees
      .filter((employee) =>
        Object.values(employee).some((value) => value.toLowerCase().includes(searchQuery.toLowerCase())),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [searchQuery, employees])

  const handleEmployeeClick = (employee: Employee) => {
    setSelectedEmployee(employee)
  }

  const handleViewEmails = (employee: Employee) => {
    router.push(`/admin/all-emails?employee=${employee.email}`)
  }

  if (isLoading) {
    return <div>Loading employees...</div>
  }

  return (
    <>
      <Card className="border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEmployees.map((employee) => (
              <TableRow
                key={employee.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleEmployeeClick(employee)}
              >
                <TableCell className="font-medium">{employee.name}</TableCell>
                <TableCell>{employee.id}</TableCell>
                <TableCell>{employee.username}</TableCell>
                <TableCell>{employee.email}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <EmployeeDialog
        employee={selectedEmployee}
        open={selectedEmployee !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedEmployee(null)
        }}
        onViewEmails={handleViewEmails}
        showRoles={false}
      />
    </>
  )
}
