"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { EmployeesList } from "@/components/employees-list"
import { ITTeamList } from "@/components/it-team-list"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRouter } from "next/navigation"

export default function ManageEmployeesPage() {
  const [searchQuery, setSearchQuery] = useState("")
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
    </AppLayout>
  )
}
