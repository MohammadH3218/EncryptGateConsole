"use client"

import { useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { Loader2 } from "lucide-react"

export default function OrgAwareDashboardPage() {
  const router = useRouter()
  const params = useParams()
  const orgId = params.orgId as string

  useEffect(() => {
    // The middleware will rewrite /admin/dashboard to /o/{orgId}/admin/dashboard
    // So we redirect to the actual dashboard and let middleware handle it
    router.replace('/admin/dashboard')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#171717] p-4">
      <div className="text-center space-y-4">
        <Loader2 className="w-8 h-8 text-white animate-spin mx-auto" />
        <div className="text-white text-lg font-medium">Loading dashboard...</div>
        <div className="text-gray-400 text-sm">Organization: {orgId}</div>
      </div>
    </div>
  )
}