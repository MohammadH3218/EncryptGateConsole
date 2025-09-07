"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
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
import { fetchWithRetry, getAdjustedTime } from "@/utils/auth"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, ArrowRight, Lock, Mail, CheckCircle, X, Copy, Check } from "lucide-react"

interface LoginResponse {
  access_token?: string
  id_token?: string
  refresh_token?: string
  mfa_required?: boolean
  ChallengeName?: string
  session?: string
  secretCode?: string
  message?: string
  status?: string
  current_code?: string
  time_windows?: { code: string }[]
  validCodes?: string[]
  serverGeneratedCode?: string
  currentValidCode?: string
  timeInfo?: any
  detail?: string
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  // MFA states
  const [showMFA, setShowMFA] = useState(false)
  const [mfaCode, setMfaCode] = useState("")

  // Password change states
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [displayName, setDisplayName] = useState("")

  // MFA setup states
  const [showMFASetup, setShowMFASetup] = useState(false)
  const [mfaSecretCode, setMfaSecretCode] = useState("")
  const [setupMfaCode, setSetupMfaCode] = useState("")
  const [qrCodeUrl, setQrCodeUrl] = useState("")

  // Forgot-password states
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("")
  const [forgotPasswordStep, setForgotPasswordStep] = useState(1)
  const [forgotPasswordCode, setForgotPasswordCode] = useState("")
  const [newForgotPassword, setNewForgotPassword] = useState("")
  const [confirmForgotPassword, setConfirmForgotPassword] = useState("")
  const [forgotPasswordError, setForgotPasswordError] = useState("")
  const [isForgotPasswordLoading, setIsForgotPasswordLoading] = useState(false)

