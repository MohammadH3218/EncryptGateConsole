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
  const [searchQuery] = useState("")
  const [blockedSenders] = useState(mockBlockedSenders)
  const [allowedSenders] = useState(mockAllowedSenders)

  return (
    <AppLayout username="John Doe" notificationsCount={0}>
      <FadeInSection>
        <h2 className="text-2xl font-bold mb-4 text-white">Allow/Block List</h2>
        <Tabs defaultValue="blocked" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4 bg-[#1f1f1f] border-[#1f1f1f]">
            <TabsTrigger value="blocked" className="text-white data-[state=active]:bg-[#0f0f0f] data-[state=active]:text-white">Blocked Senders</TabsTrigger>
            <TabsTrigger value="allowed" className="text-white data-[state=active]:bg-[#0f0f0f] data-[state=active]:text-white">Allowed Senders</TabsTrigger>
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
