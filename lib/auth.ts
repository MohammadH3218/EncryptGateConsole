"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

export const checkAuth = (): boolean => {
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
    const token = localStorage.getItem("access_token")
    if (!token) {
      router.push("/login")
    }
  }, [router])
}

export const getUserType = (): "admin" | "employee" | null => {
  const val = localStorage.getItem("userType")
  return val === "admin" || val === "employee" ? val : null
}