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
  error?: string;
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
      // Call authentication API
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: email, password }),
      });
      
      const data: AuthResponse = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to authenticate");
      }
      
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
        // Successfully authenticated, check if MFA setup is needed
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("id_token", data.id_token || "");
        localStorage.setItem("refresh_token", data.refresh_token || "");
        
        // Check if MFA setup is needed
        try {
          const mfaResponse = await fetch("/api/auth/setup-mfa", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ access_token: data.access_token }),
          });
          
          const mfaData: AuthResponse = await mfaResponse.json();
          
          if (mfaResponse.ok && mfaData.secretCode) {
            // MFA setup is needed
            setMfaSecretCode(mfaData.secretCode);
            generateQRCode(mfaData.secretCode);
            setShowMFASetup(true);
          } else {
            // MFA is already set up or not required
            redirectToDashboard();
          }
        } catch (mfaError) {
          // If MFA check fails, continue with login
          console.error("MFA setup check failed:", mfaError);
          redirectToDashboard();
        }
      } else {
        throw new Error("Unexpected response format");
      }
    } catch (error: any) {
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
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: email,
          session,
          new_password: newPassword
        }),
      });
      
      const data: AuthResponse = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to change password");
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
        try {
          const mfaResponse = await fetch("/api/auth/setup-mfa", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ access_token: data.access_token }),
          });
          
          const mfaData: AuthResponse = await mfaResponse.json();
          
          if (mfaResponse.ok && mfaData.secretCode) {
            // MFA setup is needed
            setMfaSecretCode(mfaData.secretCode);
            generateQRCode(mfaData.secretCode);
            setShowMFASetup(true);
          } else {
            // MFA is already set up or not required
            redirectToDashboard();
          }
        } catch (mfaError) {
          // If MFA check fails, continue with login
          console.error("MFA setup check failed:", mfaError);
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
      const response = await fetch("/api/auth/verify-mfa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: email,
          session,
          code: mfaCode
        }),
      });
      
      const data: AuthResponse = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to verify MFA code");
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
  
  // Handle MFA setup verification
  const handleMFASetup = async () => {
    if (!setupMfaCode) {
      setError("Verification code is required");
      return;
    }
    
    setIsLoading(true);
    setError("");
    
    try {
      const accessToken = localStorage.getItem("access_token");
      
      if (!accessToken) {
        throw new Error("Authentication session expired");
      }
      
      const response = await fetch("/api/auth/verify-mfa-setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          access_token: accessToken,
          code: setupMfaCode
        }),
      });
      
      const data: AuthResponse = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to verify MFA setup");
      }
      
      // MFA setup verified successfully
      setShowMFASetup(false);
      redirectToDashboard();
    } catch (error: any) {
      setError(error.message || "Failed to verify MFA setup");
      // Clear the code field for retry
      setSetupMfaCode("");
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

      {/* MFA Setup Dialog */}
      <Dialog open={showMFASetup} onOpenChange={setShowMFASetup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setup Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              For additional security, please set up two-factor authentication using an authenticator app.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Alert>
              <AlertDescription>
                1. Install an authenticator app like Google Authenticator or Authy on your mobile device.
                <br />
                2. Scan the QR code or enter the secret key in your app.
                <br />
                3. Enter the 6-digit code from your authenticator app below.
              </AlertDescription>
            </Alert>
            
            {qrCodeUrl && (
              <div className="flex flex-col items-center justify-center space-y-2">
                <Label>Scan QR Code</Label>
                <div className="bg-white p-2 rounded-md">
                  <img 
                    src={qrCodeUrl} 
                    alt="QR Code for MFA setup" 
                    className="w-48 h-48 mx-auto"
                  />
                </div>
              </div>
            )}
            
            {mfaSecretCode && (
              <div className="space-y-2 text-center">
                <Label>Secret Key</Label>
                <div className="p-3 bg-muted rounded-md font-mono text-center break-all">
                  {mfaSecretCode}
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter this code manually if you cannot scan the QR code
                </p>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="setup-mfa-code">Authentication Code</Label>
              <Input
                id="setup-mfa-code"
                placeholder="000000"
                value={setupMfaCode}
                onChange={(e) => setSetupMfaCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
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
              onClick={handleMFASetup} 
              disabled={setupMfaCode.length !== 6 || isLoading}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify & Complete Setup"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}