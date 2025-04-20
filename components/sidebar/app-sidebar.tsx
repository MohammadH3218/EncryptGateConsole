"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Mail,
  AlertTriangle,
  Shield,
  UserCheck,
  Send,
  Users,
  Home,
  ChevronLeft,
  ChevronRight,
  Cloud,
  UserPlus,
  Settings,
  User,
  Bell,
  Lock,
  LogOut,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

interface AppSidebarProps {
  isCollapsed: boolean
  onToggle: () => void
  username: string
  onSignOut: () => void
}

export function AppSidebar({ isCollapsed, onToggle, username, onSignOut }: AppSidebarProps) {
  const pathname = usePathname()
  const isAdmin = pathname?.includes("/admin")
  const baseRoute = isAdmin ? "/admin" : "/employee"

  const routes = [
    {
      title: "Dashboard",
      icon: Home,
      href: `${baseRoute}/dashboard`,
      variant: "default",
    },
    {
      title: "All Emails",
      icon: Mail,
      href: `${baseRoute}/all-emails`,
      variant: "ghost",
    },
    {
      title: "Detections",
      icon: AlertTriangle,
      href: `${baseRoute}/detections`,
      variant: "ghost",
    },
    {
      title: "Allow/Block List",
      icon: Shield,
      href: `${baseRoute}/allow-block-list`,
      variant: "ghost",
    },
    {
      title: "Assignments",
      icon: UserCheck,
      href: `${baseRoute}/assignments`,
      variant: "ghost",
    },
  ]

  // Admin-only routes
  if (isAdmin) {
    routes.push(
      {
        title: "Pushed Requests",
        icon: Send,
        href: "/admin/pushed-requests",
        variant: "ghost",
      },
      {
        title: "Manage Employees",
        icon: Users,
        href: "/admin/manage-employees",
        variant: "ghost",
      },
    )
  }

  // Company settings routes (admin only)
  const companySettingsRoutes = isAdmin
    ? [
        {
          title: "Cloud Services",
          icon: Cloud,
          href: "/admin/company-settings/cloud-services",
          variant: "ghost",
        },
        {
          title: "User Management",
          icon: UserPlus,
          href: "/admin/company-settings/user-management",
          variant: "ghost",
        },
        {
          title: "Roles & Permissions",
          icon: Settings,
          href: "/admin/company-settings/roles",
          variant: "ghost",
        },
      ]
    : []

  // User settings routes
  const userSettingsRoutes = [
    {
      title: "Profile",
      icon: User,
      href: `${baseRoute}/user-settings/profile`,
      variant: "ghost",
    },
    {
      title: "Notifications",
      icon: Bell,
      href: `${baseRoute}/user-settings/notifications`,
      variant: "ghost",
    },
    {
      title: "Security",
      icon: Lock,
      href: `${baseRoute}/user-settings/security`,
      variant: "ghost",
    },
  ]

  return (
    <TooltipProvider>
      <div
        className={cn(
          "group relative flex h-screen flex-col border-r bg-background transition-all duration-300",
          isCollapsed ? "w-16" : "w-64",
        )}
      >
        <div className="flex h-14 items-center justify-between px-3 py-2 shrink-0 border-b">
          <div className={cn("flex items-center gap-2", isCollapsed && "justify-center w-full")}>
            <div className="w-8 h-8">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                <path
                  d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2zm0 25.2c-6.188 0-11.2-5.012-11.2-11.2S9.812 4.8 16 4.8 27.2 9.812 27.2 16 22.188 27.2 16 27.2z"
                  fill="currentColor"
                />
              </svg>
            </div>
            {!isCollapsed && <span className="text-xl font-bold">EncryptGate</span>}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", isCollapsed && "absolute -right-3 top-9 z-10 rounded-full border bg-background")}
            onClick={onToggle}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        <ScrollArea className="flex-1 py-2">
          <nav className="grid gap-1 px-2">
            {routes.map((route) => (
              <Tooltip key={route.href} delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link
                    href={route.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                      pathname === route.href ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                      isCollapsed && "justify-center",
                    )}
                  >
                    <route.icon className="h-5 w-5" />
                    {!isCollapsed && <span>{route.title}</span>}
                  </Link>
                </TooltipTrigger>
                {isCollapsed && (
                  <TooltipContent side="right" className="flex items-center gap-4">
                    {route.title}
                  </TooltipContent>
                )}
              </Tooltip>
            ))}

            {/* Company Settings Section (Admin Only) */}
            {isAdmin && companySettingsRoutes.length > 0 && (
              <>
                <div className="my-2 px-3">
                  {!isCollapsed && (
                    <div className="flex items-center">
                      <div className="h-px flex-1 bg-border"></div>
                      <span className="mx-2 text-xs text-muted-foreground">Company Settings</span>
                      <div className="h-px flex-1 bg-border"></div>
                    </div>
                  )}
                  {isCollapsed && <div className="h-px w-full bg-border"></div>}
                </div>

                {companySettingsRoutes.map((route) => (
                  <Tooltip key={route.href} delayDuration={0}>
                    <TooltipTrigger asChild>
                      <Link
                        href={route.href}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                          pathname === route.href ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                          isCollapsed && "justify-center",
                        )}
                      >
                        <route.icon className="h-5 w-5" />
                        {!isCollapsed && <span>{route.title}</span>}
                      </Link>
                    </TooltipTrigger>
                    {isCollapsed && (
                      <TooltipContent side="right" className="flex items-center gap-4">
                        {route.title}
                      </TooltipContent>
                    )}
                  </Tooltip>
                ))}
              </>
            )}

            {/* User Settings Section */}
            <div className="my-2 px-3">
              {!isCollapsed && (
                <div className="flex items-center">
                  <div className="h-px flex-1 bg-border"></div>
                  <span className="mx-2 text-xs text-muted-foreground">User Settings</span>
                  <div className="h-px flex-1 bg-border"></div>
                </div>
              )}
              {isCollapsed && <div className="h-px w-full bg-border"></div>}
            </div>

            {userSettingsRoutes.map((route) => (
              <Tooltip key={route.href} delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link
                    href={route.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                      pathname === route.href ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                      isCollapsed && "justify-center",
                    )}
                  >
                    <route.icon className="h-5 w-5" />
                    {!isCollapsed && <span>{route.title}</span>}
                  </Link>
                </TooltipTrigger>
                {isCollapsed && (
                  <TooltipContent side="right" className="flex items-center gap-4">
                    {route.title}
                  </TooltipContent>
                )}
              </Tooltip>
            ))}
          </nav>
        </ScrollArea>

        <div className="mt-auto border-t p-2 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div
                className={cn(
                  "flex items-center gap-3 rounded-lg p-2 cursor-pointer hover:bg-accent",
                  isCollapsed && "justify-center",
                )}
              >
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-4 w-4" />
                </div>
                {!isCollapsed && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">{username}</p>
                    <p className="text-xs text-muted-foreground">Security Admin</p>
                  </div>
                )}
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isCollapsed ? "center" : "end"}>
              <DropdownMenuItem onClick={onSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </TooltipProvider>
  )
}
