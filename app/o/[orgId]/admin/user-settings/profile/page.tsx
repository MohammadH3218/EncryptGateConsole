"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { useRouter, useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useToast } from "@/components/ui/use-toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { KeyRound, Loader2, User2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function ProfilePage() {
  const router = useRouter()
  const params = useParams()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [isPasswordLoading, setIsPasswordLoading] = useState(false)
  const [isPageLoading, setIsPageLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("profile")
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    preferredUsername: "",
    jobTitle: "",
    department: "",
    phone: "",
    bio: "",
  })
  const [originalProfile, setOriginalProfile] = useState({})
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
  const [profileError, setProfileError] = useState("")

  // Load user profile data on mount
  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      setIsPageLoading(true)
      const response = await fetch('/api/user/profile', {
        method: 'GET',
        credentials: 'include'
      })
      
      if (!response.ok) {
        throw new Error('Failed to load profile')
      }
      
      const data = await response.json()
      if (data.ok) {
        // Extract profile data from response
        const profileData = {
          name: data.user?.name || data.name || "",
          email: data.user?.email || data.email || "",
          preferredUsername: data.user?.name || data.name || "", // Current preferred_username
          jobTitle: data.user?.jobTitle || "",
          department: data.user?.department || "",
          phone: data.user?.phone || "",
          bio: data.user?.bio || "",
        }
        
        setProfile(profileData)
        setOriginalProfile(profileData)
      } else {
        setProfileError(data.error || 'Failed to load profile')
      }
    } catch (error: any) {
      console.error('Failed to load profile:', error)
      setProfileError(error.message || 'Failed to load profile')
    } finally {
      setIsPageLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    setIsLoading(true)
    setProfileError("")

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(profile)
      })

      if (!response.ok) {
        throw new Error('Failed to update profile')
      }

      const result = await response.json()
      
      if (result.ok || result.success) {
        setOriginalProfile(profile)
        toast({
          title: "Profile Updated",
          description: "Your profile has been updated successfully.",
        })
      } else {
        setProfileError(result.error || 'Failed to update profile')
        toast({
          title: "Update Failed",
          description: result.error || 'Failed to update profile',
          variant: "destructive"
        })
      }
    } catch (error: any) {
      console.error('Profile update error:', error)
      setProfileError(error.message || 'Failed to update profile')
      toast({
        title: "Update Failed",
        description: error.message || 'Failed to update profile',
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
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

  const handleChangePassword = async () => {
    if (!validatePasswordForm()) return

    setIsPasswordLoading(true)

    try {
      const response = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword: passwords.current,
          newPassword: passwords.new
        })
      })

      const result = await response.json()

      if (result.success) {
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
        setErrors({
          current: "",
          new: "",
          confirm: "",
        })
      } else {
        // Handle specific password change errors
        if (result.message?.toLowerCase().includes('current password')) {
          setErrors(prev => ({ ...prev, current: result.message }))
        } else {
          toast({
            title: "Password Change Failed",
            description: result.message || 'Failed to change password',
            variant: "destructive"
          })
        }
      }
    } catch (error: any) {
      console.error('Password change error:', error)
      toast({
        title: "Password Change Failed", 
        description: error.message || 'Failed to change password',
        variant: "destructive"
      })
    } finally {
      setIsPasswordLoading(false)
    }
  }

  // Show loading spinner while data is loading
  if (isPageLoading) {
    return (
      <AppLayout username="" notificationsCount={3}>
        <FadeInSection>
          <div className="max-w-3xl mx-auto flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-white animate-spin mx-auto mb-4" />
              <div className="text-white text-lg">Loading profile...</div>
            </div>
          </div>
        </FadeInSection>
      </AppLayout>
    )
  }

  return (
    <AppLayout username={profile.name || profile.email} notificationsCount={3}>
      <FadeInSection>
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-6 text-white">Your Profile</h2>
          
          {profileError && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{profileError}</AlertDescription>
            </Alert>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-6 bg-[#1f1f1f] border-[#1f1f1f]">
              <TabsTrigger value="profile" className="text-white data-[state=active]:bg-[#0f0f0f] data-[state=active]:text-white">Profile Information</TabsTrigger>
              <TabsTrigger value="password" className="text-white data-[state=active]:bg-[#0f0f0f] data-[state=active]:text-white">Change Password</TabsTrigger>
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
                      <Label htmlFor="name">Display Name</Label>
                      <Input
                        id="name"
                        value={profile.name}
                        onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                        placeholder="Enter your display name"
                      />
                      <p className="text-xs text-muted-foreground">
                        This is how your name appears to other team members.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="preferredUsername">Username</Label>
                      <div className="relative">
                        <User2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          id="preferredUsername"
                          value={profile.preferredUsername}
                          onChange={(e) => setProfile({ ...profile, preferredUsername: e.target.value })}
                          placeholder="Enter your username"
                          className="pl-10"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Your username for login and display purposes.
                      </p>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
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
          </Tabs>
        </div>
      </FadeInSection>
    </AppLayout>
  )
}
