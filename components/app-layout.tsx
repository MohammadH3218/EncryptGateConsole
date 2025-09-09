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
import { useSession, useSessionState } from "@/providers/SessionProvider"
import { can } from "@/lib/session"
import { apiGet, apiPost } from "@/lib/api"

interface AppLayoutProps {
  children: React.ReactNode
  username?: string
  notificationsCount?: number
}

// Helper function to decode JWT and get user info (prefer ID token for profile claims)
const getUserInfoFromToken = () => {
  try {
    const decode = (t: string) => JSON.parse(atob(t.split(".")[1]));
    const idTok = localStorage.getItem("id_token");
    const accTok = localStorage.getItem("access_token");
    const p = idTok ? decode(idTok) : accTok ? decode(accTok) : {};

    const email = p.email || p["cognito:username"] || p.username || "";
    const name = p.preferred_username || p.name || p.given_name || p.nickname || email || "";

    return { email, name };
  } catch {
    return { email: "", name: "" };
  }
}

export function AppLayout({ children, username, notificationsCount = 0 }: AppLayoutProps) {
  const session = useSession()
  const sessionState = useSessionState()
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true)
  const [userInfo, setUserInfo] = useState({ email: "", name: "" })
  const [teamMembers, setTeamMembers] = useState([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  // Only render AppLayout if session is ready
  if (sessionState.status !== "ready") {
    // The SessionProvider will handle loading/error states
    return null
  }

  // Extract orgId from current pathname
  const getOrgId = () => {
    const pathSegments = pathname.split('/')
    if (pathSegments[1] === 'o' && pathSegments[2]) {
      return pathSegments[2]
    }
    return null
  }
  
  const orgId = getOrgId()

  // Since we're guaranteed to have session data (status === "ready"), use it directly
  useEffect(() => {
    if (session?.user) {
      setUserInfo({ 
        email: session.user.email || '', 
        name: session.user.name || session.user.email || ''
      })
    }
  }, [session?.user?.name, session?.user?.email])

  // Initialize data and set up intervals on mount
  useEffect(() => {
    // Initial data fetch
    fetchTeamMembers()
    sendHeartbeat()

    // Set up intervals
    const heartbeatInterval = setInterval(sendHeartbeat, 60000) // Every minute
    const teamMembersInterval = setInterval(fetchTeamMembers, 30000) // Every 30 seconds

    // Cleanup intervals on unmount
    return () => {
      clearInterval(heartbeatInterval)
      clearInterval(teamMembersInterval)
    }
  }, [])

  // Send heartbeat on user activity (mouse move, key press, click)
  useEffect(() => {
    const handleActivity = () => {
      sendHeartbeat()
    }

    // Throttle activity updates to max once per minute
    let lastHeartbeat = 0
    const throttledActivity = () => {
      const now = Date.now()
      if (now - lastHeartbeat > 60000) { // 60 seconds
        lastHeartbeat = now
        handleActivity()
      }
    }

    document.addEventListener('mousemove', throttledActivity)
    document.addEventListener('keypress', throttledActivity)
    document.addEventListener('click', throttledActivity)

    return () => {
      document.removeEventListener('mousemove', throttledActivity)
      document.removeEventListener('keypress', throttledActivity)
      document.removeEventListener('click', throttledActivity)
    }
  }, [])

  // Get organization-aware URLs
  const getOrgPath = (path: string) => orgId ? `/o/${orgId}${path}` : path

  const allMainNavItems = [
    { icon: Shield, label: "Dashboard", href: getOrgPath("/admin/dashboard"), permissions: ["dashboard.read"] },
    { icon: Mail, label: "All Emails", href: getOrgPath("/admin/all-emails"), permissions: ["dashboard.read"] },
    { icon: AlertTriangle, label: "Detections", href: getOrgPath("/admin/detections"), permissions: ["detections.read"] },
    { icon: FileText, label: "Allow/Block List", href: getOrgPath("/admin/allow-block-list"), permissions: ["blocked_emails.read"] },
    { icon: UserCheck, label: "Assignments", href: getOrgPath("/admin/assignments"), permissions: ["assignments.read"] },
    { icon: Users, label: "Manage Employees", href: getOrgPath("/admin/manage-employees"), permissions: ["manage_employees.read"] },
  ]

  const allPushedRequestsItems = [
    { icon: FileText, label: "Pushed Requests", href: getOrgPath("/admin/pushed-requests"), permissions: ["pushed_requests.read"] },
  ]

  const allCompanySettingsItems = [
    { icon: Lock, label: "Cloud Services", href: getOrgPath("/admin/company-settings/cloud-services"), permissions: ["company_settings.read"] },
    { icon: User, label: "User Management", href: getOrgPath("/admin/company-settings/user-management"), permissions: ["company_settings.read"] },
    { icon: Shield, label: "Roles & Permissions", href: getOrgPath("/admin/company-settings/roles"), permissions: ["company_settings.read"] },
  ]

  const allUserSettingsItems = [
    { icon: User, label: "Profile", href: getOrgPath("/admin/user-settings/profile"), permissions: ["profile.read"] },
    { icon: Bell, label: "Notifications", href: getOrgPath("/admin/user-settings/notifications"), permissions: ["notifications.read"] },
    { icon: Lock, label: "Security", href: getOrgPath("/admin/user-settings/security"), permissions: ["security.read"] },
  ]

  // Check user roles for hierarchy-based permissions
  const userRoles = session?.user?.roles || []
  const isOwner = userRoles.includes('Owner') || session?.user?.isOwner
  const isSrAdmin = userRoles.includes('Sr. Admin')
  const isAdmin = userRoles.includes('Admin') || session?.user?.isAdmin
  const isAnalyst = userRoles.includes('Analyst')
  const isViewer = userRoles.includes('Viewer')
  
  // Check if user has Super permissions (Owner/Sr. Admin)
  const isSuper = !!(isOwner || isSrAdmin)
  
  // Helper function for permission checking based on role hierarchy
  const hasPermission = (requiredPermissions: string[]) => {
    // Super users bypass all permission checks
    if (isSuper) return true
    
    // No permissions required means accessible to all
    if (requiredPermissions.length === 0) return true
    
    // Check if user has any of the required permissions
    return requiredPermissions.some(permission => {
      // Handle special permissions based on role hierarchy
      if (permission === "pushed_requests.read") {
        return isAdmin || isOwner || isSrAdmin
      }
      if (permission === "company_settings.read") {
        return isSrAdmin || isOwner
      }
      // Check against actual user permissions
      return can(session?.user?.permissions, permission)
    })
  }
  
  // Filter navigation items based on user permissions and role hierarchy
  const mainNavItems = allMainNavItems.filter(item => hasPermission(item.permissions))
  const pushedRequestsItems = allPushedRequestsItems.filter(item => hasPermission(item.permissions))
  const companySettingsItems = allCompanySettingsItems.filter(item => hasPermission(item.permissions))
  const userSettingsItems = allUserSettingsItems.filter(item => hasPermission(item.permissions))

  const handleNavigation = (href: string) => {
    router.push(href)
  }

  // Fetch team members from API
  const fetchTeamMembers = async () => {
    try {
      const data = await apiGet('/api/auth/team-members')
      console.log('📋 Team members data received:', data)
      setTeamMembers(data.team_members || data.teamMembers || [])
    } catch (error) {
      console.error("Failed to fetch team members:", error)
      // Don't throw error, just log it - team members is not critical
    }
  }

  // Send activity heartbeat
  const sendHeartbeat = async () => {
    try {
      const token = localStorage.getItem("access_token")
      if (!token) return

      await apiPost("/api/auth/activity/heartbeat", {})
    } catch (error) {
      console.error("Failed to send heartbeat:", error)
      // Don't throw error, heartbeat is not critical
    }
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

  // Status colors
  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return 'bg-green-500'
      case 'away': return 'bg-yellow-500'
      case 'offline': return 'bg-gray-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusText = (member) => {
    if (member.status === 'online') {
      return 'Online'
    }
    return member.last_seen || 'Offline'
  }

  return (
    <div className="min-h-screen bg-[#171717] flex h-screen">
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1f1f1f;
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #2f2f2f;
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3f3f3f;
        }
      `}</style>
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
          <div className="p-6 border-b border-[#1f1f1f]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                <Shield className="w-5 h-5 text-black" />
              </div>
              <span className="text-white font-semibold text-lg">EncryptGate</span>
            </div>
            {session?.org?.name && (
              <div className="text-gray-400 text-sm truncate">
                {session.org.name}
              </div>
            )}
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

            {/* Pushed Requests section (Admins and above only) */}
            {pushedRequestsItems.length > 0 && (
              <div className="pt-4">
                <div className="px-3 py-2">
                  <div className="h-px bg-[#1f1f1f] mb-2"></div>
                  <span className="text-gray-500 text-xs font-medium uppercase tracking-wider">Admin Tools</span>
                </div>
                {pushedRequestsItems.map((item, index) => {
                  const isActive = pathname === item.href
                  return (
                    <button
                      key={`pushed-${index}`}
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
            )}

            {/* Company Settings section (Sr. Admin and above only) */}
            {companySettingsItems.length > 0 && (
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
            )}

            {/* User Settings section (Always visible but filtered by permissions) */}
            {userSettingsItems.length > 0 && (
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
            )}
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
                    <p className="text-white text-sm font-medium truncate">{session.user.name || session.user.email}</p>
                    <p className="text-gray-400 text-xs">
                      {session.user.isOwner ? 'Owner' : 
                       session.user.isAdmin ? 'Admin' : 
                       session.user.rawRoles?.[0] || 'Member'}
                    </p>
                  </div>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-[#0f0f0f] border border-[#2f2f2f] shadow-xl">
                <DropdownMenuItem 
                  onClick={() => handleNavigation(getOrgPath("/admin/user-settings/profile"))}
                  className="text-white hover:bg-[#1f1f1f] hover:text-white cursor-pointer focus:bg-[#1f1f1f] focus:text-white transition-all duration-200"
                >
                  <User className="mr-2 h-4 w-4 text-blue-400" />
                  <span className="font-medium">Profile Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={handleLogout}
                  className="text-white hover:bg-red-900/20 hover:text-red-200 cursor-pointer focus:bg-red-900/20 focus:text-red-200 transition-all duration-200"
                >
                  <LogOut className="mr-2 h-4 w-4 text-red-400" />
                  <span className="font-medium">Sign out</span>
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

              <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
                {teamMembers.length === 0 ? (
                  <div className="text-center text-gray-400 text-sm py-4">
                    <div className="animate-pulse">Loading team members...</div>
                  </div>
                ) : (
                  teamMembers.map((member, index) => (
                    <div
                      key={member.id || index}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#1f1f1f] transition-colors cursor-pointer"
                      title={`${member.name || member.email} - ${member.email}`}
                    >
                      <div className="relative">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="bg-[#1f1f1f] text-white text-xs">
                            {member.avatar || (member.name || member.email)?.substring(0, 2).toUpperCase() || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0f0f0f] ${getStatusColor(member.status)}`}
                          title={`${member.status.charAt(0).toUpperCase() + member.status.slice(1)}`}
                        ></div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">
                          {member.name || member.email}
                        </p>
                        <p className="text-gray-400 text-xs truncate">
                          {getStatusText(member)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {/* Team Members Count */}
              <div className="mt-4 px-3 py-2 text-center">
                <span className="text-gray-500 text-xs">
                  {teamMembers.filter(m => m.status === 'online').length} online • {teamMembers.length} total
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}