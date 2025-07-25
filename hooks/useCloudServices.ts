"use client"

import { useState, useEffect, useCallback } from "react"

export interface CloudService {
  id: string
  name: string
  status: "connected" | "disconnected"
  lastSynced: string
  userCount: number
}

export function useCloudServices() {
  const [services, setServices] = useState<CloudService[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchServices = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/company-settings/cloud-services")
      if (!res.ok) throw new Error("Failed to load cloud services")
      const data: CloudService[] = await res.json()
      setServices(data)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  const addService = useCallback(
    async (details: {
      serviceType: string
      userPoolId: string
      clientId: string
      region: string
    }) => {
      setLoading(true)
      try {
        const res = await fetch("/api/company-settings/cloud-services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(details),
        })
        if (!res.ok) throw new Error("Failed to connect service")
        const newService: CloudService = await res.json()
        setServices((prev) => [...prev, newService])
        return newService
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    fetchServices()
  }, [fetchServices])

  return { services, loading, error, addService, refresh: fetchServices }
}
