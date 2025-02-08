"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { LogoText } from "@/components/ui/logo-text"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { login } from "@/lib/auth"

type UserType = "admin" | "employee"

interface LoginCredentials {
  email: string
  password: string
  userType: UserType
}

export default function LoginPage() {
  const router = useRouter()
  const [userType, setUserType] = useState<UserType>("admin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [showMFA, setShowMFA] = useState(false)
  const [mfaCode, setMfaCode] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const validateCredentials = async (credentials: LoginCredentials) => {
    // TODO: Implement your backend validation here
    // This is a mock implementation
    return new Promise<boolean>((resolve) => {
      setTimeout(() => {
        resolve(true)
      }, 1000)
    })
  }

  const verifyMFACode = async (code: string) => {
    // TODO: Implement your MFA verification here
    // This is a mock implementation
    return new Promise<boolean>((resolve) => {
      setTimeout(() => {
        resolve(code.length === 6)
      }, 1000)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const credentials: LoginCredentials = {
        email,
        password,
        userType,
      }

      const isValid = await validateCredentials(credentials)

      if (isValid) {
        setShowMFA(true)
      } else {
        setError("Invalid email or password")
      }
    } catch (error) {
      setError("An error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleMFASubmit = async () => {
    setIsLoading(true)
    setError("")

    try {
      const isValid = await verifyMFACode(mfaCode)

      if (isValid) {
        login(email, userType)
        router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard")
      } else {
        setError("Invalid MFA code")
      }
    } catch (error) {
      setError("An error occurred. Please try again.")
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
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                <path
                  d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2zm0 25.2c-6.188 0-11.2-5.012-11.2-11.2S9.812 4.8 16 4.8 27.2 9.812 27.2 16 22.188 27.2 16 27.2z"
                  fill="currentColor"
                />
                <path
                  d="M16 7.6c-4.632 0-8.4 3.768-8.4 8.4s3.768 8.4 8.4 8.4 8.4-3.768 8.4-8.4-3.768-8.4-8.4-8.4zm0 14c-3.08 0-5.6-2.52-5.6-5.6s2.52-5.6 5.6-5.6 5.6 2.52 5.6 5.6-2.52 5.6-5.6 5.6z"
                  fill="currentColor"
                />
                <path
                  d="M16 12.8c-1.76 0-3.2 1.44-3.2 3.2s1.44 3.2 3.2 3.2 3.2-1.44 3.2-3.2-1.44-3.2-3.2-3.2z"
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
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            <RadioGroup value={userType} onValueChange={(value: UserType) => setUserType(value)} className="grid gap-4">
              <div className="relative flex items-center space-x-4 rounded-lg border p-4 hover:border-primary">
                <RadioGroupItem value="admin" id="admin" />
                <Label htmlFor="admin" className="flex-1 cursor-pointer">
                  <div className="font-semibold">Admin</div>
                  <div className="text-sm text-muted-foreground">
                    Account owner that performs tasks requiring unrestricted access
                  </div>
                </Label>
              </div>
              <div className="relative flex items-center space-x-4 rounded-lg border p-4 hover:border-primary">
                <RadioGroupItem value="employee" id="employee" />
                <Label htmlFor="employee" className="flex-1 cursor-pointer">
                  <div className="font-semibold">Employee</div>
                  <div className="text-sm text-muted-foreground">
                    User within the organization that performs daily tasks
                  </div>
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
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Please wait..." : "Sign In"}
            </Button>
            <p className="text-sm text-muted-foreground text-center px-6">
              By continuing, you agree to the Terms of Service and Privacy Policy
            </p>
          </CardFooter>
        </form>
      </Card>

      <Dialog open={showMFA} onOpenChange={setShowMFA}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Authentication Code</DialogTitle>
            <DialogDescription>Please enter the 6-digit code sent to your authenticator app</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="mfa-code">Authentication Code</Label>
              <Input
                id="mfa-code"
                placeholder="000000"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.slice(0, 6))}
                maxLength={6}
                className="text-center text-2xl tracking-widest"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleMFASubmit} disabled={mfaCode.length !== 6 || isLoading}>
              {isLoading ? "Verifying..." : "Verify"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

