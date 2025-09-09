"use client"

import React, { createContext, useContext, useEffect, useState } from 'react'
import { loadSession, Session } from '@/lib/session'

const SessionContext = createContext<Session | null>(null)

export const useSession = () => {
  const session = useContext(SessionContext)
  return session
}

interface SessionProviderProps {
  children: React.ReactNode
  token?: string
  orgId: string
}

export function SessionProvider({ children, token, orgId }: SessionProviderProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadSessionData = async () => {
      // If no token, this is pre-login - just set loading to false and continue
      if (!token || !orgId) {
        setLoading(false)
        setSession(null)
        setError(null)
        return
      }

      try {
        const sessionData = await loadSession(token, orgId)
        setSession(sessionData)
        setError(null)
      } catch (err: any) {
        setError(err.message || 'Failed to load user session')
        setSession(null)
      } finally {
        setLoading(false)
      }
    }

    loadSessionData()
  }, [token, orgId])

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#171717] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white">Loading your profile...</p>
        </div>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-[#171717] flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-red-400 text-6xl mb-4">⚠️</div>
          <h2 className="text-white text-xl mb-2">Session Error</h2>
          <p className="text-gray-400 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-white text-black px-4 py-2 rounded hover:bg-gray-200"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Render children even without session for login pages
  // Only show "no session" message if we had a token but failed to load session
  if (!session && token) {
    return (
      <div className="min-h-screen bg-[#171717] flex items-center justify-center">
        <div className="text-center">
          <p className="text-white">No session data available</p>
        </div>
      </div>
    )
  }

  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  )
}