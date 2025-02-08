"use client"

import { useState } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { FadeInSection } from "@/components/fade-in-section"
import { EmployeesList } from "@/components/employees-list"
import { ITTeamList } from "@/components/it-team-list"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function ManageEmployeesPage() {
  const [searchQuery, setSearchQuery] = useState("")

  const handleSignOut = () => {
    console.log("User signed out")
  }

  return (
    <div className="min-h-screen bg-background animated-background">
      <DashboardHeader onSearch={setSearchQuery} username="John Doe" onSignOut={handleSignOut} />
      <main className="p-4">
        <FadeInSection>
          <h2 className="text-2xl font-bold mb-4">Manage Employees</h2>
          <Tabs defaultValue="all-employees" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="all-employees">All Employees</TabsTrigger>
              <TabsTrigger value="it-team">IT Team</TabsTrigger>
            </TabsList>
            <TabsContent value="all-employees">
              <EmployeesList searchQuery={searchQuery} />
            </TabsContent>
            <TabsContent value="it-team">
              <ITTeamList searchQuery={searchQuery} />
            </TabsContent>
          </Tabs>
        </FadeInSection>
      </main>
    </div>
  )
}

