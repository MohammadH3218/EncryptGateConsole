"use client"

import { useState } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { FadeInSection } from "@/components/fade-in-section"
import { PushedDetectionsList } from "@/components/pushed-detections-list"
import { useDetections } from "@/contexts/DetectionsContext"
import { useRouter } from "next/navigation"
import { logout } from "@/lib/auth"

export default function PushedRequestsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const { pushedDetections, updateDetection } = useDetections()
  const router = useRouter()

  const handleSignOut = async () => {
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
          <h2 className="text-2xl font-bold mb-4">Pushed Requests</h2>
          <PushedDetectionsList searchQuery={searchQuery} pushedDetections={pushedDetections} onAssign={handleAssign} />
        </FadeInSection>
      </main>
    </div>
  )
}

