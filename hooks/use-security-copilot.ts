"use client"

import { useState, useRef, useEffect, useCallback } from "react"

export interface SecurityCopilotContext {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  detectionData: any | null
  setDetectionData: (data: any) => void
  emailData: any | null
  setEmailData: (data: any) => void
}

export function useSecurityCopilot() {
  const [isOpen, setIsOpen] = useState(false)
  const [detectionData, setDetectionData] = useState<any | null>(null)
  const [emailData, setEmailData] = useState<any | null>(null)

  // Store the state in a ref to ensure persistence
  const stateRef = useRef({
    isOpen,
    detectionData,
    emailData,
  })

  // Update the ref when state changes
  useEffect(() => {
    stateRef.current = {
      isOpen,
      detectionData,
      emailData,
    }
  }, [isOpen, detectionData, emailData])

  const handleSetIsOpen = useCallback((value: boolean) => {
    setIsOpen(value)
  }, [])

  const handleSetDetectionData = useCallback((data: any) => {
    setDetectionData(data)
  }, [])

  const handleSetEmailData = useCallback((data: any) => {
    setEmailData(data)
  }, [])

  return {
    isOpen,
    setIsOpen: handleSetIsOpen,
    detectionData,
    setDetectionData: handleSetDetectionData,
    emailData,
    setEmailData: handleSetEmailData,
  }
}
