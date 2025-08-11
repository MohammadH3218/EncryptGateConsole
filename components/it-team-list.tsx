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
    return <div className="text-white">Loading IT team members...</div>
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
              <TableHead className="text-white">Roles</TableHead>
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
                <TableCell className="text-white">{employee.roles.join(", ")}</TableCell>
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
