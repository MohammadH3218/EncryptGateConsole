"use client"

import React, { createContext, useContext, useEffect, useState } from 'react'
import { loadSession, Session } from '@/lib/session'

type SessionState =
  | { status: "loading"; session: null }
  | { status: "ready"; session: Session }
  | { status: "error"; session: null; message: string }
  | { status: "no_session"; session: null } // For pre-login scenarios

const SessionContext = createContext<SessionState>({ status: "loading", session: null })

export const useSession = () => {
  const state = useContext(SessionContext)
  return state.session // Backward compatibility
}

export const useSessionState = () => useContext(SessionContext)

interface SessionProviderProps {
  children: React.ReactNode
  token?: string
  orgId: string
}

export function SessionProvider({ children, token, orgId }: SessionProviderProps) {
  const [state, setState] = useState<SessionState>({ status: "loading", session: null })

  useEffect(() => {
    let cancelled = false
    
    const loadSessionData = async () => {
      console.log('🔄 SessionProvider: Loading session data...', { token: token ? 'present' : 'missing', orgId })
      
      // Try to get token from client-side sources as fallback
      let finalToken = token
      if (!finalToken && typeof window !== 'undefined') {
        // Try localStorage first
        finalToken = localStorage.getItem('access_token') || ''
        
        // If not in localStorage, try client-readable cookies
        if (!finalToken) {
          const cookies = document.cookie.split(';').reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split('=')
            acc[key] = value
            return acc
          }, {} as Record<string, string>)
          
          finalToken = cookies['client_access_token'] || ''
          
          // If we found it in cookies, also set localStorage for future use
          if (finalToken) {
            localStorage.setItem('access_token', finalToken)
            if (cookies['client_id_token']) {
              localStorage.setItem('id_token', cookies['client_id_token'])
            }
          }
        }
        
        console.log('🔄 SessionProvider: No server token, trying client-side sources:', { foundToken: finalToken ? 'present' : 'missing' })
      }
      
      // If no token, this is pre-login scenario
      if (!finalToken || !orgId) {
        console.log('⚠️ SessionProvider: No token or orgId, setting no_session state')
        if (!cancelled) setState({ status: "no_session", session: null })
        return
      }

      try {
        console.log('🔄 SessionProvider: Calling loadSession with token and orgId')
        const sessionData = await loadSession(finalToken, orgId)
        console.log('✅ SessionProvider: Session loaded successfully', { user: sessionData.user.name, org: sessionData.org.name })
        if (!cancelled) setState({ status: "ready", session: sessionData })
        
      } catch (err: any) {
        console.error('❌ SessionProvider: Session load error:', err)
        if (!cancelled) {
          setState({ 
            status: "error", 
            session: null, 
            message: err.message || 'Failed to load user session' 
          })
        }
      }
    }

    loadSessionData()
    return () => { cancelled = true }
  }, [token, orgId])

  // Handle different states
  if (state.status === "loading") {
    return (
      <div className="min-h-screen bg-[#171717] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white">Loading your profile...</p>
        </div>
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div className="min-h-screen bg-[#171717] flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-red-400 text-6xl mb-4">⚠️</div>
          <h2 className="text-white text-xl mb-2">Session Error</h2>
          <p className="text-gray-400 mb-4">{state.message}</p>
          <div className="space-x-4">
            <button 
              onClick={() => window.location.reload()} 
              className="bg-white text-black px-4 py-2 rounded hover:bg-gray-200"
            >
              Retry
            </button>
            <button 
              onClick={() => window.location.href = `/o/${orgId}/login`} 
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Sign In Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  // For no_session (pre-login), allow rendering login pages
  // For ready state, session is guaranteed to exist
  return (
    <SessionContext.Provider value={state}>
      {children}
    </SessionContext.Provider>
  )
}