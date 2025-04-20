"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Search, BellRing, Settings, User, LogOut } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { LogoText } from "@/components/ui/logo-text"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"

export interface DashboardHeaderProps {
  onSearch?: (query: string) => void
  username: string
  onSignOut: () => void | Promise<void>
  notificationsCount?: number
}

export function DashboardHeader({ onSearch, username, onSignOut, notificationsCount = 0 }: DashboardHeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const isAdmin = pathname?.includes("/admin")
  const baseRoute = isAdmin ? "/admin" : "/employee"

  const navItems = [
    { name: "Dashboard", href: `${baseRoute}/dashboard` },
    { name: "All Emails", href: `${baseRoute}/all-emails` },
    { name: "Detections", href: `${baseRoute}/detections` },
    { name: "Allow/Block List", href: `${baseRoute}/allow-block-list` },
    { name: "Assignments", href: `${baseRoute}/assignments` },
    ...(isAdmin
      ? [
          { name: "Pushed Requests", href: "/admin/pushed-requests" },
          { name: "Manage Employees", href: "/admin/manage-employees" },
        ]
      : []),
  ]

  const handleSignOut = async () => {
    try {
      await Promise.resolve(onSignOut())
      router.push("/login")
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-6">
        {/* Logo Section - Left */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8">
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
              <path
                d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2zm0 25.2c-6.188 0-11.2-5.012-11.2-11.2S9.812 4.8 16 4.8 27.2 9.812 27.2 16 22.188 27.2 16 27.2z"
                fill="currentColor"
              />
              <path
                d="M16 7.6c-4.632 0-8.4 3.768-8.4 8.4s3.768 8.4 8.4 8.4 8.4-3.768 8.4-8.4-3.768-8.4-8.4-8.4zm0 14c-3.08 0-5.6-2.52-5.6-5.6s2.52-5.6 5.6-5.6 5.6 2.52 5.6 5.6-2.52 5.6-5.6 5.6z"
                fill="currentColor"
              />
              <path
                d="M16 12.8c-1.76 0-3.2 1.44-3.2 3.2s1.44 3.2 3.2 3.2 3.2-1.44 3.2-3.2-1.44-3.2-3.2-3.2z"
                fill="currentColor"
              />
            </svg>
          </div>
          <LogoText>EncryptGate</LogoText>
        </div>

        {/* Navigation Section - Center */}
        <nav className="mx-auto px-6">
          <ul className="flex items-center justify-center space-x-8">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`whitespace-nowrap transition-colors hover:text-foreground/80 text-sm ${
                    pathname === item.href ? "text-foreground" : "text-foreground/60"
                  }`}
                >
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Controls Section - Right */}
        <div className="flex items-center gap-2 ml-auto">
          {onSearch && (
            <div className="relative w-[200px] mr-2">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search..."
                className="pl-8 w-full"
                onChange={(e) => onSearch(e.target.value)}
              />
            </div>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <BellRing className="h-5 w-5" />
                {notificationsCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="h-4 w-4 absolute -top-1 -right-1 flex items-center justify-center text-[10px] p-0"
                  >
                    {notificationsCount > 99 ? "99+" : notificationsCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium leading-none">Notifications</h4>
                  <Button variant="ghost" className="text-xs text-muted-foreground">
                    Mark all as read
                  </Button>
                </div>
                <div className="grid gap-4">
                  {notificationsCount > 0 ? (
                    <>
                      <div className="grid gap-1">
                        <p className="text-sm font-medium">New Detection</p>
                        <p className="text-sm text-muted-foreground">A new suspicious email has been detected.</p>
                        <p className="text-xs text-muted-foreground">2 minutes ago</p>
                      </div>
                      <div className="grid gap-1">
                        <p className="text-sm font-medium">Assignment Update</p>
                        <p className="text-sm text-muted-foreground">
                          You have been assigned to investigate a detection.
                        </p>
                        <p className="text-xs text-muted-foreground">1 hour ago</p>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No new notifications</p>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <h4 className="font-medium leading-none">Settings</h4>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">Notifications</p>
                      <p className="text-sm text-muted-foreground">Enable email notifications</p>
                    </div>
                    <Button variant="outline" size="sm">
                      Enable
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">Two-Factor Auth</p>
                      <p className="text-sm text-muted-foreground">Add an extra layer of security</p>
                    </div>
                    <Button variant="outline" size="sm">
                      Set up
                    </Button>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 flex items-center gap-2">
                <User className="h-4 w-4" />
                <span>{username}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
