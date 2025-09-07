"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, ArrowRight, Lock, AlertTriangle } from "lucide-react"

export default function OrgAwareLoginPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const orgId = params.orgId as string
  const next = searchParams.get('next') || `/o/${orgId}/admin/dashboard`
  const error = searchParams.get('error')
  const details = searchParams.get('details')
  
  const [isLoading, setIsLoading] = useState(false)
  const [orgName, setOrgName] = useState<string>("")

  useEffect(() => {
    // Get org name from localStorage if available
    const storedOrgName = localStorage.getItem('organization_name')
    if (storedOrgName) {
      setOrgName(storedOrgName)
    }
  }, [])

  const handleSignIn = async () => {
    setIsLoading(true)
    try {
      // Redirect to the org-aware login endpoint
      const nextParam = encodeURIComponent(next)
      window.location.href = `/api/auth/login?orgId=${orgId}&next=${nextParam}`
    } catch (err) {
      setIsLoading(false)
      console.error('Login redirect failed:', err)
    }
  }

  const getErrorMessage = (error: string | null, details: string | null) => {
    switch (error) {
      case 'missing_pkce':
        return 'Authentication session expired. Please try again.'
      case 'bad_state':
        return 'Invalid authentication state. Please try again.'
      case 'no_cognito_config':
        return 'Organization authentication not configured. Please contact your administrator.'
      case 'missing_config':
        return 'Incomplete authentication configuration. Please contact your administrator.'
      case 'token':
        return `Authentication failed: ${details || 'Token exchange error'}`
      case 'missing_tokens':
        return 'Authentication response incomplete. Please try again.'
      case 'unhandled_error':
        return `Unexpected error: ${details || 'Please contact support'}`
      default:
        return error ? `Authentication error: ${error}` : null
    }
  }

  const errorMessage = getErrorMessage(error, details)

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#171717] p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-green-500/3 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <Card className="w-full max-w-md bg-[#0f0f0f] border-[#1f1f1f] shadow-2xl backdrop-blur-sm relative z-10 transition-all duration-300 hover:shadow-3xl hover:border-[#2f2f2f]">
        <CardHeader className="space-y-6 pb-8">
          <div className="flex justify-center items-center gap-3 group">
            <div className="transition-transform duration-300 group-hover:scale-110">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Lock className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          <div className="text-center space-y-2">
            <CardTitle className="text-2xl font-bold text-white">
              {orgName ? `Welcome to ${orgName}` : 'Organization Login'}
            </CardTitle>
            <CardDescription className="text-gray-400">
              Sign in with your organization credentials
            </CardDescription>
            {orgId && (
              <div className="text-xs text-gray-500 font-mono bg-[#1a1a1a] px-2 py-1 rounded">
                Org: {orgId}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {errorMessage && (
            <Alert
              variant="destructive"
              className="bg-red-500/10 border-red-500/20 animate-in slide-in-from-top-2 duration-300"
            >
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm text-red-200">{errorMessage}</AlertDescription>
            </Alert>
          )}

          <div className="text-center space-y-4">
            <p className="text-sm text-gray-400">
              Click below to sign in using your AWS Cognito credentials
            </p>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col space-y-4 pt-6">
          <Button
            onClick={handleSignIn}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed group"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Redirecting...
              </>
            ) : (
              <>
                Sign In with Cognito
                <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </>
            )}
          </Button>

          <div className="text-center space-y-2">
            <p className="text-center text-xs text-gray-500">
              Secure access to your organization dashboard
            </p>
            <button
              onClick={() => router.push('/setup-organization')}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Need to set up a new organization?
            </button>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}