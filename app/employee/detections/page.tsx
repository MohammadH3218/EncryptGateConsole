"use client"

import { useState } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { DetectionsList } from "@/components/detections-list"
import { FadeInSection } from "@/components/fade-in-section"

export default function EmployeeDetectionsPage() {
  const [searchQuery, setSearchQuery] = useState("")

  const handleSignOut = () => {
    console.log("User signed out")
  }

  return (
    <div className="min-h-screen bg-background animated-background">
      <DashboardHeader onSearch={setSearchQuery} username="John Doe" onSignOut={handleSignOut} />
      <main className="p-4">
        <FadeInSection>
          <DetectionsList searchQuery={searchQuery} />
        </FadeInSection>
      </main>
    </div>
  )
}

