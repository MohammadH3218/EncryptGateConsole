"use client"

import { usePathname } from "next/navigation"
import { Notifications } from "./notifications"
import { ActionInbox } from "./action-inbox"
import { QueueSnapshot } from "./queue-snapshot"
import { RecentItems } from "./recent-items"
import { IocsPanel } from "./iocs-panel"
import { Timeline } from "./timeline"
import { DetectionsContext } from "./detections-context"
import { EmailsContext } from "./emails-context"
import { SettingsContext } from "./settings-context"
import { DashboardContext } from "./dashboard-context"

export function CommandCenter() {
  const pathname = usePathname()

  // Determine which context modules to show based on current page
  const showInvestigateContext = pathname?.includes("/investigate/")
  const showDetectionsContext = !!pathname?.includes("/admin/detections")
  const showEmailsContext = !!(pathname?.includes("/admin/all-emails") || pathname?.includes("/admin/email"))
  const showSettingsContext =
    pathname?.includes("/company-settings") ||
    pathname?.includes("/cloud-services") ||
    pathname?.includes("/user-management")
  const showDashboardContext = !!pathname?.includes("/admin/dashboard")

  return (
    <div className="space-y-4">
      {/* Always-On Modules */}
      <Notifications />
      <ActionInbox />
      <QueueSnapshot />
      <RecentItems />

      {/* Context Modules */}
      {showInvestigateContext && (
        <>
          <IocsPanel />
          <Timeline />
        </>
      )}
      {showDetectionsContext && <DetectionsContext />}
      {showEmailsContext && <EmailsContext />}
      {showSettingsContext && <SettingsContext />}
      {showDashboardContext && <DashboardContext />}
    </div>
  )
}
