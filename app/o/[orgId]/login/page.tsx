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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, ArrowRight, Lock, AlertTriangle, Eye, EyeOff, X, Mail, CheckCircle, Copy, Check } from "lucide-react"

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
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [authError, setAuthError] = useState("")
  
  // Challenge states
  const [session, setSession] = useState<string>("")
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  
  // MFA states
  const [showMFA, setShowMFA] = useState(false)
  const [mfaCode, setMfaCode] = useState("")
  const [showMFASetup, setShowMFASetup] = useState(false)
  const [setupMfaCode, setSetupMfaCode] = useState("")
  const [mfaSecretCode, setMfaSecretCode] = useState("")
  const [qrCodeUrl, setQrCodeUrl] = useState("")
  const [copiedSecret, setCopiedSecret] = useState(false)
  
  // Forgot password states
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotPasswordStep, setForgotPasswordStep] = useState(1)
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("")
  const [forgotPasswordCode, setForgotPasswordCode] = useState("")
  const [newForgotPassword, setNewForgotPassword] = useState("")
  const [confirmForgotPassword, setConfirmForgotPassword] = useState("")
  const [forgotPasswordError, setForgotPasswordError] = useState("")
  const [isForgotPasswordLoading, setIsForgotPasswordLoading] = useState(false)

  useEffect(() => {
    // Get org name from localStorage if available
    const storedOrgName = localStorage.getItem('organization_name')
    if (storedOrgName) {
      setOrgName(storedOrgName)
    }
  }, [])

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setAuthError("")
    
    if (!email || !password) {
      setAuthError("Please enter both email and password")
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch('/api/auth/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          email: email.trim(),
          password,
        })
      })

      const result = await response.json()

      if (result.success && result.tokens) {
        // Store tokens in secure cookies by calling a cookie-setting endpoint
        const cookieResponse = await fetch('/api/auth/set-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            tokens: result.tokens,
            user: result.user
          })
        })

        if (cookieResponse.ok) {
          // Redirect to dashboard or next URL
          router.push(next)
        } else {
          setAuthError("Session setup failed. Please try again.")
        }
      } else if (result.success && result.challenge) {
        // Handle authentication challenges
        setSession(result.session)
        
        if (result.challengeName === "NEW_PASSWORD_REQUIRED") {
          setShowPasswordChange(true)
        } else if (result.challengeName === "SOFTWARE_TOKEN_MFA") {
          setShowMFA(true)
        } else if (result.challengeName === "MFA_SETUP") {
          // Try to set up MFA
          try {
            const mfaResponse = await fetch('/api/auth/setup-mfa', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ access_token: result.tokens?.accessToken })
            })
            const mfaResult = await mfaResponse.json()
            if (mfaResult.success && mfaResult.secretCode) {
              setMfaSecretCode(mfaResult.secretCode)
              setShowMFASetup(true)
            } else {
              setAuthError("MFA setup failed. Please contact your administrator.")
            }
          } catch {
            setAuthError("MFA setup failed. Please contact your administrator.")
          }
        } else {
          setAuthError(`Challenge required: ${result.challengeName}`)
        }
      } else {
        setAuthError(result.message || "Authentication failed")
      }
    } catch (err: any) {
      console.error('Authentication failed:', err)
      setAuthError(err.message || "Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setAuthError("")
    
    if (!newPassword || !confirmPassword) {
      setAuthError("Please enter both password fields")
      setIsLoading(false)
      return
    }

    if (newPassword !== confirmPassword) {
      setAuthError("Passwords do not match")
      setIsLoading(false)
      return
    }

    if (newPassword.length < 8) {
      setAuthError("Password must be at least 8 characters")
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch('/api/auth/respond-to-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          username: email,
          session,
          challengeName: "NEW_PASSWORD_REQUIRED",
          challengeResponses: {
            NEW_PASSWORD: newPassword,
          }
        })
      })

      const result = await response.json()

      if (result.success && result.tokens) {
        // Password changed successfully, store tokens
        const cookieResponse = await fetch('/api/auth/set-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            tokens: result.tokens,
            user: { email, name: email.split('@')[0] } // Basic user info
          })
        })

        if (cookieResponse.ok) {
          setShowPasswordChange(false)
          router.push(next)
        } else {
          setAuthError("Session setup failed. Please try again.")
        }
      } else if (result.success && result.challenge) {
        // Another challenge required (like MFA)
        setSession(result.session)
        setShowPasswordChange(false)
        setAuthError(`Additional challenge required: ${result.challengeName}`)
      } else {
        setAuthError(result.message || "Password change failed")
      }
    } catch (err: any) {
      console.error('Password change failed:', err)
      setAuthError(err.message || "Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-register user after successful authentication
  const finalizeLogin = async (accessToken: string, idToken: string, refreshToken: string) => {
    try {
      // Auto-register user in security team
      const autoRegisterResponse = await fetch('/api/auth/auto-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          tokens: { 
            access: accessToken, 
            id: idToken, 
            refresh: refreshToken 
          },
          organizationId: orgId,
          organizationName: orgName
        })
      })
      
      if (autoRegisterResponse.ok) {
        const userData = await autoRegisterResponse.json()
        console.log("✅ User auto-registered:", userData.role)
        
        // Update organization context if received
        if (userData.organizationId) {
          localStorage.setItem('organization_id', userData.organizationId)
        }
        if (userData.organizationName) {
          localStorage.setItem('organization_name', userData.organizationName)
        }
      }
    } catch (error) {
      console.warn("⚠️ Auto-registration failed, but continuing with login:", error)
    }
    
    // Store tokens and redirect
    const cookieResponse = await fetch('/api/auth/set-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId,
        tokens: {
          accessToken,
          idToken,
          refreshToken
        },
        user: { email, name: email.split('@')[0] }
      })
    })

    if (cookieResponse.ok) {
      router.push(next)
    } else {
      setAuthError("Session setup failed. Please try again.")
    }
  }

  // MFA verification
  const handleMFASubmit = async () => {
    if (!mfaCode.match(/^\d{6}$/)) {
      setAuthError("Enter 6-digit code from app")
      return
    }

    setIsLoading(true)
    setAuthError("")
    
    try {
      const response = await fetch('/api/auth/verify-mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          username: email,
          session,
          code: mfaCode
        })
      })
      
      const result = await response.json()
      
      if (result.success && result.access_token) {
        await finalizeLogin(result.access_token, result.id_token || "", result.refresh_token || "")
      } else {
        setAuthError(result.message || "MFA verification failed")
      }
    } catch (err: any) {
      setAuthError(err.message || "MFA verification failed")
    } finally {
      setIsLoading(false)
    }
  }

  // MFA setup
  useEffect(() => {
    if (mfaSecretCode && email) {
      const issuer = "EncryptGate"
      const uri = `otpauth://totp/${issuer.toLowerCase()}:${encodeURIComponent(email)}?secret=${mfaSecretCode}&issuer=${issuer.toLowerCase()}`
      setQrCodeUrl(
        `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uri)}`
      )
    }
  }, [mfaSecretCode, email])

  const copySecret = async () => {
    if (!mfaSecretCode) return
    try {
      await navigator.clipboard.writeText(mfaSecretCode)
      setCopiedSecret(true)
      setTimeout(() => setCopiedSecret(false), 2000)
    } catch (error) {
      console.error("Failed to copy secret:", error)
    }
  }

  const handleMFASetup = async () => {
    if (!setupMfaCode.match(/^\d{6}$/)) {
      setAuthError("Enter 6-digit code from app")
      return
    }

    setIsLoading(true)
    setAuthError("")
    
    try {
      const response = await fetch('/api/auth/confirm-mfa-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          username: email,
          session,
          code: setupMfaCode,
          client_time: new Date().toISOString(),
          adjusted_time: new Date().toISOString()
        })
      })
      
      const result = await response.json()
      
      if (result.success && result.access_token) {
        await finalizeLogin(result.access_token, result.id_token || "", result.refresh_token || "")
      } else {
        setAuthError(result.message || "MFA setup failed")
      }
    } catch (err: any) {
      setAuthError(err.message || "MFA setup failed")
    } finally {
      setIsLoading(false)
    }
  }

  // Forgot password handlers
  const resetForgotPasswordDialog = () => {
    setShowForgotPassword(false)
    setForgotPasswordStep(1)
    setForgotPasswordEmail("")
    setForgotPasswordCode("")
    setNewForgotPassword("")
    setConfirmForgotPassword("")
    setForgotPasswordError("")
  }

  const handleForgotPasswordRequest = async () => {
    if (!forgotPasswordEmail) {
      setForgotPasswordError("Enter email")
      return
    }
    
    setIsForgotPasswordLoading(true)
    setForgotPasswordError("")
    
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: forgotPasswordEmail })
      })
      
      const result = await response.json()
      
      if (result.success) {
        setForgotPasswordStep(2)
      } else {
        setForgotPasswordError(result.message || "Failed to send code")
      }
    } catch (err: any) {
      setForgotPasswordError(err.message || "Failed to send code")
    } finally {
      setIsForgotPasswordLoading(false)
    }
  }

  const handleForgotPasswordVerifyCode = async () => {
    if (!forgotPasswordCode) {
      setForgotPasswordError("Enter code")
      return
    }
    
    setIsForgotPasswordLoading(true)
    setForgotPasswordError("")
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500))
      setForgotPasswordStep(3)
      setForgotPasswordError("")
    } catch (err: any) {
      setForgotPasswordError(err.message || "Code verification failed")
    } finally {
      setIsForgotPasswordLoading(false)
    }
  }

  const handleForgotPasswordConfirm = async () => {
    if (!newForgotPassword) {
      setForgotPasswordError("Enter new password")
      return
    }
    if (newForgotPassword !== confirmForgotPassword) {
      setForgotPasswordError("Passwords don't match")
      return
    }

    setIsForgotPasswordLoading(true)
    setForgotPasswordError("")
    
    try {
      const response = await fetch('/api/auth/confirm-forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: forgotPasswordEmail,
          code: forgotPasswordCode,
          password: newForgotPassword
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        resetForgotPasswordDialog()
        setAuthError("")
        alert("Password reset successfully! Please log in with your new password.")
      } else {
        setForgotPasswordError(result.message || "Reset failed")
      }
    } catch (err: any) {
      setForgotPasswordError(err.message || "Reset failed")
    } finally {
      setIsForgotPasswordLoading(false)
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
              Enter your credentials to access your organization
            </CardDescription>
            {orgId && (
              <div className="text-xs text-gray-500 font-mono bg-[#1a1a1a] px-2 py-1 rounded">
                Org: {orgId}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {(errorMessage || authError) && (
            <Alert
              variant="destructive"
              className="bg-red-500/10 border-red-500/20 animate-in slide-in-from-top-2 duration-300"
            >
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm text-red-200">
                {authError || errorMessage}
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder:text-gray-400"
                disabled={isLoading}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder:text-gray-400 pr-10"
                  disabled={isLoading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors"
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </form>
        </CardContent>

        <CardFooter className="flex flex-col space-y-4 pt-6">
          <Button
            onClick={handleSignIn}
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed group"
            disabled={isLoading || !email || !password}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing In...
              </>
            ) : (
              <>
                Sign In
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

      {/* Password Change Dialog */}
      <Dialog open={showPasswordChange} onOpenChange={setShowPasswordChange}>
        <DialogContent className="bg-[#0f0f0f] border-[#1f1f1f] text-white">
          <button
            onClick={() => setShowPasswordChange(false)}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
          <DialogHeader>
            <DialogTitle className="text-white">Password Change Required</DialogTitle>
            <DialogDescription className="text-gray-400">
              Your account requires a password change. Please create a new password.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handlePasswordChange}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label className="text-white">Account</Label>
                <div className="bg-[#1f1f1f] border border-[#2f2f2f] rounded px-3 py-2 text-gray-300">
                  {email || "Your account"}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password" className="text-white">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500/20"
                  disabled={isLoading}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-white">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500/20"
                  disabled={isLoading}
                  required
                />
              </div>
              
              {authError && (
                <Alert variant="destructive" className="bg-red-500/10 border-red-500/20">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-sm text-red-200">{authError}</AlertDescription>
                </Alert>
              )}
              
              <Alert className="bg-blue-500/10 border-blue-500/20">
                <AlertDescription className="text-blue-200 text-sm">
                  Password must be at least 8 characters and meet your organization's security requirements.
                </AlertDescription>
              </Alert>
            </div>
            
            <DialogFooter>
              <Button
                type="submit"
                disabled={isLoading || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating Password...
                  </>
                ) : (
                  "Update Password"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MFA Setup Dialog */}
      <Dialog open={showMFASetup} onOpenChange={setShowMFASetup}>
        <DialogContent className="bg-[#0f0f0f] border-[#1f1f1f] text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <button
            onClick={() => setShowMFASetup(false)}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
          <DialogHeader>
            <DialogTitle className="text-white">Setup Two-Factor Authentication</DialogTitle>
            <DialogDescription className="text-gray-400">
              For additional security, please set up Google Authenticator.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <Alert className="bg-blue-500/10 border-blue-500/20">
              <AlertDescription className="text-blue-200">
                <ol className="list-decimal list-inside space-y-1">
                  <li>Install Google Authenticator on your phone</li>
                  <li>Scan the QR code below or manually enter the secret key</li>
                  <li>Enter the 6-digit code from your authenticator app</li>
                  <li>Click "Verify & Complete" to finish setup</li>
                </ol>
              </AlertDescription>
            </Alert>
            
            {qrCodeUrl && (
              <div className="flex flex-col items-center space-y-3">
                <Label className="text-white font-medium">Scan QR Code</Label>
                <div className="bg-white p-4 rounded-lg">
                  <img src={qrCodeUrl} alt="MFA QR" className="w-48 h-48" />
                </div>
              </div>
            )}
            
            {mfaSecretCode && (
              <div className="space-y-3">
                <Label className="text-white font-medium">Manual Entry Secret Key</Label>
                <div className="relative">
                  <div className="font-mono text-sm text-gray-300 bg-[#1f1f1f] p-3 pr-12 rounded border-[#2f2f2f] border break-all">
                    {mfaSecretCode}
                  </div>
                  <button
                    onClick={copySecret}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 text-gray-400 hover:text-white transition-colors rounded hover:bg-[#2f2f2f]"
                    title="Copy secret key"
                  >
                    {copiedSecret ? (
                      <Check className="h-4 w-4 text-green-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            )}
            
            <div className="space-y-3">
              <Label htmlFor="setup-mfa-code" className="text-white font-medium">Enter Verification Code</Label>
              <Input
                id="setup-mfa-code"
                placeholder="Enter 6-digit code"
                value={setupMfaCode}
                onChange={(e) => setSetupMfaCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                maxLength={6}
                className="text-center text-2xl tracking-widest bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder-gray-500 h-12 focus:border-blue-500 focus:ring-blue-500/20"
                disabled={isLoading}
              />
            </div>
            
            {authError && (
              <Alert variant="destructive" className="bg-red-500/10 border-red-500/20">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-red-200">{authError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleMFASetup} disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify & Complete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MFA Verify Dialog */}
      <Dialog open={showMFA} onOpenChange={setShowMFA}>
        <DialogContent className="bg-[#0f0f0f] border-[#1f1f1f] text-white">
          <button
            onClick={() => setShowMFA(false)}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
          <DialogHeader>
            <DialogTitle className="text-white">Enter Authentication Code</DialogTitle>
            <DialogDescription className="text-gray-400">Enter the 6-digit code from your authenticator app</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label htmlFor="mfa-code" className="text-white">Code</Label>
            <Input
              id="mfa-code"
              placeholder="6-digit"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              maxLength={6}
              className="text-center text-2xl tracking-widest bg-[#1f1f1f] border-[#2f2f2f] text-white focus:border-blue-500 focus:ring-blue-500/20"
              disabled={isLoading}
            />
            {authError && (
              <Alert variant="destructive" className="bg-red-500/10 border-red-500/20">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-red-200">{authError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleMFASubmit} disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Forgot Password Dialog */}
      <Dialog open={showForgotPassword} onOpenChange={(open) => !open && resetForgotPasswordDialog()}>
        <DialogContent className="bg-[#0f0f0f] border-[#1f1f1f] text-white">
          <button
            onClick={resetForgotPasswordDialog}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
          <DialogHeader>
            <DialogTitle className="text-white">Reset Password</DialogTitle>
            <DialogDescription className="text-gray-400">
              {forgotPasswordStep === 1 && "Enter your email address and we'll send you a verification code."}
              {forgotPasswordStep === 2 && "Enter the verification code sent to your email."}
              {forgotPasswordStep === 3 && "Enter your new password."}
            </DialogDescription>
          </DialogHeader>

          {forgotPasswordStep === 1 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email" className="text-white text-sm font-medium">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="name@company.com"
                    value={forgotPasswordEmail}
                    onChange={(e) => setForgotPasswordEmail(e.target.value)}
                    className="pl-10 bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500/20"
                    disabled={isForgotPasswordLoading}
                  />
                </div>
              </div>

              {forgotPasswordError && (
                <Alert variant="destructive" className="bg-red-500/10 border-red-500/20">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-red-200">{forgotPasswordError}</AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleForgotPasswordRequest}
                disabled={!forgotPasswordEmail || isForgotPasswordLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium transition-all duration-200"
              >
                {isForgotPasswordLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Verification Code"
                )}
              </Button>
            </div>
          ) : forgotPasswordStep === 2 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-code" className="text-white">Verification Code</Label>
                <Input
                  id="reset-code"
                  placeholder="Enter 6-digit code"
                  value={forgotPasswordCode}
                  onChange={(e) => setForgotPasswordCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                  maxLength={6}
                  className="text-center text-2xl tracking-widest bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500/20"
                  disabled={isForgotPasswordLoading}
                />
              </div>
              
              {forgotPasswordError && (
                <Alert variant="destructive" className="bg-red-500/10 border-red-500/20">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-red-200">{forgotPasswordError}</AlertDescription>
                </Alert>
              )}
              
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setForgotPasswordStep(1)}
                  disabled={isForgotPasswordLoading}
                  className="flex-1 border-[#2f2f2f] text-white hover:bg-[#1f1f1f]"
                >
                  Back
                </Button>
                <Button
                  onClick={handleForgotPasswordVerifyCode}
                  disabled={!forgotPasswordCode || forgotPasswordCode.length !== 6 || isForgotPasswordLoading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {isForgotPasswordLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify Code"
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-forgot-password" className="text-white">New Password</Label>
                <Input
                  id="new-forgot-password"
                  type="password"
                  placeholder="Enter new password"
                  value={newForgotPassword}
                  onChange={(e) => setNewForgotPassword(e.target.value)}
                  className="bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500/20"
                  disabled={isForgotPasswordLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-forgot-password" className="text-white">Confirm New Password</Label>
                <Input
                  id="confirm-forgot-password"
                  type="password"
                  placeholder="Confirm password"
                  value={confirmForgotPassword}
                  onChange={(e) => setConfirmForgotPassword(e.target.value)}
                  className="bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500/20"
                  disabled={isForgotPasswordLoading}
                />
              </div>
              
              {forgotPasswordError && (
                <Alert variant="destructive" className="bg-red-500/10 border-red-500/20">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-red-200">{forgotPasswordError}</AlertDescription>
                </Alert>
              )}
              
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setForgotPasswordStep(2)}
                  disabled={isForgotPasswordLoading}
                  className="flex-1 border-[#2f2f2f] text-white hover:bg-[#1f1f1f]"
                >
                  Back
                </Button>
                <Button
                  onClick={handleForgotPasswordConfirm}
                  disabled={
                    !newForgotPassword ||
                    !confirmForgotPassword ||
                    newForgotPassword !== confirmForgotPassword ||
                    isForgotPasswordLoading
                  }
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {isForgotPasswordLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    "Reset Password"
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}