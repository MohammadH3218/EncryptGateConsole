// hooks/useEmployeePoolUsers.ts
"use client"

import { useState, useEffect, useCallback } from "react"

export interface EmployeePoolUser {
  username: string
  name: string
  email: string
  status: string
  enabled: boolean
}

export function useEmployeePoolUsers() {
  const [employeePoolUsers, setEmployeePoolUsers] = useState<EmployeePoolUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchEmployeePoolUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      console.log('📋 Fetching employee pool users...')
      const res = await fetch("/api/company-settings/employees/pool")
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || `HTTP ${res.status}: Failed to load employee pool users`)
      }
      
      const data: EmployeePoolUser[] = await res.json()
      console.log(`✅ Fetched ${data.length} employee pool users`)
      setEmployeePoolUsers(data)
    } catch (err) {
      console.error('❌ Error fetching employee pool users:', err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  const refresh = useCallback(() => {
    return fetchEmployeePoolUsers()
  }, [fetchEmployeePoolUsers])

  useEffect(() => {
    fetchEmployeePoolUsers()
  }, [fetchEmployeePoolUsers])

  return {
    employeePoolUsers,
    loading,
    error,
    refresh,
  }
}