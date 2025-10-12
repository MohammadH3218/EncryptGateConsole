"use client"

import { useMemo } from "react"
import { usePathname } from "next/navigation"
import { ActionInbox } from "./inbox"
import { CopilotShortcuts } from "./copilot-shortcuts"
import { QueueSnapshot } from "./queue-snapshot"
import { QuickActions } from "./quick-actions"
import { RecentItems } from "./recent-items"
import { IocsPanel } from "./iocs-panel"
import { CaseTimeline } from "./timeline"
import { DetectionsContext } from "./detections-context"
import { EmailsContext } from "./emails-context"
import { SettingsContext } from "./settings-context"
import { DashboardContext } from "./dashboard-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function CommandCenter() {
  const pathname = usePathname()

  const contextTitle = useMemo(() => {
    if (!pathname) return "Overview"
    if (pathname.includes("/admin/detections")) return "Detections Context"
    if (pathname.includes("/admin/all-emails") || pathname.includes("/admin/email")) return "Email Context"
    if (pathname.includes("/admin/investigate")) return "Investigation Context"
    if (pathname.includes("/admin/company-settings")) return "Settings Context"
    if (pathname.endsWith("/dashboard")) return "Dashboard Context"
    return "Overview"
  }, [pathname])

  const showDetections = !!pathname?.includes("/admin/detections")
  const showEmails = !!(pathname?.includes("/admin/all-emails") || pathname?.includes("/admin/email"))
  const showInvestigate = !!pathname?.includes("/admin/investigate")
  const showSettings = !!pathname?.includes("/admin/company-settings")
  const showDashboard = !!pathname?.includes("/admin/dashboard")

  return (
    <div className="space-y-3">
      {/* Always-on */}
      <div className="space-y-3">
        <ActionInbox />
        <QuickActions />
        <CopilotShortcuts />
        <QueueSnapshot />
        <RecentItems />
      </div>

      {/* Context-aware header */}
      <Card className="bg-[#0f0f0f] border-[#1f1f1f]">
        <CardHeader>
          <CardTitle className="text-white text-sm">{contextTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-gray-400">Handy tools adjusted to your current page.</p>
        </CardContent>
      </Card>

      {/* Context modules per page */}
      {showDetections && <DetectionsContext />}
      {showEmails && <EmailsContext />}
      {showInvestigate && (
        <>
          <IocsPanel />
          <CaseTimeline />
        </>
      )}
      {showSettings && <SettingsContext />}
      {showDashboard && <DashboardContext />}
    </div>
  )
}