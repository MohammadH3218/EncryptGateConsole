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
    return <div className="text-white">Loading employees...</div>
  }

  return (
    <>
      <Card className="border-none bg-[#0f0f0f] shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-[#1f1f1f] border-[#1f1f1f]">
              <TableHead className="text-white">Name</TableHead>
              <TableHead className="text-white">ID</TableHead>
              <TableHead className="text-white">Username</TableHead>
              <TableHead className="text-white">Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEmployees.map((employee) => (
              <TableRow
                key={employee.id}
                className="cursor-pointer hover:bg-[#1f1f1f] border-[#1f1f1f]"
                onClick={() => handleEmployeeClick(employee)}
              >
                <TableCell className="font-medium text-white">{employee.name}</TableCell>
                <TableCell className="text-white">{employee.id}</TableCell>
                <TableCell className="text-white">{employee.username}</TableCell>
                <TableCell className="text-white">{employee.email}</TableCell>
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
