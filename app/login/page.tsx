"use client";

import { useState, useEffect } from "react";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

type UserType = "admin" | "employee";

interface LoginResponse {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  mfa_required?: boolean;
  ChallengeName?: string;
  session?: string;
  email?: string;
  role?: string;
  detail?: string;
  secretCode?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [userType, setUserType] = useState<UserType>("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  
  // MFA verification states
  const [showMFA, setShowMFA] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  
  // Password change states
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // MFA setup states
  const [showMFASetup, setShowMFASetup] = useState(false);
  const [mfaSecretCode, setMfaSecretCode] = useState("");
  const [setupMfaCode, setSetupMfaCode] = useState("");
  
  const [session, setSession] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null);

  // Fetch API URL from the backend with fallback
  useEffect(() => {
    const configuredUrl = process.env.NEXT_PUBLIC_API_URL;
    console.log("Frontend API URL from env:", configuredUrl);
    
    // Use the configured URL or fall back to the correct API URL
    const fallbackUrl = "https://api.console-encryptgate.net";
    const finalUrl = configuredUrl || fallbackUrl;
    
    setApiBaseUrl(finalUrl);
    
    if (!configuredUrl) {
      console.warn("Using fallback API URL:", fallbackUrl);
    }
  }, []);

  const handleLogin = async () => {
    if (!apiBaseUrl) {
      setError("API URL is not available.");
      return;
    }

    setIsLoading(true);
    setError("");
    
    // Try with direct authenticate endpoint
    const loginEndpoint = `${apiBaseUrl}/authenticate`;
    console.log(`Attempting to authenticate with: ${loginEndpoint}`);

    try {
      // Enhanced fetch with better error handling
      const response = await fetch(loginEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": window.location.origin
        },
        body: JSON.stringify({
          username: email,
          password,
        }),
        mode: "cors",
        credentials: "include",
      }).catch(fetchError => {
        console.error("Fetch execution error:", fetchError);
        throw new Error(`Network error: ${fetchError.message}`);
      });

      // Try to parse the response body as JSON
      let responseData: LoginResponse;
      try {
        responseData = await response.json();
      } catch (jsonError) {
        console.error("Failed to parse JSON response:", jsonError);
        throw new Error("Invalid response from server. Please try again.");
      }

      if (!response.ok) {
        console.error("Server returned error status:", response.status, responseData);
        throw new Error(responseData?.detail || `Authentication failed (${response.status})`);
      }

      // Check for the different possible challenges
      console.log("Authentication response:", responseData);
      
