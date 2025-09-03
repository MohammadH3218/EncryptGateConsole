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
        const response = await fetch('/api/auth/team-members')
        if (response.ok) {
          const data = await response.json()
          const members = data.team_members || data.teamMembers || []
          
          // Transform the team members to match ITTeamMember interface
          const itMembers = members.map((member: any, index: number) => ({
            id: member.id || `member-${index}`,
            name: member.name || 'Unknown User',
            username: member.email?.split('@')[0] || 'unknown',
            email: member.email || '',
            position: member.role || 'Team Member',
            department: 'Security',
            hireDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Random date within past year
            roles: [member.role || 'User']
          }))
          
          setITTeamMembers(itMembers)
        } else {
          console.error('Failed to fetch team members:', response.statusText)
        }
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
