"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { PushedDetectionsList } from "@/components/pushed-detections-list"
import { useRouter } from "next/navigation"

// Mock data for pushed detections
const mockPushedDetections = [
  {
    id: 1,
    uniqueId: "DET-004",
    severity: "Critical",
    name: "Ransomware Detection",
    status: "Pushed",
    assignedTo: [],
    sentBy: "unknown@external.com",
    timestamp: "2024-01-31T15:20:00Z",
    description: "Potential ransomware detected in email attachment",
    indicators: ["Suspicious attachment", "Known malware signature", "Unusual sender"],
    recommendations: ["Isolate affected systems", "Run full scan", "Restore from backup if needed"],
    pushedBy: "John Doe",
  },
  {
    id: 2,
    uniqueId: "DET-005",
    severity: "High",
    name: "CEO Fraud Attempt",
    status: "Pushed",
    assignedTo: [],
    sentBy: "ceo.spoof@gmail.com",
    timestamp: "2024-01-31T14:10:00Z",
    description: "Email impersonating CEO requesting urgent wire transfer",
    indicators: ["CEO impersonation", "Urgent financial request", "External sender"],
    recommendations: ["Verify with CEO", "Block sender", "Train employees on CEO fraud"],
    pushedBy: "Jane Smith",
  },
  {
    id: 3,
    uniqueId: "DET-006",
    severity: "Medium",
    name: "Suspicious URL Detection",
    status: "Pushed",
    assignedTo: [],
    sentBy: "newsletter@marketing.com",
    timestamp: "2024-01-31T12:30:00Z",
    description: "Email containing links to suspicious websites",
    indicators: ["Suspicious URLs", "Phishing indicators", "Unusual sender"],
    recommendations: ["Block URLs", "Warn employees", "Review email filtering rules"],
    pushedBy: "John Doe",
  },
]

export default function PushedRequestsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [pushedDetections, setPushedDetections] = useState(mockPushedDetections)
  const router = useRouter()

  // Check if user is logged in
  useEffect(() => {
    const token = localStorage.getItem("access_token")
    if (!token) {
      router.push("/login")
    }
  }, [router])

  return (
    <AppLayout username="John Doe" onSearch={setSearchQuery} notificationsCount={0}>
      <FadeInSection>
        <h2 className="text-2xl font-bold mb-4">Pushed Requests</h2>
        <PushedDetectionsList searchQuery={searchQuery} pushedDetections={pushedDetections} />
      </FadeInSection>
    </AppLayout>
  )
}
