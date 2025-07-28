"use client"

import { useState, useEffect, useCallback } from "react"

export interface CloudService {
  id: string
  name: string
  status: "connected" | "disconnected"
  lastSynced: string
  userCount: number
  // Add these properties to store the configuration
  userPoolId?: string
  clientId?: string
  region?: string
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
        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.message || "Failed to connect service")
        }
        const newService: CloudService = await res.json()
        setServices((prev) => [...prev, newService])
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

  // Function to update a service
  const updateService = useCallback(
    async (id: string, details: {
      userPoolId: string
      clientId: string
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

  // Function to remove a service
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
      } catch (err) {
        setError(err as Error)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  // Function to validate connection
  const validateConnection = useCallback(
    async (details: {
      userPoolId: string
      clientId: string
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