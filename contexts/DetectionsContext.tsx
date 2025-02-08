"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import { useToast } from "@/components/ui/use-toast"

interface Detection {
  id: number
  uniqueId: string
  severity: string
  name: string
  status: string
  assignedTo: string[] | string
  sentBy: string
  timestamp: string
  description: string
  indicators: string[]
  recommendations: string[]
  pushedBy?: string
}

interface BlockedSender {
  id: number
  email: string
  reason: string
  blockedBy: string
  timestamp: string
}

interface AllowedSender {
  id: number
  email: string
  reason: string
  allowedBy: string
  timestamp: string
}

interface DetectionsContextType {
  detections: Detection[]
  pushedDetections: Detection[]
  blockedSenders: BlockedSender[]
  allowedSenders: AllowedSender[]
  addDetection: (detection: Omit<Detection, "id" | "uniqueId">) => Promise<void>
  updateDetection: (id: number, updates: Partial<Detection>) => Promise<void>
  removeDetection: (id: number) => Promise<void>
  pushDetection: (id: number, pushedBy: string) => Promise<void>
  blockSender: (email: string, reason: string, blockedBy: string) => Promise<void>
  allowSender: (email: string, reason: string, allowedBy: string) => Promise<void>
  addNotification: (message: string) => void
  fetchDetections: () => Promise<void>
  fetchPushedDetections: () => Promise<void>
  fetchBlockedSenders: () => Promise<void>
  fetchAllowedSenders: () => Promise<void>
}

const DetectionsContext = createContext<DetectionsContextType | undefined>(undefined)

export function DetectionsProvider({ children }: { children: ReactNode }) {
  const [detections, setDetections] = useState<Detection[]>([])
  const [pushedDetections, setPushedDetections] = useState<Detection[]>([])
  const [blockedSenders, setBlockedSenders] = useState<BlockedSender[]>([])
  const [allowedSenders, setAllowedSenders] = useState<AllowedSender[]>([])
  const { toast } = useToast()

  const addDetection = useCallback(async (detection: Omit<Detection, "id" | "uniqueId">) => {
    // TODO: Implement API call to add detection
    // const newDetection = await apiAddDetection(detection)
    // setDetections(prev => [...prev, newDetection])
  }, [])

  const updateDetection = useCallback(async (id: number, updates: Partial<Detection>) => {
    // TODO: Implement API call to update detection
    // const updatedDetection = await apiUpdateDetection(id, updates)
    // setDetections((prev) => prev.map((detection) => (detection.id === id ? updatedDetection : detection)))
  }, [])

  const removeDetection = useCallback(async (id: number) => {
    // TODO: Implement API call to remove detection
    // await apiRemoveDetection(id)
    setDetections((prev) => prev.filter((detection) => detection.id !== id))
  }, [])

  const pushDetection = useCallback(async (id: number, pushedBy: string) => {
    // TODO: Implement API call to push detection
    // const pushedDetection = await apiPushDetection(id, pushedBy)
    // setPushedDetections((prev) => [...prev, pushedDetection])
    // removeDetection(id)
  }, [])

  const blockSender = useCallback(async (email: string, reason: string, blockedBy: string) => {
    // TODO: Implement API call to block sender
    // const newBlockedSender = await apiBlockSender(email, reason, blockedBy)
    // setBlockedSenders((prev) => [...prev, newBlockedSender])
  }, [])

  const allowSender = useCallback(async (email: string, reason: string, allowedBy: string) => {
    // TODO: Implement API call to allow sender
    // const newAllowedSender = await apiAllowSender(email, reason, allowedBy)
    // setAllowedSenders((prev) => [...prev, newAllowedSender])
  }, [])

  const addNotification = useCallback(
    (message: string) => {
      toast({
        title: "New Notification",
        description: message,
      })
    },
    [toast],
  )

  const fetchDetections = useCallback(async () => {
    // TODO: Implement API call to fetch detections
    // setDetections(await fetchedData)
  }, [])

  const fetchPushedDetections = useCallback(async () => {
    // TODO: Implement API call to fetch pushed detections
    // setPushedDetections(await fetchedData)
  }, [])

  const fetchBlockedSenders = useCallback(async () => {
    // TODO: Implement API call to fetch blocked senders
    // setBlockedSenders(await fetchedData)
  }, [])

  const fetchAllowedSenders = useCallback(async () => {
    // TODO: Implement API call to fetch allowed senders
    // setAllowedSenders(await fetchedData)
  }, [])

  return (
    <DetectionsContext.Provider
      value={{
        detections,
        pushedDetections,
        blockedSenders,
        allowedSenders,
        addDetection,
        updateDetection,
        removeDetection,
        pushDetection,
        blockSender,
        allowSender,
        addNotification,
        fetchDetections,
        fetchPushedDetections,
        fetchBlockedSenders,
        fetchAllowedSenders,
      }}
    >
      {children}
    </DetectionsContext.Provider>
  )
}

export function useDetections() {
  const context = useContext(DetectionsContext)
  if (context === undefined) {
    throw new Error("useDetections must be used within a DetectionsProvider")
  }
  return context
}

