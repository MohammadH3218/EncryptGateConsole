"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { checkAuth } from "@/lib/auth"

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (checkAuth()) {
        const userType = localStorage.getItem("userType")
        if (userType === "admin") {
          router.push("/admin/dashboard")
        } else if (userType === "employee") {
          router.push("/employee/dashboard")
        }
      } else {
        router.push("https://us-east-1kpxz426n8.auth.us-east-1.amazoncognito.com/login?client_id=u7p7ddajvruk8rccoajj8o5h0&response_type=code&scope=email+openid+phone&redirect_uri=https%3A%2F%2Fconsole-encryptgate.net%2Fadmin%2Fdashboard")
      }
    }, 300) // wait 300ms for token to be saved before checking

    return () => clearTimeout(timeout)
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-pulse">Loading...</div>
    </div>
  )
}
