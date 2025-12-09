"use client"

import type React from "react"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  Bell,
  Briefcase,
  FileText,
  Inbox,
  Layers,
  LogOut,
  Mail,
  Menu,
  Settings,
  Shield,
  User,
  Users,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { CommandMenu } from "@/components/command/command-menu"
import { RightRail } from "@/components/rails/right-rail"
import { useSession, useSessionState } from "@/providers/SessionProvider"
import { apiGet, apiPost } from "@/lib/api"
import { cn } from "@/lib/utils"

interface AppLayoutProps {
  children: React.ReactNode
  notificationsCount?: number
}

type NavItem = {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
  href: string
}

export function AppLayout({ children, notificationsCount = 0 }: AppLayoutProps) {
  const session = useSession()
  const sessionState = useSessionState()
  const router = useRouter()
  const pathname = usePathname()

  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const [, setTeamMembers] = useState<any[]>([])

  const getOrgId = () => {
    const segments = pathname.split("/").filter(Boolean)
    if (segments[0] === "o" && segments[1]) {
      return segments[1]
    }
    return null
  }

  const orgId = getOrgId()

  useEffect(() => {
    if (sessionState.status !== "ready") return

    let lastHeartbeat = 0
    let cancelled = false

    const handleActivity = () => {
      const now = Date.now()
      if (now - lastHeartbeat > 60000) {
        lastHeartbeat = now
        sendHeartbeat()
      }
    }

    const fetchTeamMembers = async () => {
      try {
        const data = await apiGet("/api/auth/team-members")
        if (!cancelled) {
          setTeamMembers(data.team_members || data.teamMembers || [])
        }
      } catch (error) {
        console.error("Failed to fetch team members", error)
      }
    }

    const fetchInitial = async () => {
      await Promise.all([fetchTeamMembers(), sendHeartbeat()])
    }

    fetchInitial()

    const heartbeatInterval = setInterval(sendHeartbeat, 60000)
    const teamInterval = setInterval(fetchTeamMembers, 30000)
    const activityListener = () => handleActivity()

    window.addEventListener("mousemove", activityListener)
    window.addEventListener("keydown", activityListener)
    window.addEventListener("click", activityListener)

    return () => {
      cancelled = true
      clearInterval(heartbeatInterval)
      clearInterval(teamInterval)
      window.removeEventListener("mousemove", activityListener)
      window.removeEventListener("keydown", activityListener)
      window.removeEventListener("click", activityListener)
    }
  }, [sessionState.status])

  const sendHeartbeat = async () => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null
      if (!token) return
      await apiPost("/api/auth/activity/heartbeat", {
        timestamp: new Date().toISOString(),
        orgId,
      })
    } catch (error) {
      console.warn("Heartbeat failed", error)
    }
  }

  if (sessionState.status !== "ready" || !session) {
    return null
  }

  const getOrgPath = (path: string) => (orgId ? `/o/${orgId}${path}` : path)

  const mainNavItems: NavItem[] = [
    { icon: Shield, label: "Dashboard", href: getOrgPath("/admin/dashboard") },
    { icon: Mail, label: "Detections", href: getOrgPath("/admin/detections") },
    { icon: Inbox, label: "All Emails", href: getOrgPath("/admin/all-emails") },
    { icon: Users, label: "Assignments", href: getOrgPath("/admin/assignments") },
    { icon: Layers, label: "Pushed Requests", href: getOrgPath("/admin/pushed-requests") },
  ]

  const companySettingsItems: NavItem[] = [
    { icon: Settings, label: "Company Settings", href: getOrgPath("/admin/company-settings") },
    { icon: Users, label: "Manage Employees", href: getOrgPath("/admin/manage-employees") },
    { icon: Shield, label: "Allow & Block List", href: getOrgPath("/admin/allow-block-list") },
    { icon: FileText, label: "Cloud Services", href: getOrgPath("/admin/company-settings/cloud-services") },
  ]

  const userSettingsItems: NavItem[] = [
    { icon: Bell, label: "Notifications", href: getOrgPath("/admin/user-settings/notifications") },
    { icon: Settings, label: "Profile", href: getOrgPath("/admin/user-settings/profile") },
    { icon: Shield, label: "Security", href: getOrgPath("/admin/user-settings/security") },
  ]

  const sections = useMemo(() => {
    return [
      { title: "Workspace", items: mainNavItems },
      { title: "Company", items: companySettingsItems },
      { title: "My Settings", items: userSettingsItems },
    ].filter((section) => section.items.length > 0)
  }, [companySettingsItems, mainNavItems, userSettingsItems])

  // Find the most specific matching route (longest href that matches)
  const getActiveItemHref = useMemo(() => {
    const allItems = [...mainNavItems, ...companySettingsItems, ...userSettingsItems]
    const matchingItems = allItems.filter(
      (item) => pathname === item.href || pathname.startsWith(item.href + "/")
    )
    if (matchingItems.length === 0) return null
    // Return the most specific match (longest href)
    return matchingItems.reduce((prev, current) =>
      current.href.length > prev.href.length ? current : prev
    ).href
  }, [pathname, mainNavItems, companySettingsItems, userSettingsItems])

  const handleNavigation = (href: string) => {
    setMobileNavOpen(false)
    router.push(href)
  }

  const handleLogout = () => {
    try {
      localStorage.removeItem("access_token")
      localStorage.removeItem("id_token")
      localStorage.removeItem("refresh_token")
      localStorage.removeItem("organization_name")
      localStorage.removeItem("organization_id")
    } catch (error) {
      console.warn("Failed clearing local storage", error)
    }
    const logoutUrl = orgId ? `/logout?orgId=${orgId}` : "/logout"
    router.push(logoutUrl)
  }

  const NavigationContent = ({ onNavigate }: { onNavigate: (href: string) => void }) => (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-6 pt-5">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">EncryptGate</div>
        <div className="mt-2 text-lg font-semibold text-white">{session.org?.name || "Security Console"}</div>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto px-2 pb-6">
        {sections.map((section) => (
          <div key={section.title} className="space-y-2">
            <div className="px-2 text-xs font-semibold uppercase tracking-wide text-white/40">
              {section.title}
            </div>
            <div className="space-y-1">
              {section.items.map((item) => {
                // Only mark as active if this is the most specific matching route
                const active = item.href === getActiveItemHref
                const ItemIcon = item.icon
                return (
                  <button
                    key={item.href}
                    onClick={() => onNavigate(item.href)}
                    className={cn("sidebar-item pressable", active && "shadow-inner")}
                    aria-current={active ? "page" : undefined}
                  >
                    <ItemIcon className="h-5 w-5 text-white/80" />
                    <span className="truncate">{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 pb-6">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="sidebar-item w-full justify-start bg-white/5">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-white/10 text-sm text-white">
                  {(session.user?.name || session.user?.email || "EG")
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {session.user?.name || session.user?.email}
                </p>
                <p className="truncate text-xs text-white/60">
                  {session.user?.isOwner
                    ? "Owner"
                    : session.user?.isAdmin
                    ? "Admin"
                    : session.user?.rawRoles?.[0] || "Member"}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 rounded-xl border border-app-border bg-app-surface p-1 text-white shadow-lg"
          >
            <DropdownMenuItem
              onClick={() => onNavigate(getOrgPath("/admin/user-settings/profile"))}
              className="cursor-pointer rounded-lg px-3 py-2 text-sm hover:bg-white/10 focus:bg-white/10"
            >
              <User className="mr-2 h-4 w-4 text-app-ring" />
              Profile settings
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleLogout}
              className="cursor-pointer rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-red-500/10 focus:bg-red-500/10"
            >
              <LogOut className="mr-2 h-4 w-4 text-red-400" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-app text-app-textPrimary">
      <CommandMenu />
      <div className="grid min-h-screen lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="hidden border-r border-app-border bg-app-sidebar lg:block">
          <div className="custom-scrollbar sticky top-0 h-screen overflow-y-auto border-r border-app-border">
            <NavigationContent onNavigate={handleNavigation} />
          </div>
        </aside>

        <div className="flex min-h-screen flex-col bg-app">
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-app-border bg-app-surface/95 px-4 py-4 backdrop-blur lg:px-6">
            <div className="flex items-center gap-3">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-app-textSecondary lg:hidden hover:bg-white/10"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 border-app-border bg-app-sidebar p-0 text-white">
                  <NavigationContent onNavigate={handleNavigation} />
                </SheetContent>
              </Sheet>
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-white/40">Active organization</div>
                <div className="text-sm font-semibold text-white">
                  {session.org?.name || "EncryptGate"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="relative text-app-textSecondary hover:text-white hover:bg-white/10"
              >
                <Bell className="h-5 w-5" />
                {notificationsCount > 0 ? (
                  <span className="absolute right-1 top-1 inline-flex h-2.5 w-2.5 rounded-full bg-app-ring" />
                ) : null}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="hidden items-center gap-2 rounded-full px-3 py-1.5 text-app-textSecondary hover:text-white hover:bg-white/10 sm:flex"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-white/10 text-xs text-white">
                        {(session.user?.name || session.user?.email || "EG")
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col items-start">
                      <span className="text-xs leading-tight text-white/50">Signed in as</span>
                      <span className="text-sm leading-tight text-white">
                        {session.user?.name || session.user?.email}
                      </span>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56 rounded-xl border border-app-border bg-app-surface p-1 text-white shadow-lg"
                >
                  <DropdownMenuItem
                    onClick={() => handleNavigation(getOrgPath("/admin/user-settings/profile"))}
                    className="cursor-pointer rounded-lg px-3 py-2 text-sm hover:bg-white/10 focus:bg-white/10"
                  >
                    <User className="mr-2 h-4 w-4 text-app-ring" />
                    Profile settings
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="cursor-pointer rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-red-500/10 focus:bg-red-500/10"
                  >
                    <LogOut className="mr-2 h-4 w-4 text-red-400" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="custom-scrollbar flex-1 overflow-y-auto bg-app px-4 pb-12 pt-8 lg:px-8">
            <div className="mx-auto w-full max-w-[1200px] space-y-8">
              {children}
            </div>
          </main>
        </div>

        <aside className="hidden border-l border-app-border bg-app-sidebar xl:block">
          <div className="custom-scrollbar sticky top-0 h-screen overflow-y-auto border-l border-app-border">
            <RightRail />
          </div>
        </aside>
      </div>
    </div>
  )
}
