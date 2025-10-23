"use client"

import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowRight, Lock, Building, Shield, Users, Mail } from "lucide-react"

export default function LandingPage() {
  const router = useRouter()

  const handleGetStarted = () => {
    router.push("/setup-organization")
  }

  const handleExistingLogin = () => {
    router.push("/orgs/select")
  }

  // Landing page always renders - no loading state needed

  return (
    <div className="min-h-screen flex items-center justify-center bg-app p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-green-500/3 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="w-full max-w-4xl relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Left side - Hero content */}
          <div className="text-app-textPrimary space-y-8">
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
                <p className="text-app-textSecondary text-sm">Email Security Platform</p>
              </div>
            </div>

            <div className="space-y-6">
              <h2 className="text-3xl font-bold">Secure Your Organization's Email</h2>
              <p className="text-xl text-app-textSecondary leading-relaxed">
                Protect your team with advanced email security monitoring, threat detection,
                and comprehensive security analytics.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <Mail className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-app-textSecondary">Email Monitoring</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <Shield className="w-4 h-4 text-purple-400" />
                  </div>
                  <span className="text-app-textSecondary">Threat Detection</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
                    <Users className="w-4 h-4 text-green-400" />
                  </div>
                  <span className="text-app-textSecondary">Team Management</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center">
                    <Lock className="w-4 h-4 text-orange-400" />
                  </div>
                  <span className="text-app-textSecondary">Security Analytics</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right side - Get Started */}
          <Card className="w-full bg-app-surface border-app-border shadow-2xl backdrop-blur-sm transition-all duration-300 hover:shadow-3xl hover:border-app-border/80">
            <CardHeader className="space-y-4 pb-6">
              <div className="text-center">
                <CardTitle className="text-2xl font-bold text-app-textPrimary">Ready to Get Started?</CardTitle>
                <CardDescription className="text-app-textSecondary">
                  Set up EncryptGate for your organization in just a few steps
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto">
                  <Building className="w-10 h-10 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-app-textPrimary mb-2">Quick Setup Process</h3>
                  <ul className="text-sm text-app-textSecondary space-y-1">
                    <li>• Enter your organization details</li>
                    <li>• Connect your AWS services</li>
                    <li>• Select your admin user</li>
                    <li>• Start securing your emails</li>
                  </ul>
                </div>
              </div>

              <div className="text-center text-xs text-app-textMuted bg-app-elevated p-3 rounded-lg">
                Setup takes less than 5 minutes. You'll need your AWS credentials ready.
              </div>
            </CardContent>

            <CardFooter className="flex flex-col space-y-4 pt-6">
              <Button
                onClick={handleGetStarted}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/25 group"
              >
                Get Started
                <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Button>

              <div className="relative w-full">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-app-border"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-app-surface px-3 text-app-textSecondary">or</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleExistingLogin}
                className="w-full bg-transparent border-app-border text-app-textPrimary hover:bg-app-elevated hover:border-app-border/80"
              >
                Sign In to Existing Organization
              </Button>

              <p className="text-center text-xs text-app-textMuted">
                By continuing, you agree to our Terms of Service and Privacy Policy
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}
