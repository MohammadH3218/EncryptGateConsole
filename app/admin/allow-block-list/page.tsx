"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BlockedSendersList } from "@/components/blocked-senders-list"
import { AllowedSendersList } from "@/components/allowed-senders-list"
import { useRouter } from "next/navigation"

// Mock data for allowed and blocked senders
const mockBlockedSenders = [
  {
    id: 1,
    email: "malicious@phishing.com",
    reason: "Known phishing domain",
    blockedBy: "John Doe",
    timestamp: "2024-01-31T15:20:00Z",
  },
  {
    id: 2,
    email: "suspicious@unknown.net",
    reason: "Suspicious attachment",
    blockedBy: "System",
    timestamp: "2024-01-31T14:10:00Z",
  },
  {
    id: 3,
    email: "spam@marketing.biz",
    reason: "Spam content detected",
    blockedBy: "Jane Smith",
    timestamp: "2024-01-31T12:30:00Z",
  },
]

const mockAllowedSenders = [
  {
    id: 1,
    email: "partner@trusted.com",
    reason: "Business partner",
    allowedBy: "John Doe",
    timestamp: "2024-01-31T15:20:00Z",
  },
  {
    id: 2,
    email: "client@important.org",
    reason: "VIP client",
    allowedBy: "Jane Smith",
    timestamp: "2024-01-31T14:10:00Z",
  },
  {
    id: 3,
    email: "vendor@supplier.net",
    reason: "Approved vendor",
    allowedBy: "System",
    timestamp: "2024-01-31T12:30:00Z",
  },
]

export default function AllowBlockListPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [blockedSenders, setBlockedSenders] = useState(mockBlockedSenders)
  const [allowedSenders, setAllowedSenders] = useState(mockAllowedSenders)
  const router = useRouter()


  return (
    <AppLayout username="John Doe" onSearch={setSearchQuery} notificationsCount={0}>
      <FadeInSection>
        <h2 className="text-2xl font-bold mb-4">Allow/Block List</h2>
        <Tabs defaultValue="blocked" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="blocked">Blocked Senders</TabsTrigger>
            <TabsTrigger value="allowed">Allowed Senders</TabsTrigger>
          </TabsList>
          <TabsContent value="blocked">
            <BlockedSendersList searchQuery={searchQuery} blockedSenders={blockedSenders} />
          </TabsContent>
          <TabsContent value="allowed">
            <AllowedSendersList searchQuery={searchQuery} allowedSenders={allowedSenders} />
          </TabsContent>
        </Tabs>
      </FadeInSection>
    </AppLayout>
  )
}
