import { useRouter } from "next/navigation"
import { useEffect } from "react"

// Simulated authentication state
let isAuthenticated = false

export const login = (email: string, userType: "admin" | "employee") => {
  // In a real app, you would validate credentials here
  isAuthenticated = true
  localStorage.setItem("userType", userType)
}

export const logout = () => {
  isAuthenticated = false
  localStorage.removeItem("userType")
}

export const checkAuth = () => {
  return isAuthenticated
}

export const useRequireAuth = () => {
  const router = useRouter()

  useEffect(() => {
    if (!checkAuth()) {
      router.push("/login")
    }
  }, [router])
}

