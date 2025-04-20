"use client"

import { BellRing, Settings, User, LogOut, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
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

export interface AppHeaderProps {
  onSearch?: (query: string) => void
  username: string
  onSignOut: () => void | Promise<void>
  notificationsCount?: number
}

export function AppHeader({ onSearch, username, onSignOut, notificationsCount = 0 }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4 gap-4">
        {onSearch && (
          <div className="flex-1 md:max-w-md">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search..."
                className="pl-8 w-full"
                onChange={(e) => onSearch(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
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
              <DropdownMenuItem onClick={onSignOut}>
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
