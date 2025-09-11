"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"

export interface SecuritySettings {
  userId: string;
  orgId: string;
  mfaEnabled: boolean;
  mfaMethod?: 'totp' | 'sms' | 'email';
  sessionTimeout: number;
  loginNotifications: boolean;
  failedLoginAlerts: boolean;
  deviceManagement: boolean;
  passwordLastChanged?: string;
  loginAttempts?: number;
  lockoutUntil?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceSession {
  sessionId: string;
  userId: string;
  orgId: string;
  deviceInfo: {
    browser: string;
    os: string;
    deviceType: 'desktop' | 'mobile' | 'tablet';
    userAgent: string;
  };
  ipAddress: string;
  location?: {
    country: string;
    city: string;
    region: string;
  };
  isActive: boolean;
  isCurrent: boolean;
  lastActivity: string;
  loginTime: string;
  expiresAt: string;
}

export interface SecurityActivity {
  activityId: string;
  userId: string;
  orgId: string;
  type: 'login_success' | 'login_failed' | 'logout' | 'password_change' | 'mfa_enabled' | 'mfa_disabled' | 'device_added' | 'device_removed' | 'settings_changed';
  description: string;
  ipAddress: string;
  userAgent: string;
  deviceInfo?: {
    browser: string;
    os: string;
    deviceType: string;
  };
  location?: {
    country: string;
    city: string;
    region: string;
  };
  metadata?: any;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export function useSecurity() {
  const params = useParams()
  const orgId = params.orgId as string
  
  const [settings, setSettings] = useState<SecuritySettings | null>(null)
  const [devices, setDevices] = useState<DeviceSession[]>([])
  const [activities, setActivities] = useState<SecurityActivity[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Get auth headers
  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem("access_token")
    return {
      'Authorization': `Bearer ${token}`,
      'x-org-id': orgId,
      'Content-Type': 'application/json',
    }
  }, [orgId])

  // Fetch security settings
  const fetchSettings = useCallback(async () => {
    if (!orgId) return
    
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/security/settings', {
        headers: getAuthHeaders()
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || `HTTP ${res.status}: Failed to load security settings`)
      }
      
      const data = await res.json()
      setSettings(data)
    } catch (err) {
      console.error('❌ Error fetching security settings:', err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [orgId, getAuthHeaders])

  // Update security settings
  const updateSettings = useCallback(async (updatedSettings: Partial<SecuritySettings>) => {
    if (!orgId) return

    try {
      const res = await fetch('/api/security/settings', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(updatedSettings)
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Failed to update security settings')
      }

      // Refresh settings
      await fetchSettings()
      
    } catch (err) {
      console.error('❌ Error updating security settings:', err)
      throw err
    }
  }, [orgId, getAuthHeaders, fetchSettings])

  // Fetch user devices
  const fetchDevices = useCallback(async () => {
    if (!orgId) return

    try {
      const res = await fetch('/api/security/devices', {
        headers: getAuthHeaders()
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Failed to load devices')
      }
      
      const data = await res.json()
      setDevices(data.devices || [])
    } catch (err) {
      console.error('❌ Error fetching devices:', err)
      throw err
    }
  }, [orgId, getAuthHeaders])

  // Remove a device
  const removeDevice = useCallback(async (sessionId: string) => {
    if (!orgId) return

    try {
      const res = await fetch(`/api/security/devices?sessionId=${sessionId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Failed to remove device')
      }

      // Refresh devices
      await fetchDevices()
      
    } catch (err) {
      console.error('❌ Error removing device:', err)
      throw err
    }
  }, [orgId, getAuthHeaders, fetchDevices])

  // Fetch security activity
  const fetchActivity = useCallback(async (limit: number = 20, type?: string) => {
    if (!orgId) return

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        ...(type && { type })
      })

      const res = await fetch(`/api/security/activity?${params}`, {
        headers: getAuthHeaders()
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Failed to load security activity')
      }
      
      const data = await res.json()
      setActivities(data.activities || [])
    } catch (err) {
      console.error('❌ Error fetching security activity:', err)
      throw err
    }
  }, [orgId, getAuthHeaders])

  // Log security activity
  const logActivity = useCallback(async (activityData: {
    type: SecurityActivity['type'];
    description: string;
    severity?: SecurityActivity['severity'];
    metadata?: any;
  }) => {
    if (!orgId) return

    try {
      const res = await fetch('/api/security/activity', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(activityData)
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Failed to log security activity')
      }

      // Refresh activity log
      await fetchActivity()
      
    } catch (err) {
      console.error('❌ Error logging security activity:', err)
      throw err
    }
  }, [orgId, getAuthHeaders, fetchActivity])

  // MFA operations
  const setupMFA = useCallback(async (userEmail: string) => {
    if (!orgId) return

    try {
      const res = await fetch('/api/security/mfa', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'setup',
          mfaMethod: 'totp',
          userEmail
        })
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Failed to setup MFA')
      }
      
      const data = await res.json()
      return data
    } catch (err) {
      console.error('❌ Error setting up MFA:', err)
      throw err
    }
  }, [orgId, getAuthHeaders])

  const verifyMFA = useCallback(async (verificationCode: string) => {
    if (!orgId) return

    try {
      const res = await fetch('/api/security/mfa', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'verify',
          verificationCode
        })
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Failed to verify MFA')
      }
      
      // Refresh settings to update MFA status
      await fetchSettings()
      await logActivity({
        type: 'mfa_enabled',
        description: 'Multi-factor authentication enabled',
        severity: 'medium'
      })
      
      const data = await res.json()
      return data
    } catch (err) {
      console.error('❌ Error verifying MFA:', err)
      throw err
    }
  }, [orgId, getAuthHeaders, fetchSettings, logActivity])

  const disableMFA = useCallback(async () => {
    if (!orgId) return

    try {
      const res = await fetch('/api/security/mfa', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'disable'
        })
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Failed to disable MFA')
      }
      
      // Refresh settings to update MFA status
      await fetchSettings()
      await logActivity({
        type: 'mfa_disabled',
        description: 'Multi-factor authentication disabled',
        severity: 'high'
      })
      
      const data = await res.json()
      return data
    } catch (err) {
      console.error('❌ Error disabling MFA:', err)
      throw err
    }
  }, [orgId, getAuthHeaders, fetchSettings, logActivity])

  const getMFAStatus = useCallback(async () => {
    if (!orgId) return

    try {
      const res = await fetch('/api/security/mfa', {
        headers: getAuthHeaders()
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Failed to get MFA status')
      }
      
      const data = await res.json()
      return data
    } catch (err) {
      console.error('❌ Error getting MFA status:', err)
      throw err
    }
  }, [orgId, getAuthHeaders])

  const refresh = useCallback(() => {
    return Promise.all([
      fetchSettings(),
      fetchDevices(),
      fetchActivity()
    ])
  }, [fetchSettings, fetchDevices, fetchActivity])

  useEffect(() => {
    if (orgId) {
      refresh()
    }
  }, [orgId, refresh])

  return {
    settings,
    devices,
    activities,
    loading,
    error,
    refresh,
    updateSettings,
    fetchDevices,
    removeDevice,
    fetchActivity,
    logActivity,
    setupMFA,
    verifyMFA,
    disableMFA,
    getMFAStatus,
  }
}