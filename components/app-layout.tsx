"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import {
  Bell,
  User,
  Shield,
  Mail,
  AlertTriangle,
  Users,
  FileText,
  Lock,
  UserCheck,
  Menu,
  Clock,
  CheckCircle,
  AlertCircle,
  LogOut,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

interface AppLayoutProps {
  children: React.ReactNode
  notificationsCount?: number
}

// Helper function to decode JWT and get user info
const getUserInfoFromToken = () => {
  try {
    const token = localStorage.getItem("access_token")
    if (!token) return { email: "", name: "" }
    
    const payload = JSON.parse(atob(token.split('.')[1]))
    return {
      email: payload.email || payload.username || "",
      name: payload.name || payload.given_name || payload.email || payload.username || ""
    }
  } catch (error) {
    return { email: "", name: "" }
  }
}

export function AppLayout({ children, notificationsCount = 0 }: AppLayoutProps) {
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true)
  const [userInfo, setUserInfo] = useState({ email: "", name: "" })
  const router = useRouter()
  const pathname = usePathname()

  // Get user info from JWT token on component mount
  useEffect(() => {
    const info = getUserInfoFromToken()
    setUserInfo(info)
  }, [])

  const mainNavItems = [
    { icon: Shield, label: "Dashboard", href: "/admin/dashboard" },
    { icon: Mail, label: "All Emails", href: "/admin/all-emails" },
    { icon: AlertTriangle, label: "Detections", href: "/admin/detections" },
    { icon: FileText, label: "Allow/Block List", href: "/admin/allow-block-list" },
    { icon: UserCheck, label: "Assignments", href: "/admin/assignments" },
    { icon: FileText, label: "Pushed Requests", href: "/admin/pushed-requests" },
    { icon: Users, label: "Manage Employees", href: "/admin/manage-employees" },
  ]

  const companySettingsItems = [
    { icon: Lock, label: "Cloud Services", href: "/admin/company-settings/cloud-services" },
    { icon: User, label: "User Management", href: "/admin/company-settings/user-management" },
    { icon: Shield, label: "Roles & Permissions", href: "/admin/company-settings/roles" },
  ]

  const userSettingsItems = [
    { icon: User, label: "Profile", href: "/admin/user-settings/profile" },
    { icon: Bell, label: "Notifications", href: "/admin/user-settings/notifications" },
    { icon: Lock, label: "Security", href: "/admin/user-settings/security" },
  ]

  const handleNavigation = (href: string) => {
    router.push(href)
  }

  const handleLogout = () => {
    // Clear all tokens and storage
    localStorage.clear()
    sessionStorage.clear()
    
    // Clear any cookies by setting them to expire
    document.cookie = "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"
    document.cookie = "id_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"
    document.cookie = "refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"
    
    // Redirect to logout page
    router.push("/logout")
  }

  const notifications = [
    {
      id: 1,
      type: "detection",
      title: "New Detection",
      message: "A new suspicious email has been detected.",
      time: "2 minutes ago",
      unread: true,
    },
    {
      id: 2,
      type: "assignment",
      title: "Assignment Update",
      message: "You have been assigned to investigate a detection.",
      time: "1 hour ago",
      unread: true,
    },
    {
      id: 3,
      type: "system",
      title: "System Update",
      message: "EncryptGate system has been updated successfully.",
      time: "3 hours ago",
      unread: false,
    },
  ]

  const teamMembers = [
    { name: "Alice Johnson", status: "online", avatar: "AJ" },
    { name: "Bob Smith", status: "away", avatar: "BS" },
    { name: "Charlie Brown", status: "online", avatar: "CB" },
    { name: "Frank Castle", status: "offline", avatar: "FC" },
  ]

  return (
    <div className="min-h-screen bg-[#171717] flex h-screen">
      {/* Left Sidebar */}
      {leftSidebarOpen && (
        <div className="w-64 bg-[#0f0f0f] relative overflow-y-auto custom-scrollbar">
          {/* Close Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLeftSidebarOpen(false)}
            className="absolute top-4 right-4 text-gray-400 hover:text-white hover:bg-[#1f1f1f] z-10"
          >
            <Menu className="w-4 h-4" />
          </Button>

          {/* Logo */}
          <div className="p-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                <Shield className="w-5 h-5 text-black" />
              </div>
              <span className="text-white font-semibold text-lg">EncryptGate</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="p-4 space-y-1">
            {/* Main Navigation */}
            {mainNavItems.map((item, index) => {
              const isActive = pathname === item.href
              return (
                <button
                  key={index}
                  onClick={() => handleNavigation(item.href)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? "bg-[#1f1f1f] text-white"
                      : "text-gray-300 hover:bg-[#1f1f1f] hover:text-white focus:bg-[#1f1f1f] focus:outline-none"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              )
            })}

            <div className="pt-4">
              <div className="px-3 py-2">
                <div className="h-px bg-[#1f1f1f] mb-2"></div>
                <span className="text-gray-500 text-xs font-medium uppercase tracking-wider">Company Settings</span>
              </div>
              {companySettingsItems.map((item, index) => {
                const isActive = pathname === item.href
                return (
                  <button
                    key={`company-${index}`}
                    onClick={() => handleNavigation(item.href)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? "bg-[#1f1f1f] text-white"
                        : "text-gray-300 hover:bg-[#1f1f1f] hover:text-white focus:bg-[#1f1f1f] focus:outline-none"
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </button>
                )
              })}
            </div>

            <div className="pt-4">
              <div className="px-3 py-2">
                <div className="h-px bg-[#1f1f1f] mb-2"></div>
                <span className="text-gray-500 text-xs font-medium uppercase tracking-wider">User Settings</span>
              </div>
              {userSettingsItems.map((item, index) => {
                const isActive = pathname === item.href
                return (
                  <button
                    key={`user-${index}`}
                    onClick={() => handleNavigation(item.href)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? "bg-[#1f1f1f] text-white"
                        : "text-gray-300 hover:bg-[#1f1f1f] hover:text-white focus:bg-[#1f1f1f] focus:outline-none"
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </button>
                )
              })}
            </div>
          </nav>

          {/* User Profile */}
          <div className="absolute bottom-0 left-0 w-64 p-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="flex items-center gap-3 cursor-pointer hover:bg-[#1f1f1f] p-2 rounded-lg transition-colors">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-[#1f1f1f] text-white text-xs">
                      {(userInfo.name || userInfo.email)
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{userInfo.name || userInfo.email}</p>
                    <p className="text-gray-400 text-xs">Security Admin</p>
                  </div>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => handleNavigation("/admin/user-settings/profile")}>
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-[#171717] p-4">
          <div className="flex items-center justify-between">
            {/* Left Side with Menu Toggle */}
            <div className="flex items-center gap-4">
              {!leftSidebarOpen && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLeftSidebarOpen(true)}
                  className="text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                >
                  <Menu className="w-4 h-4" />
                </Button>
              )}
            </div>

            {/* Right Side */}
            <div className="flex items-center gap-4">
              {!rightSidebarOpen && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRightSidebarOpen(true)}
                  className="text-gray-400 hover:text-white hover:bg-[#1f1f1f]"
                >
                  <Menu className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-auto bg-[#171717] custom-scrollbar">{children}</main>
      </div>

      {rightSidebarOpen && (
        <div className="w-80 bg-[#0f0f0f] relative overflow-y-auto custom-scrollbar">
          {/* Close Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRightSidebarOpen(false)}
            className="absolute top-4 right-4 text-gray-400 hover:text-white hover:bg-[#1f1f1f] z-10"
          >
            <Menu className="w-4 h-4" />
          </Button>

          <div className="p-6">
            <h2 className="text-white font-semibold text-lg mb-6">Activity Center</h2>

            {/* Notifications Section */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-medium">Notifications</h3>
              </div>

              <div className="space-y-3">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-3 rounded-lg transition-colors hover:bg-[#1f1f1f] ${
                      notification.unread
                        ? "bg-[#0f0f0f] border border-[#1f1f1f]"
                        : "bg-transparent border border-[#1f1f1f]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-1">
                        {notification.type === "detection" && <AlertCircle className="w-4 h-4 text-red-400" />}
                        {notification.type === "assignment" && <UserCheck className="w-4 h-4 text-gray-400" />}
                        {notification.type === "system" && <CheckCircle className="w-4 h-4 text-green-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium">{notification.title}</p>
                        <p className="text-gray-400 text-xs mt-1">{notification.message}</p>
                        <div className="flex items-center gap-1 mt-2">
                          <Clock className="w-3 h-3 text-gray-500" />
                          <span className="text-gray-500 text-xs">{notification.time}</span>
                        </div>
                      </div>
                      {notification.unread && <div className="w-2 h-2 bg-white rounded-full flex-shrink-0 mt-2"></div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Team Members Section */}
            <div>
              <div className="px-3 py-2 mb-4">
                <div className="h-px bg-[#1f1f1f] mb-2"></div>
                <span className="text-gray-500 text-xs font-medium uppercase tracking-wider">Team Members</span>
              </div>

              <div className="space-y-3">
                {teamMembers.map((member, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#1f1f1f] transition-colors"
                  >
                    <div className="relative">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="bg-[#1f1f1f] text-white text-xs">{member.avatar}</AvatarFallback>
                      </Avatar>
                      <div
                        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0f0f0f] ${
                          member.status === "online"
                            ? "bg-green-500"
                            : member.status === "away"
                              ? "bg-yellow-500"
                              : "bg-[#1f1f1f]"
                        }`}
                      ></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{member.name}</p>
                      <p className="text-gray-400 text-xs capitalize">{member.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}