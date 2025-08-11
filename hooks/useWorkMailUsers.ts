// hooks/useWorkMailUsers.ts
"use client"

import { useState, useEffect, useCallback } from "react"

export interface WorkMailUser {
  id: string // WorkMail User ID
  name: string
  email: string
  department?: string
  jobTitle?: string
  state: string // ENABLED, DISABLED, etc.
}

export function useWorkMailUsers() {
  const [workMailUsers, setWorkMailUsers] = useState<WorkMailUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchWorkMailUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/company-settings/employees/workmail-users")
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || `HTTP ${res.status}: Failed to load WorkMail users`)
      }
      
      const data: WorkMailUser[] = await res.json()
      setWorkMailUsers(data)
    } catch (err) {
      console.error('❌ Error fetching WorkMail users:', err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  const refresh = useCallback(() => {
    return fetchWorkMailUsers()
  }, [fetchWorkMailUsers])

  useEffect(() => {
    fetchWorkMailUsers()
  }, [fetchWorkMailUsers])

  return {
    workMailUsers,
    loading,
    error,
    refresh,
  }
}