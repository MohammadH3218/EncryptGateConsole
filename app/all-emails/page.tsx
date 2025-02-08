"use client"

import { useState } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { EmailsList } from "@/components/emails-list-component"
import { FadeInSection } from "@/components/fade-in-section"
import { useRouter } from "next/navigation"
import { useRequireAuth } from "@/lib/auth"
import { logout } from "@/lib/auth"

export default function AllEmailsPage() {
  useRequireAuth()
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")

  const handleSignOut = async () => {
    logout()
    router.push("/login")
  }

  return (
    <div className="min-h-screen bg-background animated-background">
      <DashboardHeader onSearch={setSearchQuery} username="John Doe" onSignOut={handleSignOut} notificationsCount={5} />
      <main className="p-4">
        <FadeInSection>
          <EmailsList searchQuery={searchQuery} employeeFilter={null} />
        </FadeInSection>
      </main>
    </div> 
  )
}

