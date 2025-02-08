"use client"

import { useState } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { AssignmentsList } from "@/components/assignments-list"
import { FadeInSection } from "@/components/fade-in-section"
import { useDetections } from "@/contexts/DetectionsContext"

export default function EmployeeAssignmentsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const { addNotification, detections } = useDetections()

  const handleSignOut = () => {
    console.log("User signed out")
  }

  const handleAssign = (detectionId: number, assignee: string) => {
    console.log(`Assigning detection ${detectionId} to ${assignee}`)
    addNotification(`Detection ${detectionId} has been assigned to ${assignee}`)
  }

  // Filter assignments for John Doe
  const johnDoeAssignments = detections.filter((detection) =>
    Array.isArray(detection.assignedTo)
      ? detection.assignedTo.includes("John Doe")
      : detection.assignedTo === "John Doe",
  )

  return (
    <div className="min-h-screen bg-background animated-background">
      <DashboardHeader onSearch={setSearchQuery} username="John Doe" onSignOut={handleSignOut} />
      <main className="p-4">
        <FadeInSection>
          <h2 className="text-2xl font-bold mb-4">Your Assignments</h2>
          <AssignmentsList searchQuery={searchQuery} assignments={johnDoeAssignments} onAssign={handleAssign} />
        </FadeInSection>
      </main>
    </div>
  )
}

