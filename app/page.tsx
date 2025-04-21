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
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-pulse">Loading...</div>
    </div>
  )
}