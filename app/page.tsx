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
        router.push("/login")
      }
    }, 300) // wait 300ms for token to be saved before checking

    return () => clearTimeout(timeout)
  }, [router])

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
        <div className="text-white text-lg font-medium">Loading...</div>
        <div className="text-gray-400 text-sm">Checking authentication</div>
      </div>
    </div>
  )
}