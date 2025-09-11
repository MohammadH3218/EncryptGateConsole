"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger 
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { useSecurity } from "@/hooks/useSecurity"
import { getUserFromLocalStorage } from "@/lib/cognito-user"
import { 
  Shield, 
  AlertTriangle, 
  Clock, 
  Smartphone, 
  Monitor, 
  Tablet, 
  MapPin, 
  Trash2,
  QrCode,
  KeyRound,
  Activity,
  RefreshCw,
  CheckCircle,
  XCircle,
  Globe
} from "lucide-react"

export default function SecurityPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("settings")
  const [userInfo, setUserInfo] = useState({ email: "" })
  
  // MFA dialog states
  const [mfaSetupOpen, setMfaSetupOpen] = useState(false)
  const [mfaStep, setMfaStep] = useState<'setup' | 'verify'>('setup')
  const [qrCodeURL, setQrCodeURL] = useState("")
  const [mfaSecret, setMfaSecret] = useState("")
  const [verificationCode, setVerificationCode] = useState("")

  const {
    settings,
    devices,
    activities,
    loading,
    error,
    refresh,
    updateSettings,
    removeDevice,
    setupMFA,
    verifyMFA,
    disableMFA,
    logActivity,
  } = useSecurity()

  // Load user data from Cognito token on component mount
  useEffect(() => {
    const userData = getUserFromLocalStorage()
    if (userData) {
      setUserInfo({
        email: userData.email || ''
      })
    }
  }, [])

  const handleSaveSettings = async () => {
    if (!settings) return
    
    setIsLoading(true)
    try {
      await updateSettings(settings)
      await logActivity({
        type: 'settings_changed',
        description: 'Security settings updated',
        severity: 'low'
      })
      toast({
        title: "Security Settings Updated",
        description: "Your security preferences have been saved.",
      })
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to update settings",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const toggleSetting = async (key: keyof typeof settings) => {
    if (!settings) return
    
    const updatedSettings = {
      ...settings,
      [key]: !settings[key],
    }
    
    try {
      await updateSettings({ [key]: updatedSettings[key] })
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to update setting",
        variant: "destructive"
      })
    }
  }

  const handleSessionTimeoutChange = async (newTimeout: number) => {
    if (!settings) return
    
    try {
      await updateSettings({ sessionTimeout: newTimeout })
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to update session timeout",
        variant: "destructive"
      })
    }
  }

  const handleMFASetup = async () => {
    try {
      const result = await setupMFA(userInfo.email)
      setQrCodeURL(result.qrCodeURL)
      setMfaSecret(result.secret)
      setMfaStep('verify')
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to setup MFA",
        variant: "destructive"
      })
    }
  }

  const handleMFAVerification = async () => {
    try {
      await verifyMFA(verificationCode)
      setMfaSetupOpen(false)
      setMfaStep('setup')
      setVerificationCode('')
      toast({
        title: "MFA Enabled",
        description: "Multi-factor authentication has been successfully enabled.",
      })
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to verify MFA",
        variant: "destructive"
      })
    }
  }

  const handleMFADisable = async () => {
    try {
      await disableMFA()
      toast({
        title: "MFA Disabled",
        description: "Multi-factor authentication has been disabled.",
      })
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to disable MFA",
        variant: "destructive"
      })
    }
  }

  const handleRemoveDevice = async (sessionId: string) => {
    try {
      await removeDevice(sessionId)
      toast({
        title: "Device Removed",
        description: "The device has been removed from your account.",
      })
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to remove device",
        variant: "destructive"
      })
    }
  }

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case 'mobile':
        return <Smartphone className="h-4 w-4" />
      case 'tablet':
        return <Tablet className="h-4 w-4" />
      default:
        return <Monitor className="h-4 w-4" />
    }
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'login_success':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'login_failed':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'password_change':
        return <KeyRound className="h-4 w-4 text-blue-500" />
      case 'mfa_enabled':
      case 'mfa_disabled':
        return <Shield className="h-4 w-4 text-orange-500" />
      case 'device_added':
      case 'device_removed':
        return <Monitor className="h-4 w-4 text-purple-500" />
      default:
        return <Activity className="h-4 w-4 text-gray-500" />
    }
  }

  const formatDateTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString()
  }

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date()
    const time = new Date(timestamp)
    const diffMs = now.getTime() - time.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  if (loading) {
    return (
      <AppLayout notificationsCount={0}>
        <FadeInSection>
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <RefreshCw className="animate-spin mx-auto h-8 w-8 mb-4 text-white" />
              <p className="text-white">Loading security settings...</p>
            </div>
          </div>
        </FadeInSection>
      </AppLayout>
    )
  }

  return (
    <AppLayout notificationsCount={0}>
      <FadeInSection>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="h-6 w-6 text-white" />
            <h2 className="text-2xl font-bold text-white">Security Settings</h2>
          </div>

          {error && (
            <Alert className="mb-6 bg-red-900/20 border-red-500/20">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-white">
                Failed to load security settings: {error.message}
              </AlertDescription>
            </Alert>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6 bg-[#1f1f1f]">
              <TabsTrigger value="settings" className="data-[state=active]:bg-[#0f0f0f] data-[state=active]:text-white">
                <Shield className="h-4 w-4 mr-2" />
                Security Settings
              </TabsTrigger>
              <TabsTrigger value="devices" className="data-[state=active]:bg-[#0f0f0f] data-[state=active]:text-white">
                <Monitor className="h-4 w-4 mr-2" />
                Device Management
              </TabsTrigger>
              <TabsTrigger value="activity" className="data-[state=active]:bg-[#0f0f0f] data-[state=active]:text-white">
                <Activity className="h-4 w-4 mr-2" />
                Security Activity
              </TabsTrigger>
            </TabsList>

            {/* Security Settings Tab */}
            <TabsContent value="settings" className="space-y-6">
              {/* MFA Card */}
              <Card className="bg-[#0f0f0f] border-none text-white">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-blue-400" />
                    <CardTitle className="text-white">Multi-Factor Authentication</CardTitle>
                  </div>
                  <CardDescription className="text-gray-400">
                    Secure your account with two-factor authentication
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-white">Enable MFA</h3>
                      <p className="text-sm text-gray-400">Require a verification code when signing in</p>
                    </div>
                    <Switch 
                      checked={settings?.mfaEnabled || false} 
                      onCheckedChange={() => settings?.mfaEnabled ? handleMFADisable() : setMfaSetupOpen(true)} 
                    />
                  </div>

                  {settings?.mfaEnabled && (
                    <div className="mt-4 p-4 bg-[#1f1f1f] rounded-md">
                      <h4 className="font-medium mb-2 text-white flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        MFA is currently enabled
                      </h4>
                      <p className="text-sm text-gray-400 mb-4">
                        Your account is protected with an authenticator app.
                      </p>
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={handleMFADisable}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Disable MFA
                      </Button>
                    </div>
                  )}

                  {!settings?.mfaEnabled && (
                    <div className="mt-4 p-4 bg-orange-900/20 border border-orange-500/20 rounded-md">
                      <h4 className="font-medium mb-2 text-white flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                        MFA is not enabled
                      </h4>
                      <p className="text-sm text-gray-400 mb-4">
                        Enable MFA to add an extra layer of security to your account.
                      </p>
                      <Button 
                        onClick={() => setMfaSetupOpen(true)}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <QrCode className="h-4 w-4 mr-2" />
                        Setup MFA
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Account Security Card */}
              <Card className="bg-[#0f0f0f] border-none text-white">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-400" />
                    <CardTitle className="text-white">Account Security</CardTitle>
                  </div>
                  <CardDescription className="text-gray-400">
                    Manage your account security settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white">Session Timeout</h3>
                        <p className="text-sm text-gray-400">Automatically log out after period of inactivity</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          className="h-9 rounded-md border border-[#2a2a2a] bg-[#1f1f1f] text-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          value={settings?.sessionTimeout || 30}
                          onChange={(e) => handleSessionTimeoutChange(Number.parseInt(e.target.value))}
                        >
                          <option value="15">15 minutes</option>
                          <option value="30">30 minutes</option>
                          <option value="60">1 hour</option>
                          <option value="120">2 hours</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white">Login Notifications</h3>
                        <p className="text-sm text-gray-400">Receive notifications for new sign-ins</p>
                      </div>
                      <Switch
                        checked={settings?.loginNotifications ?? true}
                        onCheckedChange={() => toggleSetting("loginNotifications")}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white">Failed Login Alerts</h3>
                        <p className="text-sm text-gray-400">Get alerted about failed login attempts</p>
                      </div>
                      <Switch
                        checked={settings?.failedLoginAlerts ?? true}
                        onCheckedChange={() => toggleSetting("failedLoginAlerts")}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white">Device Management</h3>
                        <p className="text-sm text-gray-400">
                          Track and manage devices used to access your account
                        </p>
                      </div>
                      <Switch
                        checked={settings?.deviceManagement ?? true}
                        onCheckedChange={() => toggleSetting("deviceManagement")}
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => router.back()} 
                    className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSaveSettings} 
                    disabled={isLoading || !settings} 
                    className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
                  >
                    {isLoading ? "Saving..." : "Save Changes"}
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            {/* Device Management Tab */}
            <TabsContent value="devices">
              <Card className="bg-[#0f0f0f] border-none text-white">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Monitor className="h-5 w-5" />
                        Active Devices
                      </CardTitle>
                      <CardDescription className="text-gray-400">
                        Manage devices that have access to your account
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={refresh}
                      className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {devices.length === 0 ? (
                    <div className="text-center py-12">
                      <Monitor className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                      <p className="text-lg font-medium text-white mb-2">No active devices</p>
                      <p className="text-gray-400">Active device sessions will appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {devices.map((device) => (
                        <div key={device.sessionId} className="flex items-center justify-between p-4 bg-[#1f1f1f] rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-[#0f0f0f] rounded-full">
                              {getDeviceIcon(device.deviceInfo.deviceType)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">
                                {device.deviceInfo.os} - {device.deviceInfo.browser}
                              </p>
                              <div className="flex items-center gap-4 text-xs text-gray-400">
                                <span>Last active: {formatTimeAgo(device.lastActivity)}</span>
                                {device.location && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {device.location.city}, {device.location.country}
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <Globe className="h-3 w-3" />
                                  {device.ipAddress}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {device.isCurrent ? (
                              <Badge className="bg-green-500/10 text-green-400 border-green-500/20">
                                Current Session
                              </Badge>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveDevice(device.sessionId)}
                                className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Security Activity Tab */}
            <TabsContent value="activity">
              <Card className="bg-[#0f0f0f] border-none text-white">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Security Activity Log
                      </CardTitle>
                      <CardDescription className="text-gray-400">
                        Track security-related activities on your account
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={refresh}
                      className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {activities.length === 0 ? (
                    <div className="text-center py-12">
                      <Activity className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                      <p className="text-lg font-medium text-white mb-2">No security activity</p>
                      <p className="text-gray-400">Security activities will appear here as they occur.</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[400px] w-full">
                      <div className="space-y-3">
                        {activities.map((activity) => (
                          <div key={activity.activityId} className="flex items-start gap-3 p-3 bg-[#1f1f1f] rounded-lg">
                            <div className="flex-shrink-0 mt-0.5">
                              {getActivityIcon(activity.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <h4 className="text-sm font-medium text-white">
                                  {activity.description}
                                </h4>
                                <span className="text-xs text-gray-400">
                                  {formatTimeAgo(activity.timestamp)}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-gray-400">
                                {activity.deviceInfo && (
                                  <span>{activity.deviceInfo.os} - {activity.deviceInfo.browser}</span>
                                )}
                                {activity.location && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {activity.location.city}, {activity.location.country}
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <Globe className="h-3 w-3" />
                                  {activity.ipAddress}
                                </span>
                              </div>
                              <div className="mt-2">
                                <Badge 
                                  variant="outline" 
                                  className={`text-xs ${
                                    activity.severity === 'critical' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                    activity.severity === 'high' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                                    activity.severity === 'medium' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                                    'bg-green-500/10 text-green-400 border-green-500/20'
                                  }`}
                                >
                                  {activity.severity.toUpperCase()}
                                </Badge>
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
          </Tabs>

          {/* MFA Setup Dialog */}
          <Dialog open={mfaSetupOpen} onOpenChange={setMfaSetupOpen}>
            <DialogContent className="bg-[#0f0f0f] border-[#1f1f1f] text-white max-w-md">
              <DialogHeader>
                <DialogTitle className="text-white">
                  {mfaStep === 'setup' ? 'Setup Multi-Factor Authentication' : 'Verify Your Authenticator'}
                </DialogTitle>
                <DialogDescription className="text-gray-400">
                  {mfaStep === 'setup' 
                    ? 'We\'ll generate a QR code for you to scan with your authenticator app.'
                    : 'Enter the 6-digit code from your authenticator app to complete setup.'
                  }
                </DialogDescription>
              </DialogHeader>
              
              {mfaStep === 'setup' ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-300">
                    Use an authenticator app like Google Authenticator, Authy, or 1Password to scan the QR code.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {qrCodeURL && (
                    <div className="text-center">
                      <img 
                        src={qrCodeURL} 
                        alt="MFA QR Code" 
                        className="mx-auto border border-[#1f1f1f] rounded-lg"
                      />
                      <p className="text-xs text-gray-400 mt-2">
                        Scan this QR code with your authenticator app
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="text-white">Verification Code</Label>
                    <Input
                      placeholder="Enter 6-digit code"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      maxLength={6}
                      className="bg-[#1f1f1f] border-[#1f1f1f] text-white"
                    />
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setMfaSetupOpen(false)
                    setMfaStep('setup')
                    setVerificationCode('')
                  }}
                  className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a]"
                >
                  Cancel
                </Button>
                {mfaStep === 'setup' ? (
                  <Button 
                    onClick={handleMFASetup}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Generate QR Code
                  </Button>
                ) : (
                  <Button 
                    onClick={handleMFAVerification}
                    disabled={verificationCode.length !== 6}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Verify & Enable MFA
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </FadeInSection>
    </AppLayout>
  )
}
