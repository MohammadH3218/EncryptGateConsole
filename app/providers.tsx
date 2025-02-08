"use client"

import type { ReactNode } from "react"
import { DetectionsProvider } from "@/contexts/DetectionsContext"

export function Providers({ children }: { children: ReactNode }) {
  return <DetectionsProvider>{children}</DetectionsProvider>
}

