"use client"

import { useState } from "react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { PushedDetectionsList } from "@/components/pushed-detections-list"

interface PushedDetection {
  id: number
  uniqueId: string
  severity: string
  name: string
  status: string
  assignedTo: string[]
  sentBy: string
  timestamp: string
  description: string
  indicators: string[]
  recommendations: string[]
  pushedBy: string
}

export default function PushedRequestsPage() {
  const [searchQuery] = useState("")
  const [pushedDetections] = useState<PushedDetection[]>([])

  return (
    <AppLayout notificationsCount={0}>
      <FadeInSection>
        <h2 className="text-2xl font-bold mb-4 text-white">Pushed Requests</h2>
        <PushedDetectionsList searchQuery={searchQuery} pushedDetections={pushedDetections} />
      </FadeInSection>
    </AppLayout>
  )
}
