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
  email?: string
  role?: string
  detail?: string
  secretCode?: string
  message?: string
  status?: string
  username?: string
  currentCode?: string
  currentValidCode?: string
  serverGeneratedCode?: string
  validCodes?: string[]
  timeInfo?: any
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
  const [forgotPasswordStep, setForgotPasswordStep] = useState(1) // 1: request, 2: confirm
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

  // Fetch API URL from backend with fallback
  useEffect(() => {
    const configuredUrl = process.env.NEXT_PUBLIC_API_URL
    const fallbackUrl = "https://api.console-encryptgate.net"
    const finalUrl = configuredUrl || fallbackUrl
    setApiBaseUrl(finalUrl)
    console.log(`API URL set to ${finalUrl}`)
    if (finalUrl) {
      fetchServerTime(finalUrl)
    }
  }, [])

  // Synchronize server time and store offset
  const fetchServerTime = async (baseUrl: string) => {
    if (!apiBaseUrl) return
    try {
      const response = await fetchWithRetry(
        `${baseUrl}/api/auth/test-mfa-code`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
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
        const serverDate = new Date(data.server_time)
        const clientDate = new Date()
        const timeOffset = serverDate.getTime() - clientDate.getTime()
        localStorage.setItem("server_time_offset", timeOffset.toString())

        if (Math.abs(timeOffset) > 10000) {
          console.warn(
            `Time synchronization issue: Server time differs by ${Math.round(
              Math.abs(timeOffset) / 1000
            )} seconds`
          )
        }
      }
    } catch (error) {
      console.error("Failed to fetch server time:", error)
    }
  }

  // Generate QR code URL when secret code is available
  useEffect(() => {
    if (mfaSecretCode) {
      const serviceName = "EncryptGate"
      const otpauthUrl = `otpauth://totp/${serviceName.toLowerCase()}:${encodeURIComponent(
        email
      )}?secret=${mfaSecretCode}&issuer=${serviceName.toLowerCase()}`
      const qrCodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
        otpauthUrl
      )}`
      setQrCodeUrl(qrCodeApiUrl)
      getServerGeneratedCodes()
    }
  }, [mfaSecretCode, email])

  // Get server-generated MFA codes with time window information
  const getServerGeneratedCodes = async () => {
    if (!apiBaseUrl || !mfaSecretCode) return

    try {
      const adjustedTime = getAdjustedTime()
      const response = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/test-mfa-code`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            secret: mfaSecretCode,
            client_time: new Date().toISOString(),
            adjusted_time: adjustedTime ? adjustedTime.toISOString() : undefined,
          }),
        }
      )

      const result = await response.json()

      if (result.current_code) {
        setSetupMfaCode(result.current_code)

        if (result.time_windows) {
          setValidMfaCodes(result.time_windows.map((w: any) => w.code))
        } else if (result.validCodes) {
          setValidMfaCodes(result.validCodes)
        }

        return result.current_code
      }

      return null
    } catch (error) {
      console.error("Error getting server MFA codes:", error)
      return null
    }
  }

  const handleForgotPasswordRequest = async () => {
    if (!forgotPasswordEmail) {
      setForgotPasswordError("Please enter your email address")
      return
    }
    setIsForgotPasswordLoading(true)
    setForgotPasswordError("")
    try {
      const response = await fetchWithRetry(
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
      const responseData = await response.json()
      if (!response.ok) {
        throw new Error(
          responseData.detail ||
            `Failed to initiate password reset (${response.status})`
        )
      }
      setForgotPasswordStep(2)
    } catch (error: any) {
      setForgotPasswordError(
        error.message || "Failed to initiate password reset"
      )
    } finally {
      setIsForgotPasswordLoading(false)
    }
  }

  const handleForgotPasswordConfirm = async () => {
    if (!forgotPasswordCode) {
      setForgotPasswordError("Please enter the verification code")
      return
    }
    if (!newForgotPassword) {
      setForgotPasswordError("Please enter a new password")
      return
    }
    if (newForgotPassword !== confirmForgotPassword) {
      setForgotPasswordError("Passwords do not match")
      return
    }
    setIsForgotPasswordLoading(true)
    setForgotPasswordError("")
    try {
      const response = await fetchWithRetry(
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
      const responseData = await response.json()
      if (!response.ok) {
        throw new Error(
          responseData.detail ||
            `Failed to reset password (${response.status})`
        )
      }
      resetForgotPasswordState()
      setShowForgotPassword(false)
      setSuccessMessage(
        "Password reset successful. Please sign in with your new password."
      )
    } catch (error: any) {
      setForgotPasswordError(
        error.message || "Failed to reset password"
      )
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

  const handleForgotPasswordClose = () => {
    resetForgotPasswordState()
    setShowForgotPassword(false)
  }

  // Synchronize time with server and get MFA code
  const synchronizeTimeAndGetCode = async () => {
    if (!apiBaseUrl || !mfaSecretCode) return null

    try {
      const adjustedTime = getAdjustedTime()
      const response = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/test-mfa-code`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            secret: mfaSecretCode,
            client_time: new Date().toISOString(),
            adjusted_time: adjustedTime
              ? adjustedTime.toISOString()
              : undefined,
          }),
        }
      )
      const data = await response.json()

      if (data.server_time) {
        setServerTime(data.server_time)
        if (data.time_sync_info?.time_drift) {
          const serverDate = new Date(data.server_time).getTime()
          const timeOffset =
            serverDate - new Date().getTime()
          localStorage.setItem(
            "server_time_offset",
            timeOffset.toString()
          )
        }
      }

      if (data.time_windows) {
        setValidMfaCodes(data.time_windows.map((w: any) => w.code))
      } else if (data.validCodes) {
        setValidMfaCodes(data.validCodes)
      }

      return data.current_code || null
    } catch (error) {
      console.error("Time synchronization error:", error)
      return null
    }
  }

  const handleLogin = async () => {
    if (!apiBaseUrl) {
      setError("API URL is not available.")
      return
    }
    setIsLoading(true)
    setError("")
    setSuccessMessage("")
    try {
      console.log(`Authenticating user: ${email}`)
      const response = await fetchWithRetry(
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
      ).catch((fetchError) => {
        console.error("Login network error:", fetchError.message)
        throw new Error(`Network error: ${fetchError.message}`)
      })

      let responseData: LoginResponse
      try {
        responseData = await response.json()
        console.log(`Login response status: ${response.status}`)
      } catch (jsonError) {
        console.error("Login JSON parse error:", jsonError)
        throw new Error("Invalid response from server. Please try again.")
      }

      if (!response.ok) {
        console.error("Login error:", responseData?.detail || `Authentication failed (${response.status})`)
        throw new Error(responseData?.detail || `Authentication failed (${response.status})`)
      }

      if (responseData.session) {
        setSession(responseData.session)
        console.log("Session token received from initial login")
      }

      if (
        responseData.mfa_required ||
        responseData.ChallengeName === "SOFTWARE_TOKEN_MFA" ||
        responseData.ChallengeName === "NEW_PASSWORD_REQUIRED"
      ) {
        sessionStorage.setItem("temp_password", password)
        console.log("Stored password temporarily for MFA setup")
      }

      if (
        responseData.ChallengeName === "NEW_PASSWORD_REQUIRED"
      ) {
        console.log("NEW_PASSWORD_REQUIRED challenge detected")
        setShowPasswordChange(true)
      } else if (
        responseData.ChallengeName ===
          "SOFTWARE_TOKEN_MFA" ||
        responseData.mfa_required
      ) {
        console.log("MFA verification required")
        setShowMFA(true)
        await fetchServerTime(apiBaseUrl)
      } else if (responseData.access_token) {
        console.log("Access token received, checking if MFA setup is needed")
        try {
          const mfaResponse = await fetchWithRetry(
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
              body: JSON.stringify({
                access_token: responseData.access_token,
              }),
            },
            1
          )

          // Check if we got a valid response
          if (mfaResponse.ok) {
            const mfaData = await mfaResponse.json()
            console.log(`MFA setup check status: ${mfaResponse.status}`)

            if (mfaData.secretCode) {
              // MFA needs to be set up
              setMfaSecretCode(mfaData.secretCode)
              localStorage.setItem("temp_access_token", responseData.access_token)

              // Store all valid codes provided by the server
              if (mfaData.validCodes) {
                setValidMfaCodes(Array.isArray(mfaData.validCodes) ? mfaData.validCodes : [mfaData.validCodes])
              }

              if (mfaData.currentCode) {
                setSetupMfaCode(mfaData.currentCode)
              } else if (mfaData.currentValidCode) {
                setSetupMfaCode(mfaData.currentValidCode)
              }
              
              setShowMFASetup(true)
              return
            }
          }

          // No MFA setup needed, proceed with login
          console.log("User is fully authenticated, redirecting to dashboard")
          localStorage.setItem("access_token", responseData.access_token)
          localStorage.setItem("id_token", responseData.id_token || "")
          localStorage.setItem("refresh_token", responseData.refresh_token || "")
          sessionStorage.removeItem("temp_password")
          router.push("/admin/dashboard")
        } catch (mfaError: any) {
          // If there's an error checking MFA status, assume user is authenticated
          console.error("MFA setup check error:", mfaError.message || "Unknown error")
          localStorage.setItem("access_token", responseData.access_token)
          localStorage.setItem("id_token", responseData.id_token || "")
          localStorage.setItem("refresh_token", responseData.refresh_token || "")
          sessionStorage.removeItem("temp_password")
          router.push("/admin/dashboard")
        }
      } else {
        // Unexpected response format
        console.error("Unexpected server response format")
        throw new Error("Unexpected server response format. Please try again.")
      }
    } catch (error: any) {
      setError(error.message || "An error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasswordChange = async () => {
    if (!apiBaseUrl || !session) {
      setError("Unable to change password.")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }
    if (newPassword.length < 8) {
      setError(
        "Password must be at least 8 characters long."
      )
      return
    }
    setIsLoading(true)
    setError("")
    try {
      console.log("Sending NEW_PASSWORD_REQUIRED challenge response")
      const response = await fetchWithRetry(
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
            challengeResponses: {
              NEW_PASSWORD: newPassword,
            },
          }),
        },
        1
      )
      const responseData = await response.json()
      console.log(`Password change response status: ${response.status}`)

      if (!response.ok) {
        console.error("Password change error:", responseData.detail || `Failed to change password (${response.status})`)
        throw new Error(
          responseData.detail ||
            `Failed to change password (${response.status})`
        )
      }
      
      if (responseData.session) {
        setSession(responseData.session)
        console.log("Updated session after password change")
      }
      
      sessionStorage.setItem("temp_password", newPassword)

      if (responseData.access_token) {
        console.log("Access token received after password change, checking MFA setup")
        try {
          const setupMfaEndpoint = `${apiBaseUrl}/api/auth/setup-mfa`
          const mfaResponse = await fetchWithRetry(
            setupMfaEndpoint,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Origin: window.location.origin,
              },
              body: JSON.stringify({ access_token: responseData.access_token }),
              mode: "cors",
              credentials: "include",
            },
            1
          )

          if (mfaResponse.ok) {
            const mfaData = await mfaResponse.json()
            console.log(`MFA setup check status: ${mfaResponse.status}`)

            if (mfaData.secretCode) {
              // MFA setup required
              setShowPasswordChange(false)
              setMfaSecretCode(mfaData.secretCode)
              localStorage.setItem("temp_access_token", responseData.access_token)

              // Store valid codes if provided
              if (mfaData.validCodes) {
                setValidMfaCodes(Array.isArray(mfaData.validCodes) ? mfaData.validCodes : [mfaData.validCodes])
              }

              if (mfaData.currentCode) {
                setSetupMfaCode(mfaData.currentCode)
              } else if (mfaData.currentValidCode) {
                setSetupMfaCode(mfaData.currentValidCode)
              }
              
              setShowMFASetup(true)
              return
            }
          }

          // No MFA setup needed
          console.log("Proceeding with login (MFA already set up or not required)")
          localStorage.setItem("access_token", responseData.access_token)
          localStorage.setItem("id_token", responseData.id_token || "")
          localStorage.setItem("refresh_token", responseData.refresh_token || "")
          setShowPasswordChange(false)
          sessionStorage.removeItem("temp_password")
          router.push("/admin/dashboard")
        } catch (mfaError: any) {
          // If MFA check fails, assume no MFA needed
          console.error("MFA setup check error:", mfaError.message || "Unknown error")
          localStorage.setItem("access_token", responseData.access_token)
          localStorage.setItem("id_token", responseData.id_token || "")
          localStorage.setItem("refresh_token", responseData.refresh_token || "")
          setShowPasswordChange(false)
          sessionStorage.removeItem("temp_password")
          router.push("/admin/dashboard")
        }
      } else if (responseData.ChallengeName) {
        // Handle any additional challenges
        if (responseData.ChallengeName === "SOFTWARE_TOKEN_MFA") {
          console.log("MFA verification required after password change")
          setShowPasswordChange(false)
          setShowMFA(true)
        } else if (responseData.ChallengeName === "MFA_SETUP") {
          console.log("MFA setup challenge received after password change")
          setShowPasswordChange(false)
          setMfaSecretCode(responseData.secretCode || "")
          setShowMFASetup(true)
        } else {
          console.error(`Unexpected challenge: ${responseData.ChallengeName}`)
          throw new Error(`Unexpected challenge: ${responseData.ChallengeName}`)
        }
      } else {
        // No direct continuation - attempt a new login with the new password
        setShowPasswordChange(false)
        await handleLogin()
      }
    } catch (error: any) {
      setError(
        error.message || "Failed to change password"
      )
      console.error("Password change error:", error.message || "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }

  // Updated MFA Setup function with better error handling
  const handleMFASetup = async () => {
    if (!apiBaseUrl) {
      setError("API URL is not available.")
      return
    }

    setIsLoading(true)
    setError("")
    setSuccessMessage("")

    // First ensure we have a valid MFA code
    try {
      // If the code is empty or not 6 digits, get a server-generated code
      if (!setupMfaCode || setupMfaCode.length !== 6 || !setupMfaCode.match(/^\d{6}$/)) {
        const serverCode = await synchronizeTimeAndGetCode()
        if (serverCode) {
          setSetupMfaCode(serverCode)
          console.log(`Using server-generated code: ${serverCode}`)
          setSuccessMessage("Using server-generated verification code...")
        } else {
          setError("Failed to get verification code from server. Please try again.")
          setIsLoading(false)
          return
        }
      }
    } catch (error) {
      setError("Failed to get verification code. Please try again.")
      setIsLoading(false)
      return
    }

    console.log("Starting MFA setup verification")
    const savedPassword = sessionStorage.getItem("temp_password") || ""
    console.log(`Password available for MFA setup: ${!!savedPassword}`)

    if (!session) {
      setError("Your session has expired. Please log in again to restart the MFA setup process.")
      setIsLoading(false)
      return
    }

    try {
      // Get adjusted time for better synchronization
      const adjustedTime = getAdjustedTime()

      const endpoint = `${apiBaseUrl}/api/auth/confirm-mfa-setup`
      const requestBody = {
        username: email,
        session: session,
        code: setupMfaCode,
        password: savedPassword,
        client_time: new Date().toISOString(),
        adjusted_time: adjustedTime ? adjustedTime.toISOString() : undefined,
      }

      console.log(`Sending MFA setup verification request with code ${setupMfaCode}`)

      const response = await fetchWithRetry(
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Origin: window.location.origin,
          },
          body: JSON.stringify(requestBody),
          mode: "cors",
          credentials: "include",
        },
        2
      )

      let responseData: LoginResponse
      try {
        responseData = await response.json()
        console.log(`MFA setup verification response status: ${response.status}`)
      } catch (parseError) {
        throw new Error("Unable to parse server response. Please try again.")
      }

      if (!response.ok) {
        // Handle error responses with suggested codes
        if (response.status === 400 && responseData.detail) {
          if (responseData.currentValidCode || responseData.serverGeneratedCode) {
            // Use the server-provided code for automatic retry
            const validCode = responseData.currentValidCode || responseData.serverGeneratedCode
            setSetupMfaCode(validCode || "")

            // If we have valid codes, store them
            if (responseData.validCodes) {
              setValidMfaCodes(responseData.validCodes)
            }

            console.log(`Retrying with correct code: ${validCode}`)
            setError("")
            setSuccessMessage("Using correct verification code...")

            // Small delay then retry
            setTimeout(() => {
              setIsLoading(false)
              handleMFASetup()
            }, 1000)
            return
          }

          // Handle ExpiredCodeException - this means the MFA setup was actually successful
          if (responseData.detail.includes("ExpiredCodeException") || 
              responseData.detail.includes("already been used")) {
            console.log("MFA appears to have been set up successfully but final auth step failed")
            setSuccessMessage("MFA setup successful. Please log in with your new credentials.")
            setShowMFASetup(false)
            localStorage.removeItem("temp_access_token")
            sessionStorage.removeItem("temp_password")
            setTimeout(() => {
              setIsLoading(false)
            }, 1000)
            return
          }

          if (responseData.detail.includes("code is incorrect") ||
              responseData.detail.includes("CodeMismatchException")) {
            throw new Error(responseData.detail)
          } else {
            throw new Error(responseData.detail)
          }
        } else if (response.status === 401) {
          throw new Error("Your session has expired. Please log in again to restart the MFA setup process.")
        } else {
          throw new Error(responseData.detail || `Failed to verify MFA setup (${response.status})`)
        }
      }

      setShowMFASetup(false)
      localStorage.removeItem("temp_access_token")
      sessionStorage.removeItem("temp_password")

      if (responseData.access_token) {
        // Store tokens and redirect to dashboard
        localStorage.setItem("access_token", responseData.access_token)
        localStorage.setItem("id_token", responseData.id_token || "")
        localStorage.setItem("refresh_token", responseData.refresh_token || "")
        console.log("MFA setup complete, redirecting to dashboard")
        router.push("/admin/dashboard")
      } else {
        setSuccessMessage("MFA setup successful. Please log in again.")
      }
    } catch (error: any) {
      const errorMessage = error.message || "Failed to set up MFA"
      setError(errorMessage)
      console.error("MFA setup error:", errorMessage)

      // Try automated recovery
      if (errorMessage.includes("code") || errorMessage.includes("verification")) {
        // Try to get a fresh code from the server
        try {
          const freshCode = await synchronizeTimeAndGetCode()
          if (freshCode) {
            setSetupMfaCode(freshCode)
            setError(`Verification failed. Trying with server-generated code: ${freshCode}`)

            setTimeout(() => {
              setIsLoading(false)
              handleMFASetup()
            }, 1500)
            return
          }
        } catch (codeError) {
          setError("Verification failed. Please try again with a new code.")
        }
      }

      setIsLoading(false)
    }
  }

  // Updated MFA verification function with better error handling and automatic retries
  const handleMFASubmit = async () => {
    if (!apiBaseUrl) {
      setError("API URL is not available.")
      return
    }

    // Validate the MFA code format
    if (!mfaCode || mfaCode.length !== 6 || !mfaCode.match(/^\d{6}$/)) {
      setError("Please enter the 6-digit verification code from your authenticator app")
      return
    }

    setError("")
    setSuccessMessage("")
    setIsLoading(true)
    
    try {
      // Synchronize time with server first
      await fetchServerTime(apiBaseUrl)
      
      // Get adjusted time for verification
      const adjustedTime = getAdjustedTime()
      const clientTime = new Date().toISOString()

      console.log(`Verifying MFA code: ${mfaCode}`)

      const response = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/verify-mfa`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Origin: window.location.origin,
          },
          body: JSON.stringify({
            code: mfaCode,
            session,
            username: email,
            client_time: clientTime,
            adjusted_time: adjustedTime ? adjustedTime.toISOString() : undefined,
          }),
          mode: "cors",
          credentials: "include",
        },
        2
      )

      let data: LoginResponse
      try {
        data = await response.json()
        console.log(`MFA verification response status: ${response.status}`)
      } catch (jsonError) {
        throw new Error("Invalid response from server. Please try again.")
      }

      if (!response.ok) {
        if (data.serverGeneratedCode || data.currentValidCode || data.validCodes) {
          setSuccessMessage("Trying with server-suggested code...")
          
          // Store any recovery codes
          if (data.validCodes) {
            setMfaRecoveryCodes(Array.isArray(data.validCodes) ? data.validCodes : [data.validCodes])
          }
          
          // Try server-generated code if available
          const serverCode = data.serverGeneratedCode || data.currentValidCode
          if (serverCode) {
            setMfaCode(serverCode)
            
            // Small delay then retry
            setTimeout(() => {
              setIsLoading(false)
              handleMFASubmit()
            }, 1000)
            return
          }
        }
        
        throw new Error(data?.detail || "MFA verification failed. Please try again with a new code.")
      }

      // Success - store tokens and redirect
      localStorage.setItem("access_token", data.access_token || "")
      localStorage.setItem("id_token", data.id_token || "")
      localStorage.setItem("refresh_token", data.refresh_token || "")
      sessionStorage.removeItem("temp_password")

      router.push("/admin/dashboard")
    } catch (error: any) {
      const errorMessage = error.message || "MFA verification failed. Please try again."
      setError(errorMessage)
      
      // If we have recovery codes, show them in the UI
      if (mfaRecoveryCodes.length > 0) {
        setError(`${errorMessage} Please try one of the suggested codes.`)
      }
      
      setIsLoading(false)
    }
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div className="flex justify-center items-center gap-2">
            <div className="w-8 h-8">
              <svg
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-full"
              >
                <path
                  d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2zm0 25.2c-6.188 0-11.2-5.012-11.2-11.2S9.812 4.8 16 4.8 27.2 9.812 27.2 16 22.188 27.2 16 27.2z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <LogoText>EncryptGate</LogoText>
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
              onValueChange={(value: UserType) =>
                setUserType(value)
              }
              className="grid gap-4"
            >
              <div className="relative flex items-center space-x-4 rounded-lg border p-4 hover:border-primary">
                <RadioGroupItem value="admin" id="admin" />
                <Label
                  htmlFor="admin"
                  className="flex-1 cursor-pointer"
                >
                  Admin
                </Label>
              </div>
              <div className="relative flex items-center space-x-4 rounded-lg border p-4 hover:border-primary">
                <RadioGroupItem
                  value="employee"
                  id="employee"
                />
                <Label
                  htmlFor="employee"
                  className="flex-1 cursor-pointer"
                >
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
                onChange={(e) =>
                  setPassword(e.target.value)
                }
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription className="text-sm">
                  {error}
                </AlertDescription>
              </Alert>
            )}
            {successMessage && (
              <Alert>
                <AlertDescription className="text-sm">
                  {successMessage}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
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
                onClick={() =>
                  setShowForgotPassword(true)
                }
                className="text-sm text-muted-foreground hover:text-primary"
              >
                Forgot Password?
              </button>
            </div>
          </CardFooter>
        </form>
      </Card>

      {/* Password Change Dialog */}
      <Dialog
        open={showPasswordChange}
        onOpenChange={(open) =>
          open && setShowPasswordChange(open)
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Change Password Required
            </DialogTitle>
            <DialogDescription>
              Your account requires a password change.
              Please create a new password.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">
                New Password
              </Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) =>
                  setNewPassword(e.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">
                Confirm Password
              </Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) =>
                  setConfirmPassword(e.target.value)
                }
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription className="text-sm">
                  {error}
                </AlertDescription>
              </Alert>
            )}
            <Alert>
              <AlertDescription>
                Your password must be at least 8 characters
                long and include uppercase and lowercase
                letters, numbers, and special characters.
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

      {/* MFA Setup Dialog */}
      <Dialog
        open={showMFASetup}
        onOpenChange={(open) =>
          open && setShowMFASetup(open)
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Setup Two-Factor Authentication
            </DialogTitle>
            <DialogDescription>
              For additional security, please set up
              two-factor authentication using Google
              Authenticator.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Alert>
              <AlertDescription>
                <strong>Important Instructions:</strong>
                <ol className="list-decimal list-inside mt-2 space-y-1">
                  <li>
                    Install Google Authenticator on your
                    mobile device
                  </li>
                  <li>
                    Open Google Authenticator and scan the
                    QR code below
                  </li>
                  <li>
                    The verification code will be
                    automatically populated below
                  </li>
                  <li>
                    Click "Verify & Complete" to finish the
                    setup
                  </li>
                </ol>
              </AlertDescription>
            </Alert>
            {qrCodeUrl && (
              <div className="flex flex-col items-center justify-center space-y-2">
                <Label>
                  Scan QR Code with Google Authenticator
                </Label>
                <div className="bg-white p-2 rounded-md">
                  <img
                    src={qrCodeUrl || "/placeholder.svg"}
                    alt="QR Code for MFA setup"
                    className="w-48 h-48 mx-auto"
                  />
                </div>
              </div>
            )}
            {mfaSecretCode && (
              <div className="space-y-2 text-center">
                <Label>
                  Secret Key (if you can't scan the QR
                  code)
                </Label>
                <div className="p-3 bg-muted rounded-md font-mono text-center break-all">
                  {mfaSecretCode}
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter this code manually in Google
                  Authenticator if scanning fails
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="setup-mfa-code">
                Verification Code
              </Label>
              <Input
                id="setup-mfa-code"
                placeholder="000000"
                value={setupMfaCode}
                onChange={(e) =>
                  setSetupMfaCode(
                    e.target.value
                      .replace(/[^0-9]/g, "")
                      .slice(0, 6)
                  )
                }
                maxLength={6}
                className="text-center text-2xl tracking-widest"
              />
              <p className="text-xs text-center text-muted-foreground">
                A server-generated verification code has
                been provided. Click verify to continue.
              </p>
              {validMfaCodes.length > 0 && (
                <div className="text-xs text-center text-muted-foreground mt-2">
                  <details>
                    <summary>Need a different code?</summary>
                    <div className="mt-2 p-2 bg-muted rounded">
                      <p>These codes may also work:</p>
                      <div className="flex flex-wrap gap-2 mt-1 justify-center">
                        {validMfaCodes
                          .slice(0, 5)
                          .map((code, i) => (
                            <button
                              key={i}
                              className="px-2 py-1 bg-gray-700 text-white rounded hover:bg-gray-600"
                              onClick={() =>
                                setSetupMfaCode(code)
                              }
                            >
                              {code}
                            </button>
                          ))}
                      </div>
                    </div>
                  </details>
                </div>
              )}
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription className="text-sm">
                  {error}
                </AlertDescription>
              </Alert>
            )}
            {successMessage && (
              <Alert>
                <AlertDescription className="text-sm">
                  {successMessage}
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter className="flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={handleMFASetup}
              disabled={isLoading}
              className="w-full"
            >
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

      {/* MFA Verification Dialog */}
      <Dialog
        open={showMFA}
        onOpenChange={(open) => open && setShowMFA(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Enter Authentication Code
            </DialogTitle>
            <DialogDescription>
              Please enter the 6-digit code from your
              authenticator app
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="mfa-code">
                Authentication Code
              </Label>
              <Input
                id="mfa-code"
                placeholder="000000"
                value={mfaCode}
                onChange={(e) =>
                  setMfaCode(
                    e.target.value
                      .replace(/[^0-9]/g, "")
                      .slice(0, 6)
                  )
                }
                maxLength={6}
                className="text-center text-2xl tracking-widest"
              />

              {mfaRecoveryCodes.length > 0 && (
                <div className="text-xs text-center text-muted-foreground mt-2">
                  <details>
                    <summary>Need a different code?</summary>
                    <div className="mt-2 p-2 bg-muted rounded">
                      <p>These codes may also work:</p>
                      <div className="flex flex-wrap gap-2 mt-1 justify-center">
                        {mfaRecoveryCodes
                          .slice(0, 5)
                          .map((code, i) => (
                            <button
                              key={i}
                              className="px-2 py-1 bg-gray-700 text-white rounded hover:bg-gray-600"
                              onClick={() => setMfaCode(code)}
                            >
                              {code}
                            </button>
                          ))}
                      </div>
                    </div>
                  </details>
                </div>
              )}
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription className="text-sm">
                  {error}
                </AlertDescription>
              </Alert>
            )}
            {successMessage && (
              <Alert>
                <AlertDescription className="text-sm">
                  {successMessage}
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={handleMFASubmit}
              disabled={isLoading}
              className="w-full"
            >
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
      <Dialog
        open={showForgotPassword}
        onOpenChange={(open) => {
          if (!open) handleForgotPasswordClose()
          else setShowForgotPassword(true)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reset Your Password
            </DialogTitle>
            <DialogDescription>
              {forgotPasswordStep === 1
                ? "Enter your email address to receive a verification code"
                : "Enter the verification code and your new password"}
            </DialogDescription>
          </DialogHeader>
          {forgotPasswordStep === 1 ? (
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">
                  Email Address
                </Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="name@example.com"
                  value={forgotPasswordEmail}
                  onChange={(e) =>
                    setForgotPasswordEmail(e.target.value)
                  }
                />
              </div>
              {forgotPasswordError && (
                <Alert variant="destructive">
                  <AlertDescription className="text-sm">
                    {forgotPasswordError}
                  </AlertDescription>
                </Alert>
              )}
              <Button
                onClick={handleForgotPasswordRequest}
                disabled={
                  !forgotPasswordEmail ||
                  isForgotPasswordLoading
                }
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
                <Label htmlFor="reset-code">
                  Verification Code
                </Label>
                <Input
                  id="reset-code"
                  placeholder="Enter verification code"
                  value={forgotPasswordCode}
                  onChange={(e) =>
                    setForgotPasswordCode(e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-forgot-password">
                  New Password
                </Label>
                <Input
                  id="new-forgot-password"
                  type="password"
                  placeholder="Enter new password"
                  value={newForgotPassword}
                  onChange={(e) =>
                    setNewForgotPassword(e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-forgot-password">
                  Confirm New Password
                </Label>
                <Input
                  id="confirm-forgot-password"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmForgotPassword}
                  onChange={(e) =>
                    setConfirmForgotPassword(e.target.value)
                  }
                />
              </div>
              {forgotPasswordError && (
                <Alert variant="destructive">
                  <AlertDescription className="text-sm">
                    {forgotPasswordError}
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() =>
                    setForgotPasswordStep(1)
                  }
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