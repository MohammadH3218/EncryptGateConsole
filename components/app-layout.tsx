"use client"

import * as React from "react"
import { AppSidebar } from "@/components/sidebar/app-sidebar"
import { TeamActivitySidebar } from "@/components/team-activity-sidebar"
import { useRouter } from "next/navigation"

interface AppLayoutProps {
  children: React.ReactNode
  username: string
  onSearch?: (query: string) => void
  notificationsCount?: number
  hideTeamActivity?: boolean
}

export function AppLayout({
  children,
  username,
  onSearch,
  notificationsCount = 0,
  hideTeamActivity = false,
}: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false)
  const [teamSidebarCollapsed, setTeamSidebarCollapsed] = React.useState(false)
  const router = useRouter()

  const handleSignOut = () => {
    localStorage.removeItem("access_token")
    localStorage.removeItem("user_email")
    router.push("/login")
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        username={username}
        onSignOut={handleSignOut}
      />

      <div className="flex flex-1 flex-col overflow-hidden border-fix">
        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto p-4">
            {onSearch && (
              <div className="mb-4 max-w-md">
                <div className="relative">
                  <input
                    type="search"
                    placeholder="Search..."
                    className="w-full rounded-md border border-input bg-background px-3 py-2 pl-8 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onChange={(e) => onSearch(e.target.value)}
                  />
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  >
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.3-4.3"></path>
                  </svg>
                </div>
              </div>
            )}
            {children}
          </main>

          {!hideTeamActivity && (
            <TeamActivitySidebar
              isCollapsed={teamSidebarCollapsed}
              onToggle={() => setTeamSidebarCollapsed(!teamSidebarCollapsed)}
              notificationsCount={notificationsCount}
            />
          )}
        </div>
      </div>
    </div>
  )
}
