"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { DetectionsList } from "@/components/detections-list"
import { FadeInSection } from "@/components/fade-in-section"
import { useRouter } from "next/navigation"

export default function DetectionsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const router = useRouter()

useEffect(() => {
  // Replace this with your actual logic to retrieve the idToken, e.g., from localStorage or cookies
  const idToken = typeof window !== "undefined" ? localStorage.getItem("idToken") : null;
  if (!idToken) {
    // Redirect to hosted login
    window.location.href = `https://us-east-1kpxz426n8.auth.us-east-1.amazoncognito.com/login?client_id=u7p7ddajvruk8rccoajj8o5h0&response_type=code&scope=email+openid+phone&redirect_uri=https%3A%2F%2Fconsole-encryptgate.net%2Fadmin%2Fdashboard`;
  }
}, []);

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
