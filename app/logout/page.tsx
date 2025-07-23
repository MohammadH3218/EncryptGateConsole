"use client"

import { useEffect } from "react"

export default function LogoutPage() {
  useEffect(() => {
    // Clear tokens
    localStorage.clear()
    sessionStorage.clear()

    // Redirect to Cognito logout endpoint
    const logoutUrl = `https://us-east-1kpxz426n8.auth.us-east-1.amazoncognito.com/logout?client_id=u7p7ddajvruk8rccoajj8o5h0&logout_uri=https://console-encryptgate.net`
    window.location.href = logoutUrl
  }, [])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-pulse text-gray-600">Logging you out...</div>
    </div>
  )
}
