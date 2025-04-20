"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { DetectionsList } from "@/components/detections-list"
import { FadeInSection } from "@/components/fade-in-section"
import { useRouter } from "next/navigation"

export default function DetectionsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const router = useRouter()

  // Check if user is logged in
   useEffect(() => {
    const token = localStorage.getItem("access_token")
    if (!token) {
      router.push("/login")
    }
  }, [router]) 

  const handleAssign = (id: number, assignedTo: string[], action: "assign" | "unassign") => {
    // In a real app, this would call an API to update the detection
    console.log(`Detection ${id} ${action === "assign" ? "assigned to" : "unassigned from"} ${assignedTo.join(", ")}`)
  }

  return (
    <AppLayout username="John Doe" onSearch={setSearchQuery} notificationsCount={3}>
      <FadeInSection>
        <h2 className="text-2xl font-bold mb-4">Detections</h2>
        <DetectionsList searchQuery={searchQuery} />
      </FadeInSection>
    </AppLayout>
  )
}
