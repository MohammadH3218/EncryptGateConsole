"use client"

import { useState } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { DetectionsList } from "@/components/detections-list"
import { FadeInSection } from "@/components/fade-in-section"
import { useRouter } from "next/navigation"
import { logout } from "@/lib/auth"
import { useDetections } from "@/contexts/DetectionsContext"

export default function DetectionsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const router = useRouter()
  const { updateDetection } = useDetections()

  const handleSignOut = () => {
    logout()
    router.push("/login")
  }

  const handleAssign = (id: number, assignedTo: string[], action: "assign" | "unassign") => {
    updateDetection(id, { assignedTo: action === "assign" ? assignedTo : [] })
  }

  return (
    <div className="min-h-screen bg-background animated-background">
      <DashboardHeader onSearch={setSearchQuery} username="John Doe" onSignOut={handleSignOut} />
      <main className="p-4">
        <FadeInSection>
          <DetectionsList searchQuery={searchQuery} onAssign={handleAssign} />
        </FadeInSection>
      </main>
    </div>
  )
}

