"use client"

import { useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"

function LogoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Capture orgId from URL params before clearing storage
    let orgId = searchParams.get('orgId')
    
    // If no orgId in URL params, try to get it from current path or referrer
    if (!orgId) {
      const referrer = document.referrer || ''
      const orgMatch = referrer.match(/\/o\/([^\/]+)/)
      if (orgMatch) {
        orgId = orgMatch[1]
      }
    }

    // Clear all tokens and storage
    localStorage.clear()
    sessionStorage.clear()
    
    // Clear any cookies by setting them to expire
    document.cookie = "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"
    document.cookie = "id_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"
    document.cookie = "refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"

    // Redirect to organization-specific login page after a short delay
    setTimeout(() => {
      if (orgId) {
        console.log(`🔄 Redirecting to org login: /o/${orgId}/login`)
        router.push(`/o/${orgId}/login`)
      } else {
        console.log('🔄 No orgId found, redirecting to setup')
        router.push("/setup-organization")
      }
    }, 1500)
  }, [router, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#171717] p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-green-500/3 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>
      
      <div className="relative z-10 text-center space-y-4">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto animate-pulse">
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        </div>
        <div className="text-white text-lg font-medium">Logging you out...</div>
        <div className="text-gray-400 text-sm">
          {searchParams.get('orgId') ? 
            `Redirecting to ${searchParams.get('orgId')} login...` : 
            'Clearing your session securely'
          }
        </div>
      </div>
    </div>
  )
}

export default function LogoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#171717] p-4 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-green-500/3 rounded-full blur-3xl animate-pulse delay-500"></div>
        </div>
        
        <div className="relative z-10 text-center space-y-4">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto animate-pulse">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
          <div className="text-white text-lg font-medium">Logging you out...</div>
          <div className="text-gray-400 text-sm">Clearing your session securely</div>
        </div>
      </div>
    }>
      <LogoutContent />
    </Suspense>
  )
}
