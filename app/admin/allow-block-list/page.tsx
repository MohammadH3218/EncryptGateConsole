"use client"

import { useState } from "react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BlockedSendersList } from "@/components/blocked-senders-list"
import { AllowedSendersList } from "@/components/allowed-senders-list"

// Empty arrays for production use
const mockBlockedSenders: any[] = []

const mockAllowedSenders: any[] = []

export default function AllowBlockListPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [blockedSenders] = useState(mockBlockedSenders)
  const [allowedSenders] = useState(mockAllowedSenders)

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
