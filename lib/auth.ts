"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

// Check for authentication in a way that works with SSR
export const checkAuth = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("access_token") !== null
  }
  return false
}

export const login = (email: string, userType: "admin" | "employee") => {
  localStorage.setItem("userType", userType)
}

export const logout = () => {
  if (typeof window !== "undefined") {
    localStorage.removeItem("access_token")
    localStorage.removeItem("id_token")
    localStorage.removeItem("refresh_token")
    localStorage.removeItem("userType")
  }
}

export const useRequireAuth = () => {
  const router = useRouter()

  useEffect(() => {
    if (!checkAuth()) {
      router.push("/login")
    }
  }, [router])
}
