'use client'

import { useState, useEffect, useCallback } from 'react'

export type ServiceType = 'aws-cognito' | 'aws-workmail'

export interface CloudService {
  id: string
  name: string
  serviceType: ServiceType
  status: 'connected' | 'disconnected'
  lastSynced: string
  userCount: number

  // AWS Cognito fields
  userPoolId?: string
  clientId?: string
  hasClientSecret?: boolean

  // AWS WorkMail fields
  organizationId?: string
  alias?: string

  // common
  region?: string
}

export type CognitoDetails = {
  serviceType: 'aws-cognito'
  userPoolId: string
  clientId: string
  clientSecret?: string
  region: string
}

export type WorkMailDetails = {
  serviceType: 'aws-workmail'
  organizationId: string
  alias?: string
  region: string
}

export type AddServiceDetails = CognitoDetails | WorkMailDetails
export type UpdateServiceDetails = Partial<CognitoDetails> | Partial<WorkMailDetails>

export interface ValidationResult {
  valid: boolean
  message: string
}

export function useCloudServices() {
  const [services, setServices] = useState<CloudService[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // ─── Fetch all connected services ─────────────────────────────────────────────
  const fetchServices = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/company-settings/cloud-services')
      if (!res.ok) throw new Error('Failed to load cloud services')
      const data: CloudService[] = await res.json()
      setServices(data)
      setError(null)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchServices()
  }, [fetchServices])

  // ─── Add (connect) a service ─────────────────────────────────────────────────
  const addService = useCallback(
    async (details: AddServiceDetails) => {
      setLoading(true)
      try {
        const res = await fetch('/api/company-settings/cloud-services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(details),
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.message || data.error || 'Failed to connect service')
        }
        // assume it returns the new CloudService
        setServices((prev) => [...prev, data as CloudService])
        setError(null)
        return data as CloudService
      } catch (err) {
        setError(err as Error)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  // ─── Update an existing service ────────────────────────────────────────────────
  const updateService = useCallback(
    async (id: string, details: UpdateServiceDetails) => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/company-settings/cloud-services/${encodeURIComponent(id)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(details),
          }
        )
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.message || data.error || 'Failed to update service')
        }
        const updated = data as CloudService
        setServices((prev) => prev.map((s) => (s.id === id ? updated : s)))
        setError(null)
        return updated
      } catch (err) {
        setError(err as Error)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  // ─── Remove (disconnect) a service ────────────────────────────────────────────
  const removeService = useCallback(
    async (id: string) => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/company-settings/cloud-services/${encodeURIComponent(id)}`,
          { method: 'DELETE' }
        )
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.message || data.error || 'Failed to remove service')
        }
        setServices((prev) => prev.filter((s) => s.id !== id))
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

  // ─── Validate credentials (before add/update) ────────────────────────────────
  const validateConnection = useCallback(
    async (details: AddServiceDetails): Promise<ValidationResult> => {
      try {
        const res = await fetch(
          '/api/company-settings/cloud-services/validate',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(details),
          }
        )
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.message || data.error || 'Validation failed')
        }
        return data as ValidationResult
      } catch (err: any) {
        return { valid: false, message: err.message || 'Validation failed' }
      }
    },
    []
  )

  return {
    services,
    loading,
    error,
    addService,
    updateService,
    removeService,
    validateConnection,
    refresh: fetchServices,
  }
}
