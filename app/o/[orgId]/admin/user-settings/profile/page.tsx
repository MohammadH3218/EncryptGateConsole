"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useToast } from "@/components/ui/use-toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { KeyRound, Bell, Settings } from "lucide-react"
import { getUserFromLocalStorage } from "@/lib/cognito-user"

export default function ProfilePage() {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [isPasswordLoading, setIsPasswordLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("profile")

  // Load user data from Cognito token on component mount
  useEffect(() => {
    const userData = getUserFromLocalStorage()
    if (userData) {
      setProfile(prev => ({
        ...prev,
        name: userData.preferred_username || userData.name || userData.given_name || userData.email?.split('@')[0] || '',
        email: userData.email || ''
      }))
    }
    setUserLoaded(true)
  }, [])
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    jobTitle: "",
    department: "",
    phone: "",
    bio: "",
  })
  const [userLoaded, setUserLoaded] = useState(false)
  const [passwords, setPasswords] = useState({
    current: "",
    new: "",
    confirm: "",
  })
  const [errors, setErrors] = useState({
    current: "",
    new: "",
    confirm: "",
  })

  // Notification preferences state
  const [notificationPrefs, setNotificationPrefs] = useState({
    emailNotifications: true,
    criticalAlerts: true,
    highAlerts: true,
    mediumAlerts: true,
    lowAlerts: false,
    assignmentUpdates: true,
    pushedRequests: true,
    detectionAlerts: true,
    systemUpdates: false,
    dailyDigest: true,
    weeklyReport: true,
    browserNotifications: true,
    soundAlerts: false,
    desktopNotifications: true,
    mobileNotifications: true,
  })


  const handleSaveProfile = () => {
    setIsLoading(true)

    // Simulate API call
    setTimeout(() => {
      setIsLoading(false)
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully.",
      })
    }, 1000)
  }

  const validatePasswordForm = () => {
    let valid = true
    const newErrors = {
      current: "",
      new: "",
      confirm: "",
    }

    if (!passwords.current) {
      newErrors.current = "Current password is required"
      valid = false
    }

    if (!passwords.new) {
      newErrors.new = "New password is required"
      valid = false
    } else if (passwords.new.length < 8) {
      newErrors.new = "Password must be at least 8 characters"
      valid = false
    }

    if (!passwords.confirm) {
      newErrors.confirm = "Please confirm your new password"
      valid = false
    } else if (passwords.new !== passwords.confirm) {
      newErrors.confirm = "Passwords do not match"
      valid = false
    }

    setErrors(newErrors)
    return valid
  }

  const handleChangePassword = () => {
    if (!validatePasswordForm()) return

    setIsPasswordLoading(true)

    // Simulate API call
    setTimeout(() => {
      setIsPasswordLoading(false)
      toast({
        title: "Password Changed",
        description: "Your password has been updated successfully.",
      })

      // Reset form
      setPasswords({
        current: "",
        new: "",
        confirm: "",
      })
    }, 1500)
  }

  const toggleNotificationPref = (key: keyof typeof notificationPrefs) => {
    setNotificationPrefs({
      ...notificationPrefs,
      [key]: !notificationPrefs[key],
    })
  }

  const handleSaveNotificationPrefs = () => {
    setIsLoading(true)

    // Simulate API call - in real app this would save to backend
    setTimeout(() => {
      setIsLoading(false)
      toast({
        title: "Notification Preferences Updated",
        description: "Your notification preferences have been saved successfully.",
      })
    }, 1000)
  }

  return (
    <AppLayout notificationsCount={3}>
      <FadeInSection>
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-6 text-white">Your Profile</h2>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-6 bg-[#1f1f1f] border-[#1f1f1f] grid w-full grid-cols-3">
              <TabsTrigger value="profile" className="text-white data-[state=active]:bg-[#0f0f0f] data-[state=active]:text-white">Profile Information</TabsTrigger>
              <TabsTrigger value="password" className="text-white data-[state=active]:bg-[#0f0f0f] data-[state=active]:text-white">Change Password</TabsTrigger>
              <TabsTrigger value="notifications" className="text-white data-[state=active]:bg-[#0f0f0f] data-[state=active]:text-white">
                <Bell className="h-4 w-4 mr-2" />
                Notifications
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <Card className="bg-[#0f0f0f] border-none text-white">
                <CardHeader>
                  <CardTitle className="text-white">Personal Information</CardTitle>
                  <CardDescription className="text-gray-400">Update your personal information and profile settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
                    <Avatar className="w-24 h-24">
                      <AvatarImage src="/placeholder.svg?height=96&width=96" alt={profile.name} />
                      <AvatarFallback>{profile.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <Button variant="outline" size="sm" className="mb-2">
                        Change Avatar
                      </Button>
                      <p className="text-sm text-muted-foreground">JPG, GIF or PNG. Max size 2MB.</p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name</Label>
                      <Input
                        id="name"
                        value={profile.name}
                        onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={profile.email}
                        onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                        disabled
                      />
                      <p className="text-xs text-muted-foreground">
                        Contact your administrator to change your email address.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="jobTitle">Job Title</Label>
                      <Input
                        id="jobTitle"
                        value={profile.jobTitle}
                        onChange={(e) => setProfile({ ...profile, jobTitle: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="department">Department</Label>
                      <Input
                        id="department"
                        value={profile.department}
                        onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        value={profile.phone}
                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="bio">Bio</Label>
                      <textarea
                        id="bio"
                        className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={profile.bio}
                        onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => router.back()}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveProfile} disabled={isLoading}>
                    {isLoading ? "Saving..." : "Save Changes"}
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="password">
              <Card className="bg-[#0f0f0f] border-none text-white">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-5 w-5 text-blue-400" />
                    <CardTitle className="text-white">Update Your Password</CardTitle>
                  </div>
                  <CardDescription className="text-gray-400">
                    Choose a strong, unique password that you don't use for other accounts
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="current-password">Current Password</Label>
                    <Input
                      id="current-password"
                      type="password"
                      value={passwords.current}
                      onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                    />
                    {errors.current && <p className="text-sm text-destructive">{errors.current}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={passwords.new}
                      onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                    />
                    {errors.new && <p className="text-sm text-destructive">{errors.new}</p>}
                    <p className="text-xs text-muted-foreground">
                      Password must be at least 8 characters and include a mix of letters, numbers, and symbols.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm New Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={passwords.confirm}
                      onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                    />
                    {errors.confirm && <p className="text-sm text-destructive">{errors.confirm}</p>}
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setActiveTab("profile")}>
                    Cancel
                  </Button>
                  <Button onClick={handleChangePassword} disabled={isPasswordLoading}>
                    {isPasswordLoading ? "Updating..." : "Change Password"}
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="notifications">
              <Card className="bg-[#0f0f0f] border-none text-white">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Bell className="h-5 w-5 text-blue-400" />
                    <CardTitle className="text-white">Notification Preferences</CardTitle>
                  </div>
                  <CardDescription className="text-gray-400">
                    Customize how you receive notifications and alerts from the security platform
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  {/* Security Alerts Section */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Settings className="h-4 w-4 text-orange-400" />
                      <h3 className="font-semibold text-white">Security Alerts</h3>
                      <Badge variant="outline" className="text-xs">Most Important</Badge>
                    </div>
                    <div className="space-y-4 ml-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-white">Critical Email Threats</h4>
                          <p className="text-sm text-gray-400">High-priority security threats detected in emails</p>
                        </div>
                        <Switch
                          checked={notificationPrefs.criticalAlerts}
                          onCheckedChange={() => toggleNotificationPref("criticalAlerts")}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-white">High Priority Alerts</h4>
                          <p className="text-sm text-gray-400">Important security events that need attention</p>
                        </div>
                        <Switch
                          checked={notificationPrefs.highAlerts}
                          onCheckedChange={() => toggleNotificationPref("highAlerts")}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-white">Medium Priority Alerts</h4>
                          <p className="text-sm text-gray-400">Moderate security events</p>
                        </div>
                        <Switch
                          checked={notificationPrefs.mediumAlerts}
                          onCheckedChange={() => toggleNotificationPref("mediumAlerts")}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-white">Low Priority Alerts</h4>
                          <p className="text-sm text-gray-400">Minor security events and informational alerts</p>
                        </div>
                        <Switch
                          checked={notificationPrefs.lowAlerts}
                          onCheckedChange={() => toggleNotificationPref("lowAlerts")}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-white">Detection Alerts</h4>
                          <p className="text-sm text-gray-400">New threat detections and malware findings</p>
                        </div>
                        <Switch
                          checked={notificationPrefs.detectionAlerts}
                          onCheckedChange={() => toggleNotificationPref("detectionAlerts")}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Work & Assignments Section */}
                  <div className="pt-4 border-t border-[#1f1f1f]">
                    <div className="flex items-center gap-2 mb-4">
                      <Settings className="h-4 w-4 text-green-400" />
                      <h3 className="font-semibold text-white">Work & Assignments</h3>
                    </div>
                    <div className="space-y-4 ml-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-white">Assignment Updates</h4>
                          <p className="text-sm text-gray-400">When you're assigned to investigate threats</p>
                        </div>
                        <Switch
                          checked={notificationPrefs.assignmentUpdates}
                          onCheckedChange={() => toggleNotificationPref("assignmentUpdates")}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-white">Pushed Requests</h4>
                          <p className="text-sm text-gray-400">Admin pushed requests requiring your attention</p>
                        </div>
                        <Switch
                          checked={notificationPrefs.pushedRequests}
                          onCheckedChange={() => toggleNotificationPref("pushedRequests")}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Delivery Methods Section */}
                  <div className="pt-4 border-t border-[#1f1f1f]">
                    <div className="flex items-center gap-2 mb-4">
                      <Settings className="h-4 w-4 text-blue-400" />
                      <h3 className="font-semibold text-white">Delivery Methods</h3>
                    </div>
                    <div className="space-y-4 ml-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-white">Email Notifications</h4>
                          <p className="text-sm text-gray-400">Receive notifications via email</p>
                        </div>
                        <Switch
                          checked={notificationPrefs.emailNotifications}
                          onCheckedChange={() => toggleNotificationPref("emailNotifications")}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-white">Browser Notifications</h4>
                          <p className="text-sm text-gray-400">Pop-up notifications in your browser</p>
                        </div>
                        <Switch
                          checked={notificationPrefs.browserNotifications}
                          onCheckedChange={() => toggleNotificationPref("browserNotifications")}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-white">Desktop Notifications</h4>
                          <p className="text-sm text-gray-400">System notifications on your computer</p>
                        </div>
                        <Switch
                          checked={notificationPrefs.desktopNotifications}
                          onCheckedChange={() => toggleNotificationPref("desktopNotifications")}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-white">Sound Alerts</h4>
                          <p className="text-sm text-gray-400">Audio notifications for critical alerts</p>
                        </div>
                        <Switch
                          checked={notificationPrefs.soundAlerts}
                          onCheckedChange={() => toggleNotificationPref("soundAlerts")}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Reports & Summaries Section */}
                  <div className="pt-4 border-t border-[#1f1f1f]">
                    <div className="flex items-center gap-2 mb-4">
                      <Settings className="h-4 w-4 text-purple-400" />
                      <h3 className="font-semibold text-white">Reports & Summaries</h3>
                    </div>
                    <div className="space-y-4 ml-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-white">Daily Digest</h4>
                          <p className="text-sm text-gray-400">Daily summary of security events and activities</p>
                        </div>
                        <Switch
                          checked={notificationPrefs.dailyDigest}
                          onCheckedChange={() => toggleNotificationPref("dailyDigest")}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-white">Weekly Report</h4>
                          <p className="text-sm text-gray-400">Comprehensive weekly security report</p>
                        </div>
                        <Switch
                          checked={notificationPrefs.weeklyReport}
                          onCheckedChange={() => toggleNotificationPref("weeklyReport")}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-white">System Updates</h4>
                          <p className="text-sm text-gray-400">Platform maintenance and feature updates</p>
                        </div>
                        <Switch
                          checked={notificationPrefs.systemUpdates}
                          onCheckedChange={() => toggleNotificationPref("systemUpdates")}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setActiveTab("profile")}
                    className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSaveNotificationPrefs} 
                    disabled={isLoading}
                    className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
                  >
                    {isLoading ? "Saving..." : "Save Preferences"}
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
