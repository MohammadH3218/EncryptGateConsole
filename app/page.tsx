"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { checkAuth } from "@/lib/auth"

export default function Home() {
  const router = useRouter()

  useEffect(() => {
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
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-pulse">Loading...</div>
    </div>
  )
}

