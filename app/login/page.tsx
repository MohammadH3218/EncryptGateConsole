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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { LogoText } from "@/components/ui/logo-text"
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
import { Loader2 } from "lucide-react"

type UserType = "admin" | "employee"

interface LoginResponse {
  access_token?: string
  id_token?: string
  refresh_token?: string
  mfa_required?: boolean
  ChallengeName?: string
  session?: string
  detail?: string
  secretCode?: string
  validCodes?: string[]
  time_windows?: { code: string }[]
  current_code?: string
  server_time?: string
  serverGeneratedCode?: string // Added this property
}

export default function LoginPage() {
  const router = useRouter()
  const [userType, setUserType] = useState<UserType>("admin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  // MFA verification states
  const [showMFA, setShowMFA] = useState(false)
  const [mfaCode, setMfaCode] = useState("")
  const [mfaRecoveryCodes, setMfaRecoveryCodes] = useState<string[]>([])

  // Password change states
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  // MFA setup states
  const [showMFASetup, setShowMFASetup] = useState(false)
  const [mfaSecretCode, setMfaSecretCode] = useState("")
  const [setupMfaCode, setSetupMfaCode] = useState("")
  const [qrCodeUrl, setQrCodeUrl] = useState("")
  const [validMfaCodes, setValidMfaCodes] = useState<string[]>([])

  // Forgot Password states
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("")
  const [forgotPasswordStep, setForgotPasswordStep] = useState(1)
  const [forgotPasswordCode, setForgotPasswordCode] = useState("")
  const [newForgotPassword, setNewForgotPassword] = useState("")
  const [confirmForgotPassword, setConfirmForgotPassword] = useState("")
  const [forgotPasswordError, setForgotPasswordError] = useState("")
  const [isForgotPasswordLoading, setIsForgotPasswordLoading] = useState(false)

  // Server data
  const [session, setSession] = useState("")
  const [serverTime, setServerTime] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null)

  // On mount: pick API URL & sync time
  useEffect(() => {
    const configuredUrl = process.env.NEXT_PUBLIC_API_URL
    const fallbackUrl = "https://api.console-encryptgate.net"
    const finalUrl = configuredUrl || fallbackUrl
    setApiBaseUrl(finalUrl)
    if (finalUrl) fetchServerTime(finalUrl)
  }, [])

  const fetchServerTime = async (baseUrl: string) => {
    if (!apiBaseUrl) return
    try {
      const res = await fetchWithRetry(
        `${baseUrl}/api/auth/test-mfa-code`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "include",
          body: JSON.stringify({
            secret: mfaSecretCode || "AAAAAAAAAA",
            client_time: new Date().toISOString(),
            adjusted_time: getAdjustedTime()?.toISOString(),
          }),
        }
      )
      const data = await res.json()
      if (data.server_time) {
        const offset = new Date(data.server_time).getTime() - Date.now()
        localStorage.setItem("server_time_offset", offset.toString())
        setServerTime(data.server_time)
      }
    } catch (e) {
      console.error("Failed to fetch server time:", e)
    }
  }

  // Generate QR when secret arrives
  useEffect(() => {
    if (!mfaSecretCode) return
    const svc = "EncryptGate"
    const otpUrl = `otpauth://totp/${svc}:${encodeURIComponent(email)}?secret=${mfaSecretCode}&issuer=${svc}`
    setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpUrl)}`)
    getServerGeneratedCodes(false)
  }, [mfaSecretCode, email])

  const getServerGeneratedCodes = async (populate: boolean) => {
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
      const result = await res.json()
      if (result.current_code && populate) setSetupMfaCode(result.current_code)
      if (result.time_windows) setValidMfaCodes(result.time_windows.map((w: any) => w.code))
      else if (result.validCodes) setValidMfaCodes(result.validCodes)
    } catch (e) {
      console.error("Error getting server MFA codes:", e)
    }
  }

  // --- Forgot Password Flows ---
  const handleForgotPasswordRequest = async () => {
    if (!forgotPasswordEmail) {
      setForgotPasswordError("Please enter your email.")
      return
    }
    setIsForgotPasswordLoading(true)
    setForgotPasswordError("")
    try {
      const res = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/forgot-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Origin: window.location.origin,
          },
          mode: "cors",
          credentials: "include",
          body: JSON.stringify({ username: forgotPasswordEmail }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`)
      setForgotPasswordStep(2)
    } catch (e: any) {
      setForgotPasswordError(e.message || "Failed to send reset code")
    } finally {
      setIsForgotPasswordLoading(false)
    }
  }

  const handleForgotPasswordConfirm = async () => {
    if (!forgotPasswordCode || !newForgotPassword || newForgotPassword !== confirmForgotPassword) {
      setForgotPasswordError("Please fill in all fields and match passwords.")
      return
    }
    setIsForgotPasswordLoading(true)
    setForgotPasswordError("")
    try {
      const res = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/confirm-forgot-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Origin: window.location.origin,
          },
          mode: "cors",
          credentials: "include",
          body: JSON.stringify({
            username: forgotPasswordEmail,
            code: forgotPasswordCode,
            password: newForgotPassword,
          }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`)
      setShowForgotPassword(false)
      setSuccessMessage("Password reset successful. Please sign in.")
      resetForgotPasswordState()
    } catch (e: any) {
      setForgotPasswordError(e.message || "Failed to reset password")
    } finally {
      setIsForgotPasswordLoading(false)
    }
  }

  const resetForgotPasswordState = () => {
    setForgotPasswordStep(1)
    setForgotPasswordEmail("")
    setForgotPasswordCode("")
    setNewForgotPassword("")
    setConfirmForgotPassword("")
    setForgotPasswordError("")
  }

  // --- LOGIN FLOW ---
  const handleLogin = async () => {
    if (!apiBaseUrl) {
      setError("API URL missing")
      return
    }
    setIsLoading(true)
    setError("")
    setSuccessMessage("")
    try {
      const res = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/authenticate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Origin: window.location.origin,
          },
          mode: "cors",
          credentials: "include",
          body: JSON.stringify({ username: email, password }),
        }
      )
      const data: LoginResponse = await res.json()
      if (!res.ok) throw new Error(data.detail || `Auth failed (${res.status})`)

      if (data.session) setSession(data.session)

      // Store temp password if any challenge
      if (data.mfa_required || data.ChallengeName === "SOFTWARE_TOKEN_MFA" || data.ChallengeName === "NEW_PASSWORD_REQUIRED") {
        sessionStorage.setItem("temp_password", password)
      }

      // NEW PASSWORD REQUIRED
      if (data.ChallengeName === "NEW_PASSWORD_REQUIRED") {
        setShowPasswordChange(true)
        return
      }

      // MFA VERIFICATION REQUIRED
      if (data.ChallengeName === "SOFTWARE_TOKEN_MFA" || data.mfa_required) {
        setShowMFA(true)
        await fetchServerTime(apiBaseUrl)
        return
      }

      // NO CHALLENGES — setup MFA or finish login
      if (data.access_token) {
        // check if user must setup MFA
        const mfaRes = await fetchWithRetry(
          `${apiBaseUrl}/api/auth/setup-mfa`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Origin: window.location.origin,
            },
            mode: "cors",
            credentials: "include",
            body: JSON.stringify({ access_token: data.access_token }),
          },
          1
        )
        const mfaData = await mfaRes.json()
        if (mfaRes.ok && mfaData.secretCode) {
          setMfaSecretCode(mfaData.secretCode)
          setValidMfaCodes(Array.isArray(mfaData.validCodes) ? mfaData.validCodes : [mfaData.validCodes].flat())
          localStorage.setItem("temp_access_token", data.access_token)
          localStorage.setItem("temp_id_token", data.id_token || "")
          localStorage.setItem("temp_refresh_token", data.refresh_token || "")
          setShowMFASetup(true)
          return
        }

        // fully authenticated: store tokens, userType, clean up, redirect
        localStorage.setItem("access_token", data.access_token)
        localStorage.setItem("id_token", data.id_token || "")
        localStorage.setItem("refresh_token", data.refresh_token || "")
        localStorage.setItem("userType", userType)
        sessionStorage.removeItem("temp_password")
        router.push("/admin/dashboard")
      }
    } catch (e: any) {
      setError(e.message || "Login failed")
    } finally {
      setIsLoading(false)
    }
  }

  // --- PASSWORD CHANGE FLOW ---
  const handlePasswordChange = async () => {
    if (!apiBaseUrl || !session) {
      setError("Cannot change password now")
      return
    }
    if (newPassword.length < 8 || newPassword !== confirmPassword) {
      setError("Ensure password is ≥8 chars and matches")
      return
    }
    setIsLoading(true)
    setError("")
    try {
      const res = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/respond-to-challenge`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Origin: window.location.origin,
          },
          mode: "cors",
          credentials: "include",
          body: JSON.stringify({
            username: email,
            session,
            challengeName: "NEW_PASSWORD_REQUIRED",
            challengeResponses: { NEW_PASSWORD: newPassword },
          }),
        },
        1
      )
      const data: LoginResponse = await res.json()
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`)
      setSession(data.session || session)
      sessionStorage.setItem("temp_password", newPassword)

      if (data.access_token) {
        // same MFA setup check as above
        const mfaRes = await fetchWithRetry(
          `${apiBaseUrl}/api/auth/setup-mfa`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Origin: window.location.origin,
            },
            mode: "cors",
            credentials: "include",
            body: JSON.stringify({ access_token: data.access_token }),
          },
          1
        )
        const mfaData = await mfaRes.json()
        if (mfaRes.ok && mfaData.secretCode) {
          setMfaSecretCode(mfaData.secretCode)
          setValidMfaCodes(Array.isArray(mfaData.validCodes) ? mfaData.validCodes : [mfaData.validCodes].flat())
          localStorage.setItem("temp_access_token", data.access_token)
          localStorage.setItem("temp_id_token", data.id_token || "")
          localStorage.setItem("temp_refresh_token", data.refresh_token || "")
          setShowMFASetup(true)
          return
        }

        // done
        localStorage.setItem("access_token", data.access_token)
        localStorage.setItem("id_token", data.id_token || "")
        localStorage.setItem("refresh_token", data.refresh_token || "")
        localStorage.setItem("userType", userType)
        sessionStorage.removeItem("temp_password")
        setShowPasswordChange(false)
        router.push("/admin/dashboard")
      } else if (data.ChallengeName === "SOFTWARE_TOKEN_MFA") {
        setShowPasswordChange(false)
        setShowMFA(true)
      } else if (data.ChallengeName === "MFA_SETUP") {
        setShowPasswordChange(false)
        setMfaSecretCode(data.secretCode || "")
        setShowMFASetup(true)
      } else {
        // fallback: re-login
        setShowPasswordChange(false)
        await handleLogin()
      }
    } catch (e: any) {
      setError(e.message || "Failed to change password")
    } finally {
      setIsLoading(false)
    }
  }

  // --- MFA SETUP FLOW ---
  const handleMFASetup = async () => {
    if (!apiBaseUrl) {
      setError("API URL missing")
      return
    }
    if (!/^\d{6}$/.test(setupMfaCode)) {
      setError("Enter a valid 6‑digit code")
      return
    }
    setIsLoading(true)
    setError("")
    setSuccessMessage("")

    const savedPwd = sessionStorage.getItem("temp_password") || ""
    if (!session || !savedPwd) {
      setError("Session expired. Please log in again.")
      setIsLoading(false)
      return
    }

    try {
      const res = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/confirm-mfa-setup`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Origin: window.location.origin,
          },
          mode: "cors",
          credentials: "include",
          body: JSON.stringify({
            username: email,
            session,
            code: setupMfaCode,
            password: savedPwd,
            client_time: new Date().toISOString(),
            adjusted_time: getAdjustedTime()?.toISOString(),
          }),
        },
        2
      )
      const data: LoginResponse = await res.json()
      // special ExpiredCodeException means success
      if (!res.ok && data.detail?.includes("ExpiredCodeException")) {
        // fall through to success
      } else if (!res.ok) {
        throw new Error(data.detail || `Error ${res.status}`)
      }

      // success: grab temp tokens if they exist
      const tempAT = localStorage.getItem("temp_access_token")
      if (tempAT) {
        localStorage.setItem("access_token", tempAT)
        localStorage.setItem("id_token", localStorage.getItem("temp_id_token") || "")
        localStorage.setItem("refresh_token", localStorage.getItem("temp_refresh_token") || "")
      } else if (data.access_token) {
        localStorage.setItem("access_token", data.access_token)
        localStorage.setItem("id_token", data.id_token || "")
        localStorage.setItem("refresh_token", data.refresh_token || "")
      }

      // finalize
      localStorage.setItem("userType", userType)
      localStorage.removeItem("temp_access_token")
      localStorage.removeItem("temp_id_token")
      localStorage.removeItem("temp_refresh_token")
      sessionStorage.removeItem("temp_password")
      setShowMFASetup(false)

      setTimeout(() => {
        router.push("/admin/dashboard")
      }, 500)
    } catch (e: any) {
      setError(e.message || "Failed to set up MFA")
    } finally {
      setIsLoading(false)
    }
  }

  // --- MFA VERIFY FLOW ---
  const handleMFASubmit = async () => {
    if (!apiBaseUrl) {
      setError("API URL missing")
      return
    }
    if (!/^\d{6}$/.test(mfaCode)) {
      setError("Enter a valid 6‑digit code")
      return
    }

    setError("")
    setSuccessMessage("")
    setIsLoading(true)
    try {
      await fetchServerTime(apiBaseUrl)
      const adjusted = getAdjustedTime()?.toISOString()
      const res = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/verify-mfa`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Origin: window.location.origin,
          },
          mode: "cors",
          credentials: "include",
          body: JSON.stringify({
            code: mfaCode,
            session,
            username: email,
            client_time: new Date().toISOString(),
            adjusted_time: adjusted,
          }),
        },
        2
      )
      const data: LoginResponse = await res.json()
      if (res.ok && data.access_token) {
        localStorage.setItem("access_token", data.access_token)
        localStorage.setItem("id_token", data.id_token || "")
        localStorage.setItem("refresh_token", data.refresh_token || "")
        localStorage.setItem("userType", userType)
        sessionStorage.removeItem("temp_password")
        setTimeout(() => router.push("/admin/dashboard"), 500)
        return
      }
      // server‑generated retry
      if (!res.ok && (data.serverGeneratedCode || data.current_code || data.validCodes?.length)) {
        const serverCode = data.serverGeneratedCode || data.current_code
        const valid = data.validCodes || []
        setMfaRecoveryCodes(valid)
        if (serverCode) {
          setSuccessMessage("Retrying with server‐generated code…")
          return handleMFASubmit() // recursion will now pick up serverCode in state
        }
      }
      throw new Error(data.detail || "MFA failed")
    } catch (e: any) {
      setError(e.message || "MFA verification failed")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {/* ==================== MAIN LOGIN CARD ==================== */}
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div className="flex justify-center items-center gap-2">
            <div className="w-8 h-8">
              {/* your SVG logo */}
              <LogoText>EncryptGate</LogoText>
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-center">
            Sign in
          </CardTitle>
          <CardDescription className="text-center">
            Choose your account type to access the security dashboard
          </CardDescription>
        </CardHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleLogin()
          }}
        >
          <CardContent className="space-y-6">
            <RadioGroup
              value={userType}
              onValueChange={(v: UserType) => setUserType(v)}
              className="grid gap-4"
            >
              <div className="flex items-center space-x-4 rounded-lg border p-4 hover:border-primary">
                <RadioGroupItem value="admin" id="admin" />
                <Label htmlFor="admin" className="cursor-pointer">
                  Admin
                </Label>
              </div>
              <div className="flex items-center space-x-4 rounded-lg border p-4 hover:border-primary">
                <RadioGroupItem value="employee" id="employee" />
                <Label htmlFor="employee" className="cursor-pointer">
                  Employee
                </Label>
              </div>
            </RadioGroup>
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {successMessage && (
              <Alert>
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Please wait...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-primary"
              onClick={() => setShowForgotPassword(true)}
            >
              Forgot Password?
            </button>
          </CardFooter>
        </form>
      </Card>

      {/* ================= DIALOGS: Password Change, MFA Setup & Verify, Forgot Password ================= */}
      {/* Password Change */}
      <Dialog open={showPasswordChange} onOpenChange={(o) => o && setShowPasswordChange(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password Required</DialogTitle>
            <DialogDescription>
              Your account requires a password update. Please choose a new password.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={handlePasswordChange}
              disabled={
                isLoading ||
                !newPassword ||
                !confirmPassword ||
                newPassword !== confirmPassword
              }
              className="w-full"
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
        </DialogContent>
      </Dialog>

      {/* MFA Setup */}
      <Dialog open={showMFASetup} onOpenChange={(o) => o && setShowMFASetup(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setup Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              To finish setup, scan the QR code in your Authenticator app and enter the generated code.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Alert>
              <AlertDescription>
                1. Install an Authenticator app <br />
                2. Scan the QR code below <br />
                3. Enter the 6-digit code
              </AlertDescription>
            </Alert>
            {qrCodeUrl && (
              <img
                src={qrCodeUrl}
                alt="MFA QR Code"
                className="w-48 h-48 mx-auto"
              />
            )}
            <Input
              placeholder="Enter 6‑digit code"
              value={setupMfaCode}
              maxLength={6}
              onChange={(e) => setSetupMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center text-2xl tracking-widest"
            />
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleMFASetup} disabled={isLoading} className="w-full">
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

      {/* MFA Verify */}
      <Dialog open={showMFA} onOpenChange={(o) => o && setShowMFA(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Authentication Code</DialogTitle>
            <DialogDescription>
              Enter the 6-digit code from your Authenticator app.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Input
              placeholder="6‑digit code"
              value={mfaCode}
              maxLength={6}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center text-2xl tracking-widest"
            />
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleMFASubmit} disabled={isLoading} className="w-full">
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

      {/* Forgot Password */}
      <Dialog
        open={showForgotPassword}
        onOpenChange={(open) => {
          if (!open) {
            resetForgotPasswordState()
            setShowForgotPassword(false)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Your Password</DialogTitle>
            <DialogDescription>
              {forgotPasswordStep === 1
                ? "Enter your email to receive a reset code"
                : "Enter the code and your new password"}
            </DialogDescription>
          </DialogHeader>
          {forgotPasswordStep === 1 ? (
            <div className="grid gap-4 py-4">
              <Input
                type="email"
                placeholder="name@example.com"
                value={forgotPasswordEmail}
                onChange={(e) => setForgotPasswordEmail(e.target.value)}
              />
              {forgotPasswordError && (
                <Alert variant="destructive">
                  <AlertDescription>{forgotPasswordError}</AlertDescription>
                </Alert>
              )}
              <Button
                onClick={handleForgotPasswordRequest}
                disabled={!forgotPasswordEmail || isForgotPasswordLoading}
                className="w-full"
              >
                {isForgotPasswordLoading ? "Sending..." : "Send Reset Code"}
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 py-4">
              <Input
                placeholder="Reset code"
                value={forgotPasswordCode}
                onChange={(e) => setForgotPasswordCode(e.target.value)}
              />
              <Input
                type="password"
                placeholder="New password"
                value={newForgotPassword}
                onChange={(e) => setNewForgotPassword(e.target.value)}
              />
              <Input
                type="password"
                placeholder="Confirm new password"
                value={confirmForgotPassword}
                onChange={(e) => setConfirmForgotPassword(e.target.value)}
              />
              {forgotPasswordError && (
                <Alert variant="destructive">
                  <AlertDescription>{forgotPasswordError}</AlertDescription>
                </Alert>
              )}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setForgotPasswordStep(1)}
                  disabled={isForgotPasswordLoading}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleForgotPasswordConfirm}
                  disabled={
                    !forgotPasswordCode ||
                    !newForgotPassword ||
                    newForgotPassword !== confirmForgotPassword ||
                    isForgotPasswordLoading
                  }
                  className="flex-1"
                >
                  {isForgotPasswordLoading ? "Resetting..." : "Reset Password"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
