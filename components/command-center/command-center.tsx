"use client"

import { useMemo } from "react"
import { usePathname } from "next/navigation"
import { ActionInbox } from "./inbox"
import { CopilotShortcuts } from "./copilot-shortcuts"
import { QueueSnapshot } from "./queue-snapshot"
import { QuickActions } from "./quick-actions"
import { RecentItems } from "./recent-items"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function CommandCenter() {
  const pathname = usePathname()

  const contextTitle = useMemo(() => {
    if (!pathname) return "Overview"
    if (pathname.includes("/admin/detections")) return "Detections Context"
    if (pathname.includes("/admin/all-emails") || pathname.includes("/admin/email")) return "Email Context"
    if (pathname.includes("/admin/investigate")) return "Investigation Context"
    if (pathname.includes("/admin/company-settings")) return "Settings Context"
    return "Overview"
  }, [pathname])

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <ActionInbox />
        <QuickActions />
        <CopilotShortcuts />
        <QueueSnapshot />
        <RecentItems />
      </div>

      <Card className="bg-[#0f0f0f] border-[#1f1f1f]">
        <CardHeader>
          <CardTitle className="text-white text-sm">{contextTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-gray-400">Contextual shortcuts will appear here.</p>
        </CardContent>
      </Card>
    </div>
  )
}
