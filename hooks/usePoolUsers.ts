"use client"

import { useState, useEffect, useCallback } from "react"

export interface PoolUser {
  username: string
  name: string
  email: string
}

export function usePoolUsers() {
  const [poolUsers, setPoolUsers] = useState<PoolUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchPoolUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      console.log('📋 Fetching pool users...')
      const res = await fetch("/api/company-settings/users/pool")
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || `HTTP ${res.status}: Failed to load pool users`)
      }
      
      const data: PoolUser[] = await res.json()
      console.log(`✅ Fetched ${data.length} pool users`)
      setPoolUsers(data)
    } catch (err) {
      console.error('❌ Error fetching pool users:', err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  const refresh = useCallback(() => {
    return fetchPoolUsers()
  }, [fetchPoolUsers])

  useEffect(() => {
    fetchPoolUsers()
  }, [fetchPoolUsers])

  return {
    poolUsers,
    loading,
    error,
    refresh,
  }
}