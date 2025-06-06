"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { EmailsList } from "@/components/emails-list-component"
import { FadeInSection } from "@/components/fade-in-section"
import { useRouter, useSearchParams } from "next/navigation"

export default function AdminAllEmailsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState("")
  const employeeFilter = searchParams.get("employee")

  // Check if user is logged in
   useEffect(() => {
    const token = localStorage.getItem("access_token")
    if (!token) {
      router.push("/login")
    }
  }, [router])

  return (
    <AppLayout username="John Doe" onSearch={setSearchQuery} notificationsCount={2}>
      <FadeInSection>
        <EmailsList searchQuery={searchQuery} employeeFilter={employeeFilter} />
      </FadeInSection>
    </AppLayout>
  )
}
