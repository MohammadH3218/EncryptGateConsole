"use client"

import { useState, useEffect, useCallback } from "react"

export interface CloudService {
  id: string
  name: string
  status: "connected" | "disconnected"
  lastSynced: string
  userCount: number
  userPoolId?: string
  clientId?: string
  region?: string
  hasClientSecret?: boolean // Add this to track if secret is stored
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
      setError(null)
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
      clientSecret?: string // Make optional since some clients don't use secrets
      region: string
    }) => {
      setLoading(true)
      try {
        const res = await fetch("/api/company-settings/cloud-services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(details),
        })
        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.message || "Failed to connect service")
        }
        const newService: CloudService = await res.json()
        setServices((prev) => [...prev, newService])
        setError(null)
        return newService
      } catch (err) {
        setError(err as Error)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const updateService = useCallback(
    async (id: string, details: {
      userPoolId: string
      clientId: string
      clientSecret?: string // Add optional client secret
      region: string
    }) => {
      setLoading(true)
      try {
        const res = await fetch(`/api/company-settings/cloud-services/${encodeURIComponent(id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(details),
        })
        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.message || "Failed to update service")
        }
        const updatedService: CloudService = await res.json()
        setServices((prev) => 
          prev.map((service) => service.id === id ? updatedService : service)
        )
        setError(null)
        return updatedService
      } catch (err) {
        setError(err as Error)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const removeService = useCallback(
    async (id: string) => {
      setLoading(true)
      try {
        const res = await fetch(`/api/company-settings/cloud-services/${encodeURIComponent(id)}`, {
          method: "DELETE",
        })
        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.message || "Failed to remove service")
        }
        setServices((prev) => prev.filter((service) => service.id !== id))
        setError(null)
      } catch (err) {
        setError(err as Error)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const validateConnection = useCallback(
    async (details: {
      userPoolId: string
      clientId: string
      clientSecret?: string // Add optional client secret
      region: string
    }) => {
      try {
        const res = await fetch("/api/company-settings/cloud-services/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(details),
        })
        
        const data = await res.json()
        
        if (!res.ok) {
          throw new Error(data.message || data.error || "Validation failed")
        }
        
        return data
      } catch (err) {
        throw err
      }
    },
    []
  )

  useEffect(() => {
    fetchServices()
  }, [fetchServices])

  return { 
    services, 
    loading, 
    error, 
    addService, 
    updateService, 
    removeService, 
    validateConnection, 
    refresh: fetchServices 
  }
}