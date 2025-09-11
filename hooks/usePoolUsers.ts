"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"

export interface PoolUser {
  username: string
  name: string
  email: string
}

export function usePoolUsers() {
  const params = useParams()
  const orgId = params.orgId as string
  const [poolUsers, setPoolUsers] = useState<PoolUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchPoolUsers = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    try {
      console.log('📋 Fetching pool users...')
      const res = await fetch("/api/company-settings/users/pool", {
        headers: {
          'x-org-id': orgId
        }
      })
      
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
  }, [orgId])

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