"use client"

import { Suspense, useState } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { EmailsList } from "@/components/emails-list-component"
import { FadeInSection } from "@/components/fade-in-section"
import { useRouter, useSearchParams } from "next/navigation"
import { useRequireAuth } from "@/lib/auth"
import { logout } from "@/lib/auth"

export default function AdminAllEmailsPage() {
  useRequireAuth()
  const router = useRouter()

  return (
    <Suspense fallback={<div>Loading emails...</div>}>
      <AllEmailsContent router={router} />
    </Suspense>
  )
}

function AllEmailsContent({ router }: { router: ReturnType<typeof useRouter> }) {
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState("")
  const employeeFilter = searchParams.get("employee")

  const handleSignOut = async () => {
    logout()
    router.push("/login")
  }

  return (
    <div className="min-h-screen bg-background animated-background">
      <DashboardHeader onSearch={setSearchQuery} username="John Doe" onSignOut={handleSignOut} />
      <main className="p-4">
        <FadeInSection>
          <EmailsList searchQuery={searchQuery} employeeFilter={employeeFilter} />
        </FadeInSection>
      </main>
    </div>
  )
}
