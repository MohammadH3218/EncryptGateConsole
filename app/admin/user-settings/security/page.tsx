"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import { Shield, AlertTriangle, Clock } from "lucide-react"

export default function SecurityPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [settings, setSettings] = useState({
    mfaEnabled: true,
    sessionTimeout: 30, // minutes
    loginNotifications: true,
    failedLoginAlerts: true,
    deviceManagement: true,
  })

 

  const handleSaveSettings = () => {
    setIsLoading(true)

    // Simulate API call
    setTimeout(() => {
      setIsLoading(false)
      toast({
        title: "Security Settings Updated",
        description: "Your security preferences have been saved.",
      })
    }, 1000)
  }

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings({
      ...settings,
      [key]: !settings[key],
    })
  }

  return (
    <AppLayout username="John Doe" notificationsCount={3}>
      <FadeInSection>
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-6">Security Settings</h2>

          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <CardTitle>Multi-Factor Authentication</CardTitle>
              </div>
              <CardDescription>Secure your account with two-factor authentication</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Enable MFA</h3>
                  <p className="text-sm text-muted-foreground">Require a verification code when signing in</p>
                </div>
                <Switch checked={settings.mfaEnabled} onCheckedChange={() => toggleSetting("mfaEnabled")} />
              </div>

              {settings.mfaEnabled && (
                <div className="mt-4 p-4 bg-muted rounded-md">
                  <h4 className="font-medium mb-2">MFA is currently enabled</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Your account is protected with an authenticator app.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      Change MFA Method
                    </Button>
                    <Button variant="destructive" size="sm">
                      Disable MFA
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-primary" />
                <CardTitle>Account Security</CardTitle>
              </div>
              <CardDescription>Manage your account security settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Session Timeout</h3>
                    <p className="text-sm text-muted-foreground">Automatically log out after period of inactivity</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={settings.sessionTimeout}
                      onChange={(e) => setSettings({ ...settings, sessionTimeout: Number.parseInt(e.target.value) })}
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
                    <h3 className="font-medium">Login Notifications</h3>
                    <p className="text-sm text-muted-foreground">Receive notifications for new sign-ins</p>
                  </div>
                  <Switch
                    checked={settings.loginNotifications}
                    onCheckedChange={() => toggleSetting("loginNotifications")}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Failed Login Alerts</h3>
                    <p className="text-sm text-muted-foreground">Get alerted about failed login attempts</p>
                  </div>
                  <Switch
                    checked={settings.failedLoginAlerts}
                    onCheckedChange={() => toggleSetting("failedLoginAlerts")}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Device Management</h3>
                    <p className="text-sm text-muted-foreground">
                      Track and manage devices used to access your account
                    </p>
                  </div>
                  <Switch
                    checked={settings.deviceManagement}
                    onCheckedChange={() => toggleSetting("deviceManagement")}
                  />
                </div>
              </div>

              {settings.deviceManagement && (
                <div className="pt-4 border-t">
                  <h3 className="font-medium mb-2">Recent Devices</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-background rounded-full">
                          <Clock className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Windows PC - Chrome</p>
                          <p className="text-xs text-muted-foreground">Last active: Today, 10:42 AM</p>
                        </div>
                      </div>
                      <div className="text-xs bg-green-500/10 text-green-500 px-2 py-1 rounded-full">Current</div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-background rounded-full">
                          <Clock className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">iPhone - Safari</p>
                          <p className="text-xs text-muted-foreground">Last active: Yesterday, 3:15 PM</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm">
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button onClick={handleSaveSettings} disabled={isLoading}>
                {isLoading ? "Saving..." : "Save Changes"}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </FadeInSection>
    </AppLayout>
  )
}
