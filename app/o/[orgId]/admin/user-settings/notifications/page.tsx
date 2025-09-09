"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"

export default function NotificationsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
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
  })


  const handleSaveSettings = () => {
    setIsLoading(true)

    // Simulate API call
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

  return (
    <AppLayout notificationsCount={3}>
      <FadeInSection>
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-6 text-white">Notification Settings</h2>

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
                    <h3 className="font-medium text-white">Critical Alerts</h3>
                    <p className="text-sm text-gray-400">Notifications for critical security events</p>
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
        </div>
      </FadeInSection>
    </AppLayout>
  )
}
