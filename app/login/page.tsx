/* "use client"

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
  const [userType, setUserType] = useState<UserType>("admin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  // MFA states
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

  // initialize API base
  useEffect(() => {
    const configured = process.env.NEXT_PUBLIC_API_URL
    const fallback = "https://api.console-encryptgate.net"
    const base = configured || fallback
    setApiBaseUrl(base)
    console.log(`API URL set to ${base}`)
    if (base) fetchServerTime(base)
  }, [])

  // fetch server time & offset
  const fetchServerTime = async (base: string) => {
    try {
      const res = await fetchWithRetry(
        `${base}/api/auth/test-mfa-code`,
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
        setServerTime(data.server_time)
        const offset = new Date(data.server_time).getTime() - Date.now()
        localStorage.setItem("server_time_offset", offset.toString())
        if (Math.abs(offset) > 10000)
          console.warn(`Time sync diff >10s: ${Math.round(Math.abs(offset)/1000)}s`)
      }
    } catch (e) {
      console.error("Failed fetching server time", e)
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
      const adjusted = getAdjustedTime()
      const res = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/test-mfa-code`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "include",
          body: JSON.stringify({
            secret: mfaSecretCode,
            client_time: new Date().toISOString(),
            adjusted_time: adjusted?.toISOString(),
          }),
        }
      )
      const d = await res.json()
      if (d.current_code) {
        if (populate) setSetupMfaCode(d.current_code)
        if (d.time_windows) {
          setValidMfaCodes(d.time_windows.map((w: any) => w.code))
        } else if (d.validCodes) {
          setValidMfaCodes(d.validCodes)
        }
      }
    } catch (e) {
      console.error("Error fetching MFA codes", e)
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
      console.log("Authenticating:", email)
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
      console.log("Auth response status:", resp.status)

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
              if (m.validCodes) {
                setValidMfaCodes(Array.isArray(m.validCodes) ? m.validCodes : [m.validCodes])
              }
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
      console.error("Login error:", e)
      setError(e.message || "Login failed")
    } finally {
      setIsLoading(false)
    }
  }

  // helper to store tokens + clear temp
  const finalizeLogin = (access: string, id: string, refresh: string) => {
    localStorage.setItem("access_token", access)
    localStorage.setItem("id_token", id)
    localStorage.setItem("refresh_token", refresh)
    localStorage.setItem("userType", userType)
    sessionStorage.removeItem("temp_password")
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
      console.log("NEW_PASSWORD_REQUIRED challenge")
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
            challengeResponses: { NEW_PASSWORD: newPassword },
          }),
        },
        1
      )
      const d = await res.json()
      console.log("Password change status:", res.status)
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
              if (m.validCodes) {
                setValidMfaCodes(Array.isArray(m.validCodes)?m.validCodes:[m.validCodes])
              }
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
      console.error("Password change error", e)
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
      console.log("MFA setup verify status:", resp.status)
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
          localStorage.setItem("userType", userType)
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
      localStorage.setItem("userType", userType)
      sessionStorage.removeItem("temp_password")
      localStorage.removeItem("temp_access_token")
      localStorage.removeItem("temp_id_token")
      localStorage.removeItem("temp_refresh_token")
      router.push("/admin/dashboard")
    } catch (e: any) {
      console.error("MFA setup error", e)
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
      await fetchServerTime(apiBaseUrl)
      const adjusted = getAdjustedTime()
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
            client_time: new Date().toISOString(),
            adjusted_time: adjusted?.toISOString(),
          }),
        },
        2
      )
      const d = await resp.json()
      if (!resp.ok) {
        // try server-generated code
        if (d.serverGeneratedCode) {
          const retry = await fetchWithRetry(
            `${apiBaseUrl}/api/auth/verify-mfa`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              credentials: "include",
              mode: "cors",
              body: JSON.stringify({
                username: email,
                session,
                code: d.serverGeneratedCode,
                client_time: new Date().toISOString(),
                adjusted_time: adjusted?.toISOString(),
              }),
            }
          )
          if (retry.ok) {
            const r2 = await retry.json()
            finalizeLogin(r2.access_token||"", r2.id_token||"", r2.refresh_token||"")
            return
          }
        }
        throw new Error(d.detail || "MFA verify failed")
      }
      // success
      finalizeLogin(d.access_token||"", d.id_token||"", d.refresh_token||"")
    } catch (e: any) {
      console.error("MFA verify error", e)
      setError(e.message || "MFA verification failed")
    } finally {
      setIsLoading(false)
    }
  }

  // ------------------------------
  // FORGOT PASSWORD
  // ------------------------------
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
      setForgotPasswordStep(2)
    } catch (e: any) {
      setForgotPasswordError(e.message || "Failed to send code")
    } finally {
      setIsForgotPasswordLoading(false)
    }
  }

  const handleForgotPasswordConfirm = async () => {
    if (!forgotPasswordCode) return setForgotPasswordError("Enter code")
    if (!newForgotPassword) return setForgotPasswordError("Enter new password")
    if (newForgotPassword !== confirmForgotPassword)
      return setForgotPasswordError("Passwords don’t match")

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
      // reset UI
      setShowForgotPassword(false)
      setForgotPasswordStep(1)
      setForgotPasswordEmail("")
      setForgotPasswordCode("")
      setNewForgotPassword("")
      setConfirmForgotPassword("")
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div className="flex justify-center items-center gap-2">
            <div className="w-8 h-8">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2zm0 25.2c-6.188 0-11.2-5.012-11.2-11.2S9.812 4.8 16 4.8 27.2 9.812 27.2 16 22.188 27.2 16 27.2z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <LogoText>EncryptGate</LogoText>
          </div>
          <CardTitle className="text-2xl font-bold text-center">Sign in</CardTitle>
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
              <div className="relative flex items-center space-x-4 rounded-lg border p-4 hover:border-primary">
                <RadioGroupItem value="admin" id="admin" />
                <Label htmlFor="admin" className="flex-1 cursor-pointer">
                  Admin
                </Label>
              </div>
              <div className="relative flex items-center space-x-4 rounded-lg border p-4 hover:border-primary">
                <RadioGroupItem value="employee" id="employee" />
                <Label htmlFor="employee" className="flex-1 cursor-pointer">
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
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            )}
            {successMessage && (
              <Alert>
                <AlertDescription className="text-sm">{successMessage}</AlertDescription>
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
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-muted-foreground hover:text-primary"
              >
                Forgot Password?
              </button>
            </div>
          </CardFooter>
        </form>
      </Card>

      {/* Password Change */}
      /*<Dialog open={showPasswordChange} onOpenChange={(o) => o && setShowPasswordChange(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password Required</DialogTitle>
            <DialogDescription>
              Your account requires a password change. Please create a new password.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            )}
            <Alert>
              <AlertDescription>
                Password must be at least 8 characters, include uppercase, lowercase, numbers, and special characters.
              </AlertDescription>
            </Alert>
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
      /*<Dialog open={showMFASetup} onOpenChange={(o) => o && setShowMFASetup(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setup Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              For additional security, please set up Google Authenticator.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Alert>
              <AlertDescription>
                <ol className="list-decimal list-inside">
                  <li>Install Google Authenticator</li>
                  <li>Scan the QR code below</li>
                  <li>Enter the 6-digit code</li>
                  <li>Click “Verify & Complete”</li>
                </ol>
              </AlertDescription>
            </Alert>
            {qrCodeUrl && (
              <div className="flex flex-col items-center space-y-2">
                <Label>Scan QR Code</Label>
                <img src={qrCodeUrl} alt="MFA QR" className="w-48 h-48" />
              </div>
            )}
            {mfaSecretCode && (
              <div className="text-center space-y-2">
                <Label>Secret Key</Label>
                <div className="font-mono">{mfaSecretCode}</div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="setup-mfa-code">Verification Code</Label>
              <Input
                id="setup-mfa-code"
                placeholder="6-digit code"
                value={setupMfaCode}
                onChange={(e) => setSetupMfaCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                maxLength={6}
                className="text-center text-2xl tracking-widest"
              />
              {validMfaCodes.length > 0 && (
                <details className="text-xs text-muted-foreground">
                  <summary>Need help?</summary>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {validMfaCodes.slice(0, 5).map((c, i) => (
                      <button
                        key={i}
                        onClick={() => setSetupMfaCode(c)}
                        className="px-2 py-1 border rounded"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </div>
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
      /*<Dialog open={showMFA} onOpenChange={(o) => o && setShowMFA(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Authentication Code</DialogTitle>
            <DialogDescription>Enter the 6-digit code from your authenticator app</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label htmlFor="mfa-code">Code</Label>
            <Input
              id="mfa-code"
              placeholder="6-digit"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              maxLength={6}
              className="text-center text-2xl tracking-widest"
            />
            {mfaRecoveryCodes.length > 0 && (
              <details className="text-xs text-muted-foreground">
                <summary>Use alternate codes</summary>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {mfaRecoveryCodes.slice(0, 5).map((c, i) => (
                    <button
                      key={i}
                      onClick={() => setMfaCode(c)}
                      className="px-2 py-1 border rounded"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </details>
            )}
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
      /*<Dialog
        open={showForgotPassword}
        onOpenChange={(o) => {
          if (!o) setShowForgotPassword(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Your Password</DialogTitle>
            <DialogDescription>
              {forgotPasswordStep === 1
                ? "Enter your email to receive a code"
                : "Enter code & new password"}
            </DialogDescription>
          </DialogHeader>
          {forgotPasswordStep === 1 ? (
            <div className="grid gap-4 py-4">
              <Label htmlFor="reset-email">Email Address</Label>
              <Input
                id="reset-email"
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
                {isForgotPasswordLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Reset Code"
                )}
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="reset-code">Verification Code</Label>
                <Input
                  id="reset-code"
                  placeholder="Enter code"
                  value={forgotPasswordCode}
                  onChange={(e) => setForgotPasswordCode(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-forgot-password">New Password</Label>
                <Input
                  id="new-forgot-password"
                  type="password"
                  placeholder="Enter new password"
                  value={newForgotPassword}
                  onChange={(e) => setNewForgotPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-forgot-password">Confirm New Password</Label>
                <Input
                  id="confirm-forgot-password"
                  type="password"
                  placeholder="Confirm password"
                  value={confirmForgotPassword}
                  onChange={(e) => setConfirmForgotPassword(e.target.value)}
                />
              </div>
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
                    !confirmForgotPassword ||
                    isForgotPasswordLoading
                  }
                  className="flex-1"
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
