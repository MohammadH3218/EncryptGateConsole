"use client"

import { useState, useEffect, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmployeeDialog } from "./employee-dialog"
import { useRouter } from "next/navigation"

interface ITTeamMember {
  id: string
  name: string
  username: string
  email: string
  position: string
  department: string
  hireDate: string
  roles: string[]
}

interface ITTeamListProps {
  searchQuery: string
}

export function ITTeamList({ searchQuery }: ITTeamListProps) {
  const [itTeamMembers, setITTeamMembers] = useState<ITTeamMember[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<ITTeamMember | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const fetchITTeamMembers = async () => {
      try {
        // TODO: Implement API call to fetch IT team members
        // const data = await fetchITTeamMembersFromAPI()
        // setITTeamMembers(data)
      } catch (error) {
        console.error("Error fetching IT team members:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchITTeamMembers()
  }, [])

  const filteredEmployees = useMemo(() => {
    return itTeamMembers
      .filter((employee) =>
        Object.values(employee).some(
          (value) => typeof value === "string" && value.toLowerCase().includes(searchQuery.toLowerCase()),
        ),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [searchQuery, itTeamMembers])

  const handleEmployeeClick = (employee: ITTeamMember) => {
    setSelectedEmployee(employee)
  }

  const handleViewEmails = (employee: ITTeamMember) => {
    router.push(`/admin/all-emails?employee=${employee.email}`)
  }

  if (isLoading) {
    return <div>Loading IT team members...</div>
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
              <TableHead>Roles</TableHead>
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
                <TableCell>{employee.roles.join(", ")}</TableCell>
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
        showRoles={true}
      />
    </>
  )
}
