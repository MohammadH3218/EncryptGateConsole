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
  current_code?: string
  time_windows?: { code: string }[]
}

export default function LoginPage() {
  const router = useRouter()

  // --- Credentials & Role ---
  const [userType, setUserType] = useState<UserType>("admin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  // --- Common UI states ---
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null)

  // --- Challenge session (returned by Cognito) ---
  const [session, setSession] = useState("")

  // --- NEW PASSWORD REQUIRED flow ---
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  // --- MFA SETUP flow ---
  const [showMFASetup, setShowMFASetup] = useState(false)
  const [mfaSecretCode, setMfaSecretCode] = useState("")
  const [setupMfaCode, setSetupMfaCode] = useState("")
  const [qrCodeUrl, setQrCodeUrl] = useState("")
  const [validMfaCodes, setValidMfaCodes] = useState<string[]>([])
  const [serverTime, setServerTime] = useState<string | null>(null)

  // --- MFA VERIFY flow ---
  const [showMFA, setShowMFA] = useState(false)
  const [mfaCode, setMfaCode] = useState("")
  const [mfaRecoveryCodes, setMfaRecoveryCodes] = useState<string[]>([])

  // -----------------------------------------------
  // Fetch API base URL & initial server time sync
  // -----------------------------------------------
  useEffect(() => {
    const configuredUrl = process.env.NEXT_PUBLIC_API_URL
    const fallbackUrl = "https://api.console-encryptgate.net"
    const finalUrl = configuredUrl || fallbackUrl
    setApiBaseUrl(finalUrl)
    if (finalUrl) {
      fetchServerTime(finalUrl)
    }
  }, [])

  const fetchServerTime = async (baseUrl: string) => {
    if (!baseUrl) return
    try {
      const response = await fetchWithRetry(
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
      const data = await response.json()
      if (data.server_time) {
        setServerTime(data.server_time)
        const offset = new Date(data.server_time).getTime() - Date.now()
        localStorage.setItem("server_time_offset", offset.toString())
      }
    } catch (err) {
      console.error("Time sync failed", err)
    }
  }

  // -----------------------------------------------
  // When we get a secretCode, build the QR & fetch codes
  // -----------------------------------------------
  useEffect(() => {
    if (!mfaSecretCode) return
    const serviceName = "EncryptGate"
    const otpauth = `otpauth://totp/${serviceName}:${encodeURIComponent(email)}?secret=${mfaSecretCode}&issuer=${serviceName}`
    setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauth)}`)
    getServerGeneratedCodes()
  }, [mfaSecretCode, email])

  const getServerGeneratedCodes = async () => {
    if (!apiBaseUrl || !mfaSecretCode) return
    try {
      const resp = await fetchWithRetry(
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
      const j = await resp.json()
      if (Array.isArray(j.time_windows)) {
        setValidMfaCodes(j.time_windows.map((w: any) => w.code))
      } else if (Array.isArray(j.validCodes)) {
        setValidMfaCodes(j.validCodes)
      }
    } catch (err) {
      console.error("Could not fetch valid MFA codes", err)
    }
  }

  // -----------------------------------------------
  // Handle the initial Authenticate call
  // -----------------------------------------------
  const handleLogin = async () => {
    if (!apiBaseUrl) {
      setError("API URL not set.")
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
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "include",
          body: JSON.stringify({ username: email, password }),
        }
      )
      const data: LoginResponse = await res.json()
      if (!res.ok) throw new Error(data.detail || `Login failed (${res.status})`)

      // Store session for subsequent challenges
      if (data.session) setSession(data.session)

      // NEW_PASSWORD_REQUIRED?
      if (data.ChallengeName === "NEW_PASSWORD_REQUIRED") {
        return setShowPasswordChange(true)
      }

      // SOFTWARE_TOKEN_MFA?
      if (data.ChallengeName === "SOFTWARE_TOKEN_MFA" || data.mfa_required) {
        await fetchServerTime(apiBaseUrl)
        return setShowMFA(true)
      }

      // Fully authenticated
      if (data.access_token) {
        localStorage.setItem("access_token", data.access_token)
        localStorage.setItem("id_token", data.id_token || "")
        localStorage.setItem("refresh_token", data.refresh_token || "")
        localStorage.setItem("userType", userType)
        router.push("/admin/dashboard")
      }
    } catch (err: any) {
      setError(err.message || "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }

  // -----------------------------------------------
  // Handle NEW_PASSWORD_REQUIRED challenge
  // -----------------------------------------------
  const handlePasswordChange = async () => {
    if (!apiBaseUrl || !session) {
      return setError("Cannot change password right now.")
    }
    if (newPassword !== confirmPassword) {
      return setError("Passwords must match.")
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
          body: JSON.stringify({
            username: email,
            session,
            challengeName: "NEW_PASSWORD_REQUIRED",
            challengeResponses: { NEW_PASSWORD: newPassword },
          }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `Error (${res.status})`)

      // After setting new password, we treat it as a fresh login
      setShowPasswordChange(false)
      setPassword(newPassword)
      handleLogin()
    } catch (err: any) {
      setError(err.message || "Password change failed")
    } finally {
      setIsLoading(false)
    }
  }

  // -----------------------------------------------
  // Handle MFA SETUP challenge (no redirect here!)
  // -----------------------------------------------
  const handleMFASetup = async () => {
    if (!apiBaseUrl) {
      return setError("API URL not set.")
    }
    if (!setupMfaCode.match(/^\d{6}$/)) {
      return setError("Enter a 6-digit code.")
    }
    setIsLoading(true)
    setError("")
    setSuccessMessage("")
    try {
      const res = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/confirm-mfa-setup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "include",
          body: JSON.stringify({
            username: email,
            session,
            code: setupMfaCode,
            password,                   // you may need to send the current password here
            client_time: new Date().toISOString(),
            adjusted_time: getAdjustedTime()?.toISOString(),
          }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `Error (${res.status})`)

      // Close the setup dialog and show a message
      setShowMFASetup(false)
      setSuccessMessage("MFA setup successful! Please sign in with your new credentials.")
      // NOTE: No router.push here. The user must login again (fresh session + tokens).
    } catch (err: any) {
      setError(err.message || "MFA setup failed")
    } finally {
      setIsLoading(false)
    }
  }

  // -----------------------------------------------
  // Handle MFA VERIFY challenge
  // -----------------------------------------------
  const handleMFASubmit = async () => {
    if (!apiBaseUrl) {
      return setError("API URL not set.")
    }
    if (!mfaCode.match(/^\d{6}$/)) {
      return setError("Enter a 6-digit code.")
    }
    setIsLoading(true)
    setError("")
    setSuccessMessage("")
    try {
      // re-sync time
      await fetchServerTime(apiBaseUrl)

      const res = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/verify-mfa`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "include",
          body: JSON.stringify({
            username: email,
            session,
            code: mfaCode,
            client_time: new Date().toISOString(),
            adjusted_time: getAdjustedTime()?.toISOString(),
          }),
        }
      )
      const data: LoginResponse = await res.json()
      if (!res.ok) throw new Error(data.detail || `Error (${res.status})`)

      // Success! store tokens & go
      localStorage.setItem("access_token", data.access_token || "")
      localStorage.setItem("id_token", data.id_token || "")
      localStorage.setItem("refresh_token", data.refresh_token || "")
      localStorage.setItem("userType", userType)
      router.push("/admin/dashboard")
    } catch (err: any) {
      setError(err.message || "MFA verification failed")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div className="flex justify-center items-center gap-2">
            <div className="w-8 h-8">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <LogoText>EncryptGate</LogoText>
          </div>
          <CardTitle className="text-2xl font-bold text-center">Sign in</CardTitle>
          <CardDescription className="text-center">Choose your account type</CardDescription>
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
              onValueChange={(v) => setUserType(v as UserType)} 
              className="grid gap-4"
            >
              <div className="flex items-center space-x-4 rounded-lg border p-4 hover:border-primary">
                <RadioGroupItem value="admin" id="admin" />
                <Label htmlFor="admin" className="cursor-pointer">Admin</Label>
              </div>
              <div className="flex items-center space-x-4 rounded-lg border p-4 hover:border-primary">
                <RadioGroupItem value="employee" id="employee" />
                <Label htmlFor="employee" className="cursor-pointer">Employee</Label>
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
          </CardFooter>
        </form>
      </Card>

      {/* --- NEW PASSWORD REQUIRED --- */}
      <Dialog open={showPasswordChange} onOpenChange={setShowPasswordChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password Required</DialogTitle>
            <DialogDescription>Create a new password</DialogDescription>
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

      {/* --- MFA SETUP --- */}
      <Dialog open={showMFASetup} onOpenChange={setShowMFASetup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setup Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              Scan the QR code in your authenticator app, then enter the 6-digit code
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {qrCodeUrl && (
              <img src={qrCodeUrl} alt="MFA QR Code" className="mx-auto" />
            )}
            <Input
              placeholder="123456"
              maxLength={6}
              value={setupMfaCode}
              onChange={(e) => setSetupMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center text-2xl tracking-widest"
            />
            {validMfaCodes.length > 0 && (
              <div className="text-xs text-center mt-2">
                <details>
                  <summary>Alternative codes</summary>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    {validMfaCodes.map((c) => (
                      <button
                        key={c}
                        className="px-2 py-1 bg-gray-700 text-white rounded"
                        onClick={() => setSetupMfaCode(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </details>
              </div>
            )}
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

      {/* --- MFA VERIFY --- */}
      <Dialog open={showMFA} onOpenChange={setShowMFA}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Authentication Code</DialogTitle>
            <DialogDescription>
              Please enter the 6-digit code from your authenticator app
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Input
              placeholder="123456"
              maxLength={6}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center text-2xl tracking-widest"
            />
            {mfaRecoveryCodes.length > 0 && (
              <div className="text-xs text-center mt-2">
                <details>
                  <summary>Use a recovery code</summary>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    {mfaRecoveryCodes.map((c) => (
                      <button
                        key={c}
                        className="px-2 py-1 bg-gray-700 text-white rounded"
                        onClick={() => setMfaCode(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </details>
              </div>
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
    </div>
  )
}