  // Server/time
  const [session, setSession] = useState("")
  const [serverTime, setServerTime] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null)
  const [copiedSecret, setCopiedSecret] = useState(false)

  // initialize API base
  useEffect(() => {
    const configured = process.env.NEXT_PUBLIC_API_URL
    const fallback = "https://api.console-encryptgate.net"
    const base = configured || fallback
    setApiBaseUrl(base)
    // API URL configured
    if (base) fetchServerTime(base)
  }, [])

  // Check if user is already logged in
  useEffect(() => {
    const token = localStorage.getItem("access_token")
    if (token) {
      // User is already logged in, redirect to dashboard
      router.push("/admin/dashboard")
    }
  }, [router])

  // Handle ESC key for dialogs
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showPasswordChange) setShowPasswordChange(false)
        if (showMFASetup) setShowMFASetup(false)
        if (showMFA) setShowMFA(false)
        if (showForgotPassword) setShowForgotPassword(false)
      }
    }
    
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [showPasswordChange, showMFASetup, showMFA, showForgotPassword])

  // fetch server time & offset
  const fetchServerTime = async (base: string) => {
    try {
      const res = await fetchWithRetry(`${base}/api/auth/server-time`, {})
      const data = await res.json()
      if (data.server_time) {
        setServerTime(data.server_time)
        const offset = new Date(data.server_time).getTime() - Date.now()
        localStorage.setItem("server_time_offset", offset.toString())
      }
    } catch (e) {
      // Silently fail - server time sync is not critical
    }
  }

  // build QR code URL
  useEffect(() => {
    if (!mfaSecretCode) return
    const issuer = "EncryptGate"
    const uri = `otpauth://totp/${issuer.toLowerCase()}:${encodeURIComponent(email)}?secret=${mfaSecretCode}&issuer=${issuer.toLowerCase()}`
    setQrCodeUrl(
      `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uri)}`
    )
    getServerGeneratedCodes(false)
  }, [mfaSecretCode, email])

  // helper to fetch valid codes array
  const getServerGeneratedCodes = async (populate = false) => {
    if (!apiBaseUrl || !mfaSecretCode) return
    try {
      const res = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/test-mfa-code`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "include",
          body: JSON.stringify({
            secret: mfaSecretCode,
            client_time: new Date().toISOString(),
            adjusted_time: getAdjustedTime()?.toISOString(),
          }),
        }
      )
      const d = await res.json()
      if (d.current_code && populate) {
        setSetupMfaCode(d.current_code)
      }
    } catch (e) {
      // Silently fail
    }
  }

  // Copy MFA secret to clipboard
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

  // ------------------------------
  // MAIN LOGIN
  // ------------------------------
  const handleLogin = async () => {
    if (!apiBaseUrl) {
      setError("API URL not set")
      return
    }
    setIsLoading(true)
    setError("")
    setSuccessMessage("")

    // use temp_password if present
    const stored = sessionStorage.getItem("temp_password")
    const pwToUse = stored || password

    try {
      const resp = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/authenticate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "include",
          mode: "cors",
          body: JSON.stringify({ username: email, password: pwToUse }),
        }
      )
      const data: LoginResponse = await resp.json()

      if (!resp.ok) {
        throw new Error(data.detail || `Authentication failed (${resp.status})`)
      }

      // store session for challenges
      if (data.session) {
        setSession(data.session)
      }

      // if new-password or mfa required
      if (
        data.ChallengeName === "NEW_PASSWORD_REQUIRED" ||
        data.mfa_required ||
        data.ChallengeName === "SOFTWARE_TOKEN_MFA"
      ) {
        // keep pw for next step
        sessionStorage.setItem("temp_password", pwToUse)
      }

      if (data.ChallengeName === "NEW_PASSWORD_REQUIRED") {
        setShowPasswordChange(true)
      } else if (data.ChallengeName === "SOFTWARE_TOKEN_MFA" || data.mfa_required) {
        setShowMFA(true)
        await fetchServerTime(apiBaseUrl)
      } else if (data.access_token) {
        // fully authed, check if MFA setup needed
        try {
          const check = await fetchWithRetry(
            `${apiBaseUrl}/api/auth/setup-mfa`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              credentials: "include",
              mode: "cors",
              body: JSON.stringify({ access_token: data.access_token }),
            },
            1
          )
          if (check.ok) {
            const m = await check.json()
            if (m.secretCode) {
              // MFA setup flow
              setMfaSecretCode(m.secretCode)
              localStorage.setItem("temp_access_token", data.access_token)
              localStorage.setItem("temp_id_token", data.id_token||"")
              localStorage.setItem("temp_refresh_token", data.refresh_token||"")
              setShowMFASetup(true)
              return
            }
          }
        } catch (_) {
          // ignore
        }
        // no setup needed, finalize login
        finalizeLogin(data.access_token!, data.id_token||"", data.refresh_token||"")
      } else {
        throw new Error("Unexpected authentication response")
      }
    } catch (e: any) {
      setError(e.message || "Login failed")
    } finally {
      setIsLoading(false)
    }
  }

  // helper to store tokens + clear temp + auto-register user
  const finalizeLogin = async (access: string, id: string, refresh: string) => {
    localStorage.setItem("access_token", access)
    localStorage.setItem("id_token", id)
    localStorage.setItem("refresh_token", refresh)
    localStorage.setItem("userType", "admin")
    sessionStorage.removeItem("temp_password")
    
    // Auto-register user in security team if first login
    try {
      // Get organization context if available
      const orgId = localStorage.getItem('organization_id') || undefined
      const orgName = localStorage.getItem('organization_name') || undefined
      
      const response = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/auto-register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "include",
          body: JSON.stringify({ 
            email, 
            tokens: { access, id, refresh },
            organizationId: orgId,
            organizationName: orgName
          }),
        }
      )
      
      if (response.ok) {
        const userData = await response.json()
        console.log("✅ User auto-registered:", userData.role)
        
        if (userData.isFirstUser) {
          console.log("🎉 First user registered as Owner!")
        }
        
        // Update organization context if received
        if (userData.organizationId) {
          localStorage.setItem('organization_id', userData.organizationId)
        }
        if (userData.organizationName) {
          localStorage.setItem('organization_name', userData.organizationName)
        }
      }
    } catch (autoRegError) {
      console.warn("⚠️ Auto-registration failed, but continuing with login:", autoRegError)
      // Don't fail login if auto-registration fails
    }
    
    router.push("/admin/dashboard")
  }

  // ------------------------------
  // PASSWORD CHANGE
  // ------------------------------
  const handlePasswordChange = async () => {
    if (!apiBaseUrl || !session) {
      setError("Cannot change password now")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match")
      return
    }
    if (newPassword.length < 8) {
      setError("Password must be ≥8 characters")
      return
    }
    setIsLoading(true)
    setError("")

    try {
      const res = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/respond-to-challenge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "include",
          mode: "cors",
          body: JSON.stringify({
            username: email,
            session,
            challengeName: "NEW_PASSWORD_REQUIRED",
            challengeResponses: {
              NEW_PASSWORD: newPassword,
              // Set preferred_username for display in profile
              "userAttributes.preferred_username": displayName || "User",
            },
          }),
        },
        1
      )
      const d = await res.json()
      if (!res.ok) {
        throw new Error(d.detail || `Failed to change password (${res.status})`)
      }

      // store new pw for next login
      sessionStorage.setItem("temp_password", newPassword)
      if (d.session) setSession(d.session)

      if (d.access_token) {
        // same as above: maybe need MFA setup
        try {
          const check = await fetchWithRetry(
            `${apiBaseUrl}/api/auth/setup-mfa`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              credentials: "include",
              mode: "cors",
              body: JSON.stringify({ access_token: d.access_token }),
            },
            1
          )
          if (check.ok) {
            const m = await check.json()
            if (m.secretCode) {
              setShowPasswordChange(false)
              setMfaSecretCode(m.secretCode)
              localStorage.setItem("temp_access_token", d.access_token)
              localStorage.setItem("temp_id_token", d.id_token||"")
              localStorage.setItem("temp_refresh_token", d.refresh_token||"")
              setShowMFASetup(true)
              return
            }
          }
        } catch (_) {}
        // no setup needed
        finalizeLogin(d.access_token, d.id_token||"", d.refresh_token||"")
      } else if (d.ChallengeName) {
        if (d.ChallengeName === "SOFTWARE_TOKEN_MFA") {
          setShowPasswordChange(false)
          setShowMFA(true)
        } else if (d.ChallengeName === "MFA_SETUP") {
          setShowPasswordChange(false)
          setMfaSecretCode(d.secretCode||"")
          setShowMFASetup(true)
        } else {
          throw new Error(`Unexpected challenge: ${d.ChallengeName}`)
        }
      } else {
        // fallback: just attempt login
        setShowPasswordChange(false)
        await handleLogin()
      }
    } catch (e: any) {
      setError(e.message || "Failed to change password")
    } finally {
      setIsLoading(false)
    }
  }

  // ------------------------------
  // MFA SETUP
  // ------------------------------
  const handleMFASetup = async () => {
    if (!apiBaseUrl) return setError("API URL missing")
    if (!setupMfaCode.match(/^\d{6}$/))
      return setError("Enter 6-digit code from app")

    setIsLoading(true)
    setError("")
    setSuccessMessage("")
    const saved = sessionStorage.getItem("temp_password") || ""
    if (!session) {
      setError("Session expired, please log in again")
      setIsLoading(false)
      return
    }

    try {
      const adjusted = getAdjustedTime()
      const resp = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/confirm-mfa-setup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "include",
          mode: "cors",
          body: JSON.stringify({
            username: email,
            session,
            code: setupMfaCode,
            password: saved,
            client_time: new Date().toISOString(),
            adjusted_time: adjusted?.toISOString(),
          }),
        },
        2
      )
      const d = await resp.json()
      if (!resp.ok) {
        // handle expired-code as success
        if (
          resp.status === 400 &&
          d.detail?.includes("ExpiredCodeException")
        ) {
          // treat as success
          localStorage.setItem("access_token", localStorage.getItem("temp_access_token")||"")
          localStorage.setItem("id_token", localStorage.getItem("temp_id_token")||"")
          localStorage.setItem("refresh_token", localStorage.getItem("temp_refresh_token")||"")
          localStorage.setItem("userType", "admin")
          sessionStorage.removeItem("temp_password")
          localStorage.removeItem("temp_access_token")
          localStorage.removeItem("temp_id_token")
          localStorage.removeItem("temp_refresh_token")
          router.push("/admin/dashboard")
          return
        }
        throw new Error(d.detail || `MFA setup failed (${resp.status})`)
      }

      // success path
      localStorage.setItem("access_token", d.access_token||"")
      localStorage.setItem("id_token", d.id_token||"")
      localStorage.setItem("refresh_token", d.refresh_token||"")
      localStorage.setItem("userType", "admin")
      sessionStorage.removeItem("temp_password")
      localStorage.removeItem("temp_access_token")
      localStorage.removeItem("temp_id_token")
      localStorage.removeItem("temp_refresh_token")
      router.push("/admin/dashboard")
    } catch (e: any) {
      setError(e.message || "MFA setup failed")
    } finally {
      setIsLoading(false)
    }
  }

  // ------------------------------
  // MFA VERIFY
  // ------------------------------
  const handleMFASubmit = async () => {
    if (!apiBaseUrl) return setError("API URL missing")
    if (!mfaCode.match(/^\d{6}$/))
      return setError("Enter 6-digit code from app")

    setIsLoading(true)
    setError("")
    setSuccessMessage("")
    try {
      const resp = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/verify-mfa`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "include",
          mode: "cors",
          body: JSON.stringify({
            username: email,
            session,
            code: mfaCode,
          }),
        }
      )
      const d = await resp.json()
      if (!resp.ok) {
        throw new Error(d.detail || "MFA verification failed")
      }
      finalizeLogin(d.access_token||"", d.id_token||"", d.refresh_token||"")
    } catch (e: any) {
      setError(e.message || "MFA verification failed")
    } finally {
      setIsLoading(false)
    }
  }

  // ------------------------------
  // FORGOT PASSWORD
  // ------------------------------
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
    if (!forgotPasswordEmail) return setForgotPasswordError("Enter email")
    setIsForgotPasswordLoading(true)
    setForgotPasswordError("")
    try {
      const res = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/forgot-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "include",
          mode: "cors",
          body: JSON.stringify({ username: forgotPasswordEmail }),
        }
      )
      const d = await res.json()
      if (!res.ok) throw new Error(d.detail || `Error ${res.status}`)
      setForgotPasswordStep(2) // Move to verification code step
    } catch (e: any) {
      setForgotPasswordError(e.message || "Failed to send code")
    } finally {
      setIsForgotPasswordLoading(false)
    }
  }

  const handleForgotPasswordVerifyCode = async () => {
    if (!forgotPasswordCode) return setForgotPasswordError("Enter code")
    setIsForgotPasswordLoading(true)
    setForgotPasswordError("")
    
    // For now, we'll just move to the next step since we don't have a separate verify-only endpoint
    // The actual verification happens when the password is changed
    try {
      // Simulate a small delay for UX
      await new Promise(resolve => setTimeout(resolve, 500))
      setForgotPasswordStep(3) // Move to password entry step
      setForgotPasswordError("")
    } catch (e: any) {
      setForgotPasswordError(e.message || "Code verification failed")
    } finally {
      setIsForgotPasswordLoading(false)
    }
  }

  const handleForgotPasswordConfirm = async () => {
    if (!newForgotPassword) return setForgotPasswordError("Enter new password")
    if (newForgotPassword !== confirmForgotPassword)
      return setForgotPasswordError("Passwords don't match")

    setIsForgotPasswordLoading(true)
    setForgotPasswordError("")
    try {
      const res = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/confirm-forgot-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "include",
          mode: "cors",
          body: JSON.stringify({
            username: forgotPasswordEmail,
            code: forgotPasswordCode,
            password: newForgotPassword,
          }),
        }
      )
      const d = await res.json()
      if (!res.ok) throw new Error(d.detail || `Error ${res.status}`)
      // reset UI and show success message
      resetForgotPasswordDialog()
      setSuccessMessage("Password reset! Please log in.")
    } catch (e: any) {
      setForgotPasswordError(e.message || "Reset failed")
    } finally {
      setIsForgotPasswordLoading(false)
    }
  }

  // ------------------------------
  // RENDER
  // ------------------------------
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
            <CardTitle className="text-2xl font-bold text-white">Welcome Back</CardTitle>
            <CardDescription className="text-gray-400">Sign in to access your security dashboard</CardDescription>
          </div>
        </CardHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleLogin()
          }}
        >
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white text-sm font-medium">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500/20 focus:bg-[#1f1f1f] focus:text-white transition-all duration-200 [&:-webkit-autofill]:!bg-[#1f1f1f] [&:-webkit-autofill]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill]:!text-white [&:-webkit-autofill]:text-fill-color-white [&:-webkit-autofill:hover]:!bg-[#1f1f1f] [&:-webkit-autofill:hover]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:hover]:!text-white [&:-webkit-autofill:focus]:!bg-[#1f1f1f] [&:-webkit-autofill:focus]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:focus]:!text-white"
                    style={{
                      WebkitTextFillColor: 'white !important',
                      color: 'white !important',
                      backgroundColor: '#1f1f1f !important'
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-white text-sm font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500/20 focus:bg-[#1f1f1f] focus:text-white transition-all duration-200 [&:-webkit-autofill]:!bg-[#1f1f1f] [&:-webkit-autofill]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill]:!text-white [&:-webkit-autofill:hover]:!bg-[#1f1f1f] [&:-webkit-autofill:hover]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:hover]:!text-white [&:-webkit-autofill:focus]:!bg-[#1f1f1f] [&:-webkit-autofill:focus]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:focus]:!text-white"
                    style={{
                      WebkitTextFillColor: 'white !important',
                      color: 'white !important',
                      backgroundColor: '#1f1f1f !important'
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-blue-400 hover:text-blue-300 text-sm font-normal transition-colors"
              >
                Forgot your password?
              </button>
            </div>

            {error && (
              <Alert
                variant="destructive"
                className="bg-red-500/10 border-red-500/20 animate-in slide-in-from-top-2 duration-300"
              >
                <AlertDescription className="text-sm text-red-200">{error}</AlertDescription>
              </Alert>
            )}
            {successMessage && (
              <Alert className="bg-green-500/10 border-green-500/20 text-green-200 animate-in slide-in-from-top-2 duration-300">
                <AlertDescription className="text-sm">{successMessage}</AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter className="flex flex-col space-y-4 pt-6">
            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed group"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </>
              )}
            </Button>

            <p className="text-center text-xs text-gray-500">Secure access to your email security dashboard</p>
          </CardFooter>
        </form>
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
            <DialogTitle className="text-white">Change Password Required</DialogTitle>
            <DialogDescription className="text-gray-400">
              Your account requires a password change. Please create a new password.
            </DialogDescription>
          </DialogHeader>
          
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handlePasswordChange()
            }}
          >
            <div className="grid gap-4 py-4">
              {/* Username (read-only) */}
              <div className="space-y-2">
                <Label className="text-white">Username (Email)</Label>
                <div className="bg-[#1f1f1f] border border-[#2f2f2f] rounded px-3 py-2 text-gray-300">
                  {email || "unknown"}
                </div>
              </div>

              {/* Display name -> preferred_username */}
              <div className="space-y-2">
                <Label htmlFor="display-name" className="text-white">Display Name</Label>
                <Input
                  id="display-name"
                  placeholder="e.g., Security Admin, John Doe"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500/20 focus:bg-[#1f1f1f] focus:text-white [&:-webkit-autofill]:!bg-[#1f1f1f] [&:-webkit-autofill]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill]:!text-white [&:-webkit-autofill:hover]:!bg-[#1f1f1f] [&:-webkit-autofill:hover]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:hover]:!text-white [&:-webkit-autofill:focus]:!bg-[#1f1f1f] [&:-webkit-autofill:focus]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:focus]:!text-white"
                  style={{
                    WebkitTextFillColor: 'white !important',
                    color: 'white !important',
                    backgroundColor: '#1f1f1f !important'
                  }}
                />
                <p className="text-xs text-gray-400">This will be shown in your profile instead of your user ID</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password" className="text-white">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500/20 focus:bg-[#1f1f1f] focus:text-white [&:-webkit-autofill]:!bg-[#1f1f1f] [&:-webkit-autofill]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill]:!text-white [&:-webkit-autofill:hover]:!bg-[#1f1f1f] [&:-webkit-autofill:hover]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:hover]:!text-white [&:-webkit-autofill:focus]:!bg-[#1f1f1f] [&:-webkit-autofill:focus]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:focus]:!text-white"
                  style={{
                    WebkitTextFillColor: 'white !important',
                    color: 'white !important',
                    backgroundColor: '#1f1f1f !important'
                  }}
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
                  className="bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500/20 focus:bg-[#1f1f1f] focus:text-white [&:-webkit-autofill]:!bg-[#1f1f1f] [&:-webkit-autofill]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill]:!text-white [&:-webkit-autofill:hover]:!bg-[#1f1f1f] [&:-webkit-autofill:hover]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:hover]:!text-white [&:-webkit-autofill:focus]:!bg-[#1f1f1f] [&:-webkit-autofill:focus]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:focus]:!text-white"
                  style={{
                    WebkitTextFillColor: 'white !important',
                    color: 'white !important',
                    backgroundColor: '#1f1f1f !important'
                  }}
                />
              </div>
              {error && (
                <Alert variant="destructive" className="bg-red-500/10 border-red-500/20">
                  <AlertDescription className="text-sm text-red-200">{error}</AlertDescription>
                </Alert>
              )}
              <Alert className="bg-blue-500/10 border-blue-500/20">
                <AlertDescription className="text-blue-200">
                  Password must be at least 8 characters, include uppercase, lowercase, numbers, and special characters.
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={
                  isLoading ||
                  !newPassword ||
                  !confirmPassword ||
                  !displayName.trim() ||
                  newPassword !== confirmPassword
                }
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
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
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
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
                className="text-center text-2xl tracking-widest bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder-gray-500 h-12 focus:border-blue-500 focus:ring-blue-500/20 focus:bg-[#1f1f1f] focus:text-white [&:-webkit-autofill]:!bg-[#1f1f1f] [&:-webkit-autofill]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill]:!text-white [&:-webkit-autofill:hover]:!bg-[#1f1f1f] [&:-webkit-autofill:hover]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:hover]:!text-white [&:-webkit-autofill:focus]:!bg-[#1f1f1f] [&:-webkit-autofill:focus]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:focus]:!text-white"
                style={{
                  WebkitTextFillColor: 'white !important',
                  color: 'white !important',
                  backgroundColor: '#1f1f1f !important'
                }}
              />
            </div>
            
            {error && (
              <Alert variant="destructive" className="bg-red-500/10 border-red-500/20">
                <AlertDescription className="text-red-200">{error}</AlertDescription>
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
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
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
              className="text-center text-2xl tracking-widest bg-[#1f1f1f] border-[#2f2f2f] text-white focus:border-blue-500 focus:ring-blue-500/20 focus:bg-[#1f1f1f] focus:text-white [&:-webkit-autofill]:!bg-[#1f1f1f] [&:-webkit-autofill]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill]:!text-white [&:-webkit-autofill:hover]:!bg-[#1f1f1f] [&:-webkit-autofill:hover]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:hover]:!text-white [&:-webkit-autofill:focus]:!bg-[#1f1f1f] [&:-webkit-autofill:focus]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:focus]:!text-white"
              style={{
                WebkitTextFillColor: 'white !important',
                color: 'white !important',
                backgroundColor: '#1f1f1f !important'
              }}
            />
            {error && (
              <Alert variant="destructive" className="bg-red-500/10 border-red-500/20">
                <AlertDescription className="text-red-200">{error}</AlertDescription>
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
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
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
                    className="pl-10 bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500/20 focus:bg-[#1f1f1f] focus:text-white transition-all duration-200 [&:-webkit-autofill]:!bg-[#1f1f1f] [&:-webkit-autofill]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill]:!text-white [&:-webkit-autofill:hover]:!bg-[#1f1f1f] [&:-webkit-autofill:hover]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:hover]:!text-white [&:-webkit-autofill:focus]:!bg-[#1f1f1f] [&:-webkit-autofill:focus]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:focus]:!text-white"
                    style={{
                      WebkitTextFillColor: 'white !important',
                      color: 'white !important',
                      backgroundColor: '#1f1f1f !important'
                    }}
                  />
                </div>
              </div>

              {forgotPasswordError && (
                <Alert variant="destructive" className="bg-red-500/10 border-red-500/20">
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
            // Step 2: Verification Code Only
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-code" className="text-white">Verification Code</Label>
                <Input
                  id="reset-code"
                  placeholder="Enter 6-digit code"
                  value={forgotPasswordCode}
                  onChange={(e) => setForgotPasswordCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                  maxLength={6}
                  className="text-center text-2xl tracking-widest bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500/20 focus:bg-[#1f1f1f] focus:text-white [&:-webkit-autofill]:!bg-[#1f1f1f] [&:-webkit-autofill]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill]:!text-white [&:-webkit-autofill:hover]:!bg-[#1f1f1f] [&:-webkit-autofill:hover]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:hover]:!text-white [&:-webkit-autofill:focus]:!bg-[#1f1f1f] [&:-webkit-autofill:focus]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:focus]:!text-white"
                  style={{
                    WebkitTextFillColor: 'white !important',
                    color: 'white !important',
                    backgroundColor: '#1f1f1f !important'
                  }}
                />
              </div>
              
              {forgotPasswordError && (
                <Alert variant="destructive" className="bg-red-500/10 border-red-500/20">
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
            // Step 3: New Password Entry
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-forgot-password" className="text-white">New Password</Label>
                <Input
                  id="new-forgot-password"
                  type="password"
                  placeholder="Enter new password"
                  value={newForgotPassword}
                  onChange={(e) => setNewForgotPassword(e.target.value)}
                  className="bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500/20 focus:bg-[#1f1f1f] focus:text-white [&:-webkit-autofill]:!bg-[#1f1f1f] [&:-webkit-autofill]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill]:!text-white [&:-webkit-autofill:hover]:!bg-[#1f1f1f] [&:-webkit-autofill:hover]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:hover]:!text-white [&:-webkit-autofill:focus]:!bg-[#1f1f1f] [&:-webkit-autofill:focus]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:focus]:!text-white"
                  style={{
                    WebkitTextFillColor: 'white !important',
                    color: 'white !important',
                    backgroundColor: '#1f1f1f !important'
                  }}
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
                  className="bg-[#1f1f1f] border-[#2f2f2f] text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500/20 focus:bg-[#1f1f1f] focus:text-white [&:-webkit-autofill]:!bg-[#1f1f1f] [&:-webkit-autofill]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill]:!text-white [&:-webkit-autofill:hover]:!bg-[#1f1f1f] [&:-webkit-autofill:hover]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:hover]:!text-white [&:-webkit-autofill:focus]:!bg-[#1f1f1f] [&:-webkit-autofill:focus]:shadow-[0_0_0_30px_#1f1f1f_inset] [&:-webkit-autofill:focus]:!text-white"
                  style={{
                    WebkitTextFillColor: 'white !important',
                    color: 'white !important',
                    backgroundColor: '#1f1f1f !important'
                  }}
                />
              </div>
              
              {forgotPasswordError && (
                <Alert variant="destructive" className="bg-red-500/10 border-red-500/20">
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