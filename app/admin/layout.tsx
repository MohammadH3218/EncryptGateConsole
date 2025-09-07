"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

export default function AdminLayout({
  children,
}: {
  children: ReactNode
}) {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Only run auth check if we're actually in an admin route
    if (typeof window !== "undefined" && window.location.pathname.startsWith('/admin')) {
      const token = localStorage.getItem("access_token")
      
      if (!token) {
        // No token found, redirect to login
        router.push('/login')
      } else {
        // Token found, user is authenticated
        setIsAuthenticated(true)
      }
    } else {
      // Not an admin route, skip auth check
      setIsAuthenticated(true)
    }
    
    setIsLoading(false)
  }, [router])

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#171717]">
        <div className="relative z-10 text-center space-y-4">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto animate-pulse">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
          <div className="text-white text-lg font-medium">Loading...</div>
        </div>
      </div>
    )
  }

  // Don't render children if not authenticated (redirect will happen)
  if (!isAuthenticated) {
    return null
  }

  // Render admin pages if authenticated
  return <>{children}</>
}