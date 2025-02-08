"use client"

import { useState } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { AssignmentsList } from "@/components/assignments-list"
import { FadeInSection } from "@/components/fade-in-section"
import { useDetections } from "@/contexts/DetectionsContext"
import { useRouter } from "next/navigation"
import { logout } from "@/lib/auth"

export default function AssignmentsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const { addNotification, detections, updateDetection } = useDetections()
  const router = useRouter()

  const handleSignOut = () => {
    logout()
    router.push("/login")
  }

  const handleAssign = (id: number, assignedTo: string[], action: "assign" | "unassign") => {
    updateDetection(id, { assignedTo: action === "assign" ? assignedTo : [] })
    addNotification(
      `Detection ${id} has been ${action === "assign" ? "assigned to" : "unassigned from"} ${assignedTo.join(", ")}`,
    )
  }

  return (
    <div className="min-h-screen bg-background animated-background">
      <DashboardHeader onSearch={setSearchQuery} username="John Doe" onSignOut={handleSignOut} />
      <main className="p-4">
        <FadeInSection>
          <h2 className="text-2xl font-bold mb-4">Assignments</h2>
          <AssignmentsList searchQuery={searchQuery} assignments={detections} onAssign={handleAssign} />
        </FadeInSection>
      </main>
    </div>
  )
}

