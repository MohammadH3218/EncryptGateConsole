"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, ArrowRight, Lock, Building, Shield, Users, Mail } from "lucide-react"
import { checkAuth } from "@/lib/auth"

export default function LandingPage() {
  const router = useRouter()
  const [organizationName, setOrganizationName] = useState("")
  const [adminEmail, setAdminEmail] = useState("")
  const [adminName, setAdminName] = useState("")
  const [error, setError] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    // Check if user is already authenticated
    const timeout = setTimeout(() => {
      if (checkAuth()) {
        const userType = localStorage.getItem("userType")
        if (userType === "admin") {
          router.push("/admin/dashboard")
        } else if (userType === "employee") {
          router.push("/employee/dashboard")
        }
      } else {
        setCheckingAuth(false)
      }
    }, 300)

    return () => clearTimeout(timeout)
  }, [router])

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!organizationName.trim() || !adminEmail.trim() || !adminName.trim()) {
      setError("All fields are required")
      return
    }

    setIsCreating(true)
    setError("")

    try {
      // Store pending org data and redirect to setup flow
      localStorage.setItem("pending_org_creation", JSON.stringify({
        organizationName: organizationName.trim(),
        adminEmail: adminEmail.trim(),
        adminName: adminName.trim()
      }))
      
      router.push("/setup-organization")
    } catch (err: any) {
      setError(err.message || "Failed to create organization")
    } finally {
      setIsCreating(false)
    }
  }

  const handleExistingLogin = () => {
    router.push("/login")
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#171717] p-4 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-green-500/3 rounded-full blur-3xl animate-pulse delay-500"></div>
        </div>
        
        <div className="relative z-10 text-center space-y-4">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto animate-pulse">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
          <div className="text-white text-lg font-medium">Loading...</div>
          <div className="text-gray-400 text-sm">Checking authentication</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#171717] p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-green-500/3 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="w-full max-w-4xl relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Left side - Hero content */}
          <div className="text-white space-y-8">
            <div className="flex items-center gap-3 group">
              <div className="transition-transform duration-300 group-hover:scale-110">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <Shield className="w-8 h-8 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
                  EncryptGate
                </h1>
                <p className="text-gray-400 text-sm">Email Security Platform</p>
              </div>
            </div>

            <div className="space-y-6">
              <h2 className="text-3xl font-bold">Secure Your Organization's Email</h2>
              <p className="text-xl text-gray-300 leading-relaxed">
                Protect your team with advanced email security monitoring, threat detection, 
                and comprehensive security analytics.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <Mail className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-gray-300">Email Monitoring</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <Shield className="w-4 h-4 text-purple-400" />
                  </div>
                  <span className="text-gray-300">Threat Detection</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
                    <Users className="w-4 h-4 text-green-400" />
                  </div>
                  <span className="text-gray-300">Team Management</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center">
                    <Lock className="w-4 h-4 text-orange-400" />
                  </div>
                  <span className="text-gray-300">Security Analytics</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right side - Sign up form */}
          <Card className="w-full bg-[#0f0f0f] border-[#1f1f1f] shadow-2xl backdrop-blur-sm transition-all duration-300 hover:shadow-3xl hover:border-[#2f2f2f]">
            <CardHeader className="space-y-4 pb-6">
              <div className="text-center">
                <CardTitle className="text-2xl font-bold text-white">Create Your Organization</CardTitle>
                <CardDescription className="text-gray-400">
                  Get started with EncryptGate for your team
                </CardDescription>
              </div>
            </CardHeader>

            <form onSubmit={handleCreateOrganization}>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="organization-name" className="text-white text-sm font-medium">
                      Organization Name
                    </Label>
                    <div className="relative">
                      <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="organization-name"
                        type="text"
                        placeholder="Acme Corporation"
                        value={organizationName}
                        onChange={(e) => setOrganizationName(e.target.value)}
                        className="pl-10 bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="admin-name" className="text-white text-sm font-medium">
                      Your Name
                    </Label>
                    <div className="relative">
                      <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="admin-name"
                        type="text"
                        placeholder="John Doe"
                        value={adminName}
                        onChange={(e) => setAdminName(e.target.value)}
                        className="pl-10 bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="admin-email" className="text-white text-sm font-medium">
                      Admin Email Address
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="admin-email"
                        type="email"
                        placeholder="admin@company.com"
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        className="pl-10 bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>
                </div>

                {error && (
                  <Alert
                    variant="destructive"
                    className="bg-red-500/10 border-red-500/20 animate-in slide-in-from-top-2 duration-300"
                  >
                    <AlertDescription className="text-sm text-red-200">{error}</AlertDescription>
                  </Alert>
                )}

                <div className="text-center text-xs text-gray-500 bg-[#1a1a1a] p-3 rounded-lg">
                  You'll be set up as the organization owner with full administrative access.
                </div>
              </CardContent>

              <CardFooter className="flex flex-col space-y-4 pt-6">
                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed group"
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Organization...
                    </>
                  ) : (
                    <>
                      Create Organization
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </>
                  )}
                </Button>

                <div className="relative w-full">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[#2f2f2f]"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-[#0f0f0f] px-3 text-gray-400">or</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleExistingLogin}
                  className="w-full bg-transparent border-[#2f2f2f] text-white hover:bg-[#1f1f1f] hover:border-[#3f3f3f]"
                >
                  Sign In to Existing Organization
                </Button>

                <p className="text-center text-xs text-gray-500">
                  By creating an organization, you agree to our Terms of Service and Privacy Policy
                </p>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    </div>
  )
}