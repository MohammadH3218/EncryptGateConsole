"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { LogoText } from "@/components/ui/logo-text";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

type UserType = "admin" | "employee";

interface AuthResponse {
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  email?: string;
  detail?: string;
  ChallengeName?: string;
  mfa_required?: boolean;
  session?: string;
  message?: string;
  secretCode?: string;
}

export default function LoginPage() {
  const router = useRouter();
  
  // Basic login state
  const [userType, setUserType] = useState<UserType>("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [session, setSession] = useState("");
  
  // MFA state
  const [showMFA, setShowMFA] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  
  // MFA setup state
  const [showMFASetup, setShowMFASetup] = useState(false);
  const [mfaSecretCode, setMfaSecretCode] = useState("");
  const [setupMfaCode, setSetupMfaCode] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  
  // Handle login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }
    
    setIsLoading(true);
    setError("");
    
    try {
      console.log("Attempting to login with:", email);
      
      // Call authentication API - making direct call to backend
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.console-encryptgate.net';
      const response = await fetch(`${apiBaseUrl}/api/auth/authenticate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": window.location.origin
        },
        body: JSON.stringify({ username: email, password }),
        credentials: "include"
      });
      
      console.log("Login response status:", response.status);
      
      const data: AuthResponse = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || `Authentication failed with status ${response.status}`);
      }
      
      console.log("Login response data keys:", Object.keys(data));
      
      // Handle different authentication flows
      if (data.ChallengeName === "NEW_PASSWORD_REQUIRED") {
        // Password change required
        setSession(data.session || "");
        setShowPasswordChange(true);
      } else if (data.mfa_required) {
        // MFA verification required
        setSession(data.session || "");
        setShowMFA(true);
      } else if (data.access_token) {
        // Successfully authenticated
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("id_token", data.id_token || "");
        localStorage.setItem("refresh_token", data.refresh_token || "");
        
        // Redirect to dashboard
        redirectToDashboard();
      } else {
        throw new Error("Unexpected response format");
      }
    } catch (error: any) {
      console.error("Login error:", error);
      setError(error.message || "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };
  
  // Generate QR code URL for MFA setup
  const generateQRCode = (secretCode: string) => {
    const serviceName = "EncryptGate";
    const otpauthUrl = `otpauth://totp/${serviceName}:${encodeURIComponent(email)}?secret=${secretCode}&issuer=${serviceName}`;
    const qrCodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`;
    setQrCodeUrl(qrCodeApiUrl);
  };
  
  // Handle password change
  const handlePasswordChange = async () => {
    if (!newPassword || !confirmPassword) {
      setError("Both password fields are required");
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    
    setIsLoading(true);
    setError("");
    
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.console-encryptgate.net';
      const response = await fetch(`${apiBaseUrl}/api/auth/respond-to-challenge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": window.location.origin
        },
        body: JSON.stringify({
          username: email,
          session: session,
          challengeName: "NEW_PASSWORD_REQUIRED",
          challengeResponses: {
            "NEW_PASSWORD": newPassword
          }
        }),
        credentials: "include"
      });
      
      const data: AuthResponse = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || "Failed to change password");
      }
      
      // Password changed successfully
      if (data.access_token) {
        // Store tokens
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("id_token", data.id_token || "");
        localStorage.setItem("refresh_token", data.refresh_token || "");
        
        // Close password change dialog
        setShowPasswordChange(false);
        
        // Check if MFA setup is needed
        if (data.mfa_required) {
          setSession(data.session || "");
          setShowMFA(true);
        } else {
          // Redirect to dashboard
          redirectToDashboard();
        }
      } else if (data.ChallengeName === "SOFTWARE_TOKEN_MFA") {
        // MFA verification needed
        setSession(data.session || "");
        setShowPasswordChange(false);
        setShowMFA(true);
      } else {
        throw new Error("Unexpected response format");
      }
    } catch (error: any) {
      setError(error.message || "Failed to change password");
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle MFA verification
  const handleMFAVerify = async () => {
    if (!mfaCode) {
      setError("Verification code is required");
      return;
    }
    
    setIsLoading(true);
    setError("");
    
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.console-encryptgate.net';
      const response = await fetch(`${apiBaseUrl}/api/auth/verify-mfa`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": window.location.origin
        },
        body: JSON.stringify({
          username: email,
          session: session,
          code: mfaCode
        }),
        credentials: "include"
      });
      
      const data: AuthResponse = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || "Failed to verify MFA code");
      }
      
      // MFA verified successfully
      localStorage.setItem("access_token", data.access_token || "");
      localStorage.setItem("id_token", data.id_token || "");
      localStorage.setItem("refresh_token", data.refresh_token || "");
      
      // Close MFA dialog and redirect
      setShowMFA(false);
      redirectToDashboard();
    } catch (error: any) {
      setError(error.message || "Failed to verify MFA code");
      // Clear the code field for retry
      setMfaCode("");
    } finally {
      setIsLoading(false);
    }
  };
  
  // Redirect to dashboard
  const redirectToDashboard = () => {
    router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard");
  };

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
          <CardTitle className="text-2xl font-bold text-center">Sign in</CardTitle>
          <CardDescription className="text-center">
            Choose your account type to access the security dashboard
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-6">
            <RadioGroup
              value={userType}
              onValueChange={(value: UserType) => setUserType(value)}
              className="grid gap-4"
            >
              <div className="relative flex items-center space-x-4 rounded-lg border p-4 hover:border-primary">
                <RadioGroupItem value="admin" id="admin" />
                <Label htmlFor="admin" className="flex-1 cursor-pointer">Admin</Label>
              </div>
              <div className="relative flex items-center space-x-4 rounded-lg border p-4 hover:border-primary">
                <RadioGroupItem value="employee" id="employee" />
                <Label htmlFor="employee" className="flex-1 cursor-pointer">Employee</Label>
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
          </CardContent>
          <CardFooter>
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

      {/* Password Change Dialog */}
      <Dialog open={showPasswordChange} onOpenChange={setShowPasswordChange}>
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
                Your password must be at least 8 characters long and include uppercase and lowercase letters, numbers, and special characters.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button 
              onClick={handlePasswordChange} 
              disabled={isLoading || !newPassword || !confirmPassword}
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

      {/* MFA Verification Dialog */}
      <Dialog open={showMFA} onOpenChange={setShowMFA}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Authentication Code</DialogTitle>
            <DialogDescription>
              Please enter the 6-digit code from your authenticator app
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="mfa-code">Authentication Code</Label>
              <Input
                id="mfa-code"
                placeholder="000000"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                maxLength={6}
                className="text-center text-2xl tracking-widest"
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button 
              onClick={handleMFAVerify} 
              disabled={mfaCode.length !== 6 || isLoading}
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
    </div>
  );
}