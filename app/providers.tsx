"use client"

import type { ReactNode } from "react"
import { DetectionsProvider } from "@/contexts/DetectionsContext"
import { RoleProvider } from "@/contexts/RoleContext"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <RoleProvider>
      <DetectionsProvider>
        {children}
      </DetectionsProvider>
    </RoleProvider>
  )
}