      if (responseData.ChallengeName === "NEW_PASSWORD_REQUIRED") {
        // Handle password change requirement
        setSession(responseData.session || "");
        setShowPasswordChange(true);
      } else if (responseData.ChallengeName === "MFA_SETUP") {
        // Handle MFA setup requirement
        setSession(responseData.session || "");
        setMfaSecretCode(responseData.secretCode || "");
        setShowMFASetup(true);
      } else if (responseData.mfa_required) {
        // Handle MFA verification
        setSession(responseData.session || "");
        setShowMFA(true);
      } else if (responseData.id_token && responseData.access_token) {
        // Success - store tokens and redirect
        localStorage.setItem("access_token", responseData.access_token);
        localStorage.setItem("id_token", responseData.id_token);
        localStorage.setItem("refresh_token", responseData.refresh_token || "");
        router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard");
      } else {
        console.error("Unexpected response format:", responseData);
        throw new Error("Unexpected server response format");
      }
    } catch (error: any) {
      console.error("Login error:", error.message);
      setError(error.message || "An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!apiBaseUrl) {
      setError("API URL is not available.");
      return;
    }

    // Validate password
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setError("");
    setIsLoading(true);
    
    try {
      const changePasswordEndpoint = `${apiBaseUrl}/api/auth/respond-to-challenge`;
      
      const response = await fetch(changePasswordEndpoint, {
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
            NEW_PASSWORD: newPassword
          }
        }),
        mode: "cors",
        credentials: "include",
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || `Failed to change password (${response.status})`);
      }

      console.log("Password change response:", data);
      
      // Check next challenge type
      if (data.ChallengeName === "MFA_SETUP") {
        setSession(data.session || "");
        setMfaSecretCode(data.secretCode || "");
        setShowPasswordChange(false);
        setShowMFASetup(true);
      } else if (data.mfa_required) {
        setSession(data.session || "");
        setShowPasswordChange(false);
        setShowMFA(true);
      } else if (data.id_token && data.access_token) {
        // Success - store tokens and redirect
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("id_token", data.id_token);
        localStorage.setItem("refresh_token", data.refresh_token || "");
        router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard");
      }
    } catch (error: any) {
      console.error("Password change error:", error.message);
      setError(error.message || "Failed to change password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMFASetup = async () => {
    if (!apiBaseUrl) {
      setError("API URL is not available.");
      return;
    }

    if (setupMfaCode.length !== 6) {
      setError("Please enter a valid 6-digit code");
      return;
    }

    setError("");
    setIsLoading(true);
    
    try {
      const setupMfaEndpoint = `${apiBaseUrl}/api/auth/confirm-mfa-setup`;
      
      const response = await fetch(setupMfaEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": window.location.origin
        },
        body: JSON.stringify({
          username: email,
          session: session,
          code: setupMfaCode
        }),
        mode: "cors",
        credentials: "include",
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || `Failed to setup MFA (${response.status})`);
      }

      console.log("MFA setup response:", data);
      
      // Check if we need to verify MFA now
      if (data.mfa_required) {
        setSession(data.session || "");
        setShowMFASetup(false);
        setShowMFA(true);
      } else if (data.id_token && data.access_token) {
        // Success - store tokens and redirect
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("id_token", data.id_token);
        localStorage.setItem("refresh_token", data.refresh_token || "");
        router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard");
      }
    } catch (error: any) {
      console.error("MFA setup error:", error.message);
      setError(error.message || "Failed to setup MFA. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMFASubmit = async () => {
    if (!apiBaseUrl) {
      setError("API URL is not available.");
      return;
    }

    setError("");
    setIsLoading(true);
    
    const mfaEndpoint = `${apiBaseUrl}/api/auth/verify-mfa`;
    console.log(`Verifying MFA with: ${mfaEndpoint}`);

    try {
      const response = await fetch(mfaEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": window.location.origin
        },
        body: JSON.stringify({ code: mfaCode, session, username: email }),
        mode: "cors",
        credentials: "include",
      }).catch(fetchError => {
        console.error("MFA fetch error:", fetchError);
        throw new Error(`Network error: ${fetchError.message}`);
      });

      // Try to parse the response body as JSON
      let data: LoginResponse;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error("Failed to parse JSON response:", jsonError);
        throw new Error("Invalid response from server. Please try again.");
      }

      if (!response.ok) {
        console.error("MFA verification failed with status:", response.status, data);
        throw new Error(data?.detail || "Invalid MFA code");
      }

      localStorage.setItem("access_token", data.access_token || "");
      localStorage.setItem("id_token", data.id_token || "");
      localStorage.setItem("refresh_token", data.refresh_token || "");

      router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard");
    } catch (error: any) {
      console.error("MFA verification error:", error.message);
      setError(error.message || "MFA verification failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
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
        <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
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
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Please wait..." : "Sign In"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Password Change Dialog */}
      <Dialog open={showPasswordChange} onOpenChange={(open) => open && setShowPasswordChange(open)}>
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
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Alert>
              <AlertDescription>
                Your password must be at least 8 characters long and include uppercase and lowercase letters, numbers, and special characters.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button 
              onClick={handlePasswordChange} 
              disabled={isLoading || !newPassword || !confirmPassword || newPassword !== confirmPassword}
              className="w-full"
            >
              {isLoading ? "Updating..." : "Update Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MFA Setup Dialog */}
      <Dialog open={showMFASetup} onOpenChange={(open) => open && setShowMFASetup(open)}>
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
                onChange={(e) => setSetupMfaCode(e.target.value.slice(0, 6))}
                maxLength={6}
                className="text-center text-2xl tracking-widest"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button 
              onClick={handleMFASetup} 
              disabled={setupMfaCode.length !== 6 || isLoading}
              className="w-full"
            >
              {isLoading ? "Verifying..." : "Verify & Complete Setup"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MFA Verification Dialog */}
      <Dialog open={showMFA} onOpenChange={(open) => open && setShowMFA(open)}>
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
                onChange={(e) => setMfaCode(e.target.value.slice(0, 6))}
                maxLength={6}
                className="text-center text-2xl tracking-widest"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button 
              onClick={handleMFASubmit} 
              disabled={mfaCode.length !== 6 || isLoading}
              className="w-full"
            >
              {isLoading ? "Verifying..." : "Verify"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}