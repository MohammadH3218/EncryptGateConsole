"use client"

import { useState } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { FadeInSection } from "@/components/fade-in-section"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BlockedSendersList } from "@/components/blocked-senders-list"
import { AllowedSendersList } from "@/components/allowed-senders-list"
import { useDetections } from "@/contexts/DetectionsContext"

export default function EmployeeAllowBlockListPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const { blockedSenders, allowedSenders } = useDetections()

  const handleSignOut = () => {
    console.log("User signed out")
  }

  return (
    <div className="min-h-screen bg-background animated-background">
      <DashboardHeader onSearch={setSearchQuery} username="John Doe" onSignOut={handleSignOut} />
      <main className="p-4">
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
      </main>
    </div>
  )
}

