"use client"

import type { ReactNode } from "react"
import { DetectionsProvider } from "@/contexts/DetectionsContext"
import { SecurityCopilotProvider } from "@/components/security-copilot/security-copilot-provider"
import { RoleProvider } from "@/contexts/RoleContext"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <RoleProvider>
      <DetectionsProvider>
        <SecurityCopilotProvider>
          {children}
        </SecurityCopilotProvider>
      </DetectionsProvider>
    </RoleProvider>
  )
}
