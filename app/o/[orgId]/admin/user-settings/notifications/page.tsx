"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useToast } from "@/components/ui/use-toast"
import { useNotifications, type Notification } from "@/hooks/useNotifications"
import { 
  Bell, 
  Settings, 
  Trash2, 
  CheckCircle, 
  AlertTriangle, 
  Mail, 
  Users, 
  FileText, 
  Shield,
  BellRing,
  Check,
  X,
  RefreshCw
} from "lucide-react"

export default function NotificationsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [selectedNotifications, setSelectedNotifications] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState("notifications")
  
  const {
    notifications,
    unreadNotifications,
    loading,
    error,
    unreadCount,
    refresh,
    markAsRead,
    markAsUnread,
    deleteNotification,
    deleteSelected,
    clearAll,
  } = useNotifications()

  // Notification preferences state
  const [settings, setSettings] = useState({
    emailNotifications: true,
    criticalAlerts: true,
    highAlerts: true,
    mediumAlerts: true,
    lowAlerts: false,
    assignmentUpdates: true,
    systemUpdates: false,
    dailyDigest: true,
    weeklyReport: true,
    pushedRequests: true,
    detectionAlerts: true,
  })

  const handleSaveSettings = () => {
    setIsLoading(true)

    // Simulate API call - in real app this would save to backend
    setTimeout(() => {
      setIsLoading(false)
      toast({
        title: "Notification Settings Updated",
        description: "Your notification preferences have been saved.",
      })
    }, 1000)
  }

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings({
      ...settings,
      [key]: !settings[key],
    })
  }

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case "critical_email":
        return <AlertTriangle className="h-4 w-4 text-red-500" />
      case "pushed_request":
        return <FileText className="h-4 w-4 text-blue-500" />
      case "assignment":
        return <Users className="h-4 w-4 text-green-500" />
      case "detection":
        return <Shield className="h-4 w-4 text-orange-500" />
      case "system_update":
        return <CheckCircle className="h-4 w-4 text-purple-500" />
      case "weekly_report":
        return <Mail className="h-4 w-4 text-gray-500" />
      default:
        return <BellRing className="h-4 w-4 text-gray-500" />
    }
  }

  const formatDateTime = (createdAt: string) => {
    return new Date(createdAt).toLocaleString()
  }

  const handleSelectAll = () => {
    if (selectedNotifications.length === notifications.length) {
      setSelectedNotifications([])
    } else {
      setSelectedNotifications(notifications.map(n => n.id))
    }
  }

  const handleSelectNotification = (notificationId: string) => {
    setSelectedNotifications(prev => 
      prev.includes(notificationId)
        ? prev.filter(id => id !== notificationId)
        : [...prev, notificationId]
    )
  }

  const handleDeleteSelected = async () => {
    if (selectedNotifications.length === 0) return
    
    try {
      await deleteSelected(selectedNotifications)
      setSelectedNotifications([])
      toast({
        title: "Notifications Deleted",
        description: `Successfully deleted ${selectedNotifications.length} notification${selectedNotifications.length > 1 ? 's' : ''}`,
      })
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to delete notifications",
        variant: "destructive"
      })
    }
  }

  const handleClearAll = async () => {
    try {
      await clearAll()
      setSelectedNotifications([])
      toast({
        title: "All Notifications Cleared",
        description: "All your notifications have been cleared",
      })
    } catch (err) {
      toast({
        title: "Error", 
        description: "Failed to clear notifications",
        variant: "destructive"
      })
    }
  }

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await markAsRead(notificationId)
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to mark notification as read", 
        variant: "destructive"
      })
    }
  }

  const handleMarkAsUnread = async (notificationId: string) => {
    try {
      await markAsUnread(notificationId) 
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to mark notification as unread",
        variant: "destructive"
      })
    }
  }

  return (
    <AppLayout notificationsCount={unreadCount}>
      <FadeInSection>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Bell className="h-6 w-6 text-white" />
            <h2 className="text-2xl font-bold text-white">Notifications</h2>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {unreadCount} new
              </Badge>
            )}
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 bg-[#1f1f1f]">
              <TabsTrigger value="notifications" className="data-[state=active]:bg-[#0f0f0f] data-[state=active]:text-white">
                <BellRing className="h-4 w-4 mr-2" />
                All Notifications ({notifications.length})
              </TabsTrigger>
              <TabsTrigger value="settings" className="data-[state=active]:bg-[#0f0f0f] data-[state=active]:text-white">
                <Settings className="h-4 w-4 mr-2" />
                Preferences
              </TabsTrigger>
            </TabsList>

            {/* Notifications List Tab */}
            <TabsContent value="notifications" className="space-y-4">
              <Card className="bg-[#0f0f0f] border-none text-white">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-white flex items-center gap-2">
                        <BellRing className="h-5 w-5" />
                        Your Notifications
                      </CardTitle>
                      <CardDescription className="text-gray-400">
                        Manage and view all your security notifications
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={refresh}
                        disabled={loading}
                        className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Action Bar */}
                  <div className="flex items-center justify-between mb-4 p-4 bg-[#1a1a1a] rounded-lg">
                    <div className="flex items-center gap-4">
                      <Checkbox
                        checked={selectedNotifications.length === notifications.length && notifications.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                      <span className="text-sm text-white">
                        {selectedNotifications.length > 0 
                          ? `${selectedNotifications.length} selected` 
                          : 'Select all'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {selectedNotifications.length > 0 && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleDeleteSelected}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Selected
                        </Button>
                      )}
                      {notifications.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleClearAll}
                          className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Clear All
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Error State */}
                  {error && (
                    <Alert className="mb-4 bg-red-900/20 border-red-500/20">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-white">
                        Failed to load notifications: {error.message}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Loading State */}
                  {loading && (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-white" />
                      <span className="ml-2 text-white">Loading notifications...</span>
                    </div>
                  )}

                  {/* Notifications List */}
                  {!loading && notifications.length === 0 ? (
                    <div className="text-center py-12">
                      <BellRing className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                      <p className="text-lg font-medium text-white mb-2">No notifications yet</p>
                      <p className="text-gray-400">You'll see your security notifications here when they arrive.</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[500px] w-full">
                      <div className="space-y-3">
                        {notifications.map((notification) => (
                          <div
                            key={notification.id}
                            className={`p-4 rounded-lg border transition-colors ${
                              notification.isRead 
                                ? 'bg-[#1a1a1a] border-[#2a2a2a]' 
                                : 'bg-[#1f1f1f] border-[#3a3a3a] ring-1 ring-blue-500/20'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={selectedNotifications.includes(notification.id)}
                                onCheckedChange={() => handleSelectNotification(notification.id)}
                              />
                              <div className="flex-shrink-0 mt-0.5">
                                {getNotificationIcon(notification.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <h4 className={`text-sm font-medium ${notification.isRead ? 'text-gray-300' : 'text-white'}`}>
                                    {notification.title}
                                  </h4>
                                  <span className="text-xs text-gray-400">
                                    {formatDateTime(notification.createdAt)}
                                  </span>
                                </div>
                                <p className={`text-sm mb-2 ${notification.isRead ? 'text-gray-400' : 'text-gray-200'}`}>
                                  {notification.message}
                                </p>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs capitalize">
                                    {notification.type.replace('_', ' ')}
                                  </Badge>
                                  {!notification.isRead && (
                                    <Badge variant="destructive" className="text-xs">
                                      New
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                {notification.isRead ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleMarkAsUnread(notification.id)}
                                    className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                                  >
                                    <Mail className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleMarkAsRead(notification.id)}
                                    className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteNotification(notification.id)}
                                  className="h-8 w-8 p-0 text-gray-400 hover:text-red-400"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings">
              <Card className="bg-[#0f0f0f] border-none text-white">
                <CardHeader>
                  <CardTitle className="text-white">Notification Preferences</CardTitle>
                  <CardDescription className="text-gray-400">Manage how and when you receive notifications</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white">Email Notifications</h3>
                        <p className="text-sm text-gray-400">Receive notifications via email</p>
                      </div>
                      <Switch
                        checked={settings.emailNotifications}
                        onCheckedChange={() => toggleSetting("emailNotifications")}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white">Critical Email Alerts</h3>
                        <p className="text-sm text-gray-400">Notifications for critical security email threats</p>
                      </div>
                      <Switch checked={settings.criticalAlerts} onCheckedChange={() => toggleSetting("criticalAlerts")} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white">High Priority Alerts</h3>
                        <p className="text-sm text-gray-400">Notifications for high priority security events</p>
                      </div>
                      <Switch checked={settings.highAlerts} onCheckedChange={() => toggleSetting("highAlerts")} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white">Medium Priority Alerts</h3>
                        <p className="text-sm text-gray-400">Notifications for medium priority security events</p>
                      </div>
                      <Switch checked={settings.mediumAlerts} onCheckedChange={() => toggleSetting("mediumAlerts")} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white">Low Priority Alerts</h3>
                        <p className="text-sm text-gray-400">Notifications for low priority security events</p>
                      </div>
                      <Switch checked={settings.lowAlerts} onCheckedChange={() => toggleSetting("lowAlerts")} />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#1f1f1f] space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white">Assignment Updates</h3>
                        <p className="text-sm text-gray-400">
                          Notifications when you're assigned to an investigation
                        </p>
                      </div>
                      <Switch
                        checked={settings.assignmentUpdates}
                        onCheckedChange={() => toggleSetting("assignmentUpdates")}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white">Pushed Requests</h3>
                        <p className="text-sm text-gray-400">Notifications for admin pushed requests requiring attention</p>
                      </div>
                      <Switch checked={settings.pushedRequests} onCheckedChange={() => toggleSetting("pushedRequests")} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white">Detection Alerts</h3>
                        <p className="text-sm text-gray-400">Notifications for new threat detections</p>
                      </div>
                      <Switch checked={settings.detectionAlerts} onCheckedChange={() => toggleSetting("detectionAlerts")} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white">System Updates</h3>
                        <p className="text-sm text-gray-400">Notifications about system maintenance and updates</p>
                      </div>
                      <Switch checked={settings.systemUpdates} onCheckedChange={() => toggleSetting("systemUpdates")} />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#1f1f1f] space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white">Daily Digest</h3>
                        <p className="text-sm text-gray-400">Receive a daily summary of security events</p>
                      </div>
                      <Switch checked={settings.dailyDigest} onCheckedChange={() => toggleSetting("dailyDigest")} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white">Weekly Report</h3>
                        <p className="text-sm text-gray-400">Receive a weekly security report</p>
                      </div>
                      <Switch checked={settings.weeklyReport} onCheckedChange={() => toggleSetting("weeklyReport")} />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => router.back()} className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]">
                    Cancel
                  </Button>
                  <Button onClick={handleSaveSettings} disabled={isLoading} className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]">
                    {isLoading ? "Saving..." : "Save Changes"}
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </FadeInSection>
    </AppLayout>
  )
}
