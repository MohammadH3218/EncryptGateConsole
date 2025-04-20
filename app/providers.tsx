"use client"

import type { ReactNode } from "react"
import { DetectionsProvider } from "@/contexts/DetectionsContext"
import { SecurityCopilotProvider } from "@/components/security-copilot/security-copilot-provider"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <DetectionsProvider>
      <SecurityCopilotProvider>{children}</SecurityCopilotProvider>
    </DetectionsProvider>
  )
}
