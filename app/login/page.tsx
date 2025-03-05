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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

type UserType = "admin" | "employee";

interface LoginResponse {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  token?: string;
  mfa_required?: boolean;
  mfa_setup_required?: boolean;
  ChallengeName?: string;
  session?: string;
  email?: string;
  role?: string;
  detail?: string;
  secretCode?: string;
  message?: string;
  mfaEnabled?: boolean;
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
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  
  // Forgot Password states
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordStep, setForgotPasswordStep] = useState(1); // 1: request, 2: confirm
  const [forgotPasswordCode, setForgotPasswordCode] = useState("");
  const [newForgotPassword, setNewForgotPassword] = useState("");
  const [confirmForgotPassword, setConfirmForgotPassword] = useState("");
  const [forgotPasswordError, setForgotPasswordError] = useState("");
  const [isForgotPasswordLoading, setIsForgotPasswordLoading] = useState(false);
  
  const [session, setSession] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null);
  const [tempAccessToken, setTempAccessToken] = useState<string | null>(null);

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

  // Generate QR code URL when secret code is available
  useEffect(() => {
    if (mfaSecretCode) {
      // Create a QR code URL for the authenticator app
      // Format: otpauth://totp/[Service]:[User]?secret=[Secret]&issuer=[Service]
      const serviceName = "EncryptGate";
      const otpauthUrl = `otpauth://totp/${serviceName}:${encodeURIComponent(email)}?secret=${mfaSecretCode}&issuer=${serviceName}`;
      
      // Generate QR code URL using a QR code API
      const qrCodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`;
      setQrCodeUrl(qrCodeApiUrl);
    }
  }, [mfaSecretCode, email]);

  // Handle forgot password request
  const handleForgotPasswordRequest = async () => {
    if (!forgotPasswordEmail) {
      setForgotPasswordError("Please enter your email address");
      return;
    }
    
    setIsForgotPasswordLoading(true);
    setForgotPasswordError("");
    
    try {
      const forgotPasswordEndpoint = `${apiBaseUrl}/api/auth/forgot-password`;
      
      const response = await fetch(forgotPasswordEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": window.location.origin
        },
        body: JSON.stringify({
          username: forgotPasswordEmail
        }),
        mode: "cors",
        credentials: "include",
      });
      
      const responseData = await response.json();
      
      if (!response.ok) {
        throw new Error(responseData.detail || `Failed to initiate password reset (${response.status})`);
      }
      
      // Move to confirmation step
      setForgotPasswordStep(2);
    } catch (error: any) {
      console.error("Forgot password error:", error);
      setForgotPasswordError(error.message || "Failed to initiate password reset");
    } finally {
      setIsForgotPasswordLoading(false);
    }
  };

  // Handle forgot password confirm
  const handleForgotPasswordConfirm = async () => {
    if (!forgotPasswordCode) {
      setForgotPasswordError("Please enter the verification code");
      return;
    }
    
    if (!newForgotPassword) {
      setForgotPasswordError("Please enter a new password");
      return;
    }
    
    if (newForgotPassword !== confirmForgotPassword) {
      setForgotPasswordError("Passwords do not match");
      return;
    }
    
    setIsForgotPasswordLoading(true);
    setForgotPasswordError("");
    
    try {
      const confirmForgotPasswordEndpoint = `${apiBaseUrl}/api/auth/confirm-forgot-password`;
      
      const response = await fetch(confirmForgotPasswordEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": window.location.origin
        },
        body: JSON.stringify({
          username: forgotPasswordEmail,
          code: forgotPasswordCode,
          password: newForgotPassword
        }),
        mode: "cors",
        credentials: "include",
      });
      
      const responseData = await response.json();
      
      if (!response.ok) {
        throw new Error(responseData.detail || `Failed to reset password (${response.status})`);
      }
      
      // Reset state and close dialog
      resetForgotPasswordState();
      setShowForgotPassword(false);
      
      // Show success message
      setError("Password reset successful. Please sign in with your new password.");
    } catch (error: any) {
      console.error("Reset password error:", error);
      setForgotPasswordError(error.message || "Failed to reset password");
    } finally {
      setIsForgotPasswordLoading(false);
    }
  };

  // Reset forgot password state
  const resetForgotPasswordState = () => {
    setForgotPasswordStep(1);
    setForgotPasswordEmail("");
    setForgotPasswordCode("");
    setNewForgotPassword("");
    setConfirmForgotPassword("");
    setForgotPasswordError("");
  };

  // Handle forgot password dialog close
  const handleForgotPasswordClose = () => {
    resetForgotPasswordState();
    setShowForgotPassword(false);
  };

  const handleLogin = async () => {
    if (!apiBaseUrl) {
      setError("API URL is not available.");
      return;
    }

    setIsLoading(true);
    setError("");
    
    // Try with direct authenticate endpoint
    const loginEndpoint = `${apiBaseUrl}/api/auth/authenticate`;
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

      console.log("Authentication response:", responseData);

      // Handle different authentication flows
      if (responseData.ChallengeName === "NEW_PASSWORD_REQUIRED") {
        // Handle password change requirement
        setSession(responseData.session || "");
        setShowPasswordChange(true);
      } else if (responseData.ChallengeName === "SOFTWARE_TOKEN_MFA") {
        // Handle MFA challenge
        setSession(responseData.session || "");
        setShowMFA(true);
      } else if (responseData.mfa_required) {
        // Another way the backend might indicate MFA is required
        setSession(responseData.session || "");
        setShowMFA(true);
      } else if (responseData.access_token) {
        // Success with tokens - check if MFA setup is needed
        await checkAndSetupMFA(responseData.access_token);
      } else if (responseData.message && typeof responseData.message === 'string' && 
                 responseData.message.includes("Password changed successfully")) {
        // Password was changed successfully but no tokens received
        setError("Password changed successfully. Please sign in with your new password.");
      } else {
        // More flexible handling of unexpected response formats
        console.warn("Unrecognized response format:", responseData);
        
        // Try to continue with whatever we have
        if (responseData.id_token || (responseData as any).token) {
          // We have some kind of token, try to use it
          const token = responseData.access_token || responseData.id_token || (responseData as any).token;
          localStorage.setItem("access_token", token);
          router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard");
        } else {
          setError("Unable to process login response. Please try again or contact support.");
        }
      }
    } catch (error: any) {
      console.error("Login error:", error.message);
      setError(error.message || "An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Check and setup MFA if needed
  const checkAndSetupMFA = async (accessToken: string) => {
    if (!apiBaseUrl) {
      console.error("API URL is not available");
      return;
    }

    try {
      console.log("Checking if MFA setup is needed with token:", accessToken.substring(0, 10) + "...");
      
      // Check if MFA is already configured
      const mfaStatusEndpoint = `${apiBaseUrl}/api/auth/mfa-status`;
      const statusResponse = await fetch(mfaStatusEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": window.location.origin
        },
        body: JSON.stringify({
          access_token: accessToken
        }),
        mode: "cors",
        credentials: "include",
      });
      
      const statusData = await statusResponse.json();
      console.log("MFA status response:", statusData);
      
      if (statusResponse.ok && statusData.mfaEnabled === true) {
        // MFA is already set up, proceed to dashboard
        console.log("MFA is already enabled, proceeding to dashboard");
        localStorage.setItem("access_token", accessToken);
        localStorage.setItem("id_token", accessToken);
        router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard");
        return;
      }
      
      // MFA setup is needed
      console.log("MFA setup is needed, initiating setup");
      setTempAccessToken(accessToken);
      
      const setupMfaEndpoint = `${apiBaseUrl}/api/auth/setup-mfa`;
      const mfaResponse = await fetch(setupMfaEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": window.location.origin
        },
        body: JSON.stringify({
          access_token: accessToken
        }),
        mode: "cors",
        credentials: "include",
      });
      
      const mfaData = await mfaResponse.json();
      console.log("MFA setup response:", mfaData);
      
      if (mfaResponse.ok && mfaData.secretCode) {
        // Show MFA setup screen
        setMfaSecretCode(mfaData.secretCode);
        setQrCodeUrl(mfaData.qrCodeImage || "");
        setShowMFASetup(true);
      } else if (mfaData.mfaEnabled) {
        // MFA is already enabled (double-check)
        localStorage.setItem("access_token", accessToken);
        router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard");
      } else {
        throw new Error("Failed to initialize MFA setup");
      }
    } catch (error: any) {
      console.error("MFA setup check error:", error);
      // If we can't set up MFA for some reason, still allow login
      localStorage.setItem("access_token", accessToken);
      router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard");
    }
  };

  const handlePasswordChange = async () => {
    if (!apiBaseUrl || !session) {
      setError("Unable to change password.");
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    
    setIsLoading(true);
    setError("");
    
    try {
      const challengeEndpoint = `${apiBaseUrl}/api/auth/respond-to-challenge`;
      
      const response = await fetch(challengeEndpoint, {
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
        mode: "cors",
        credentials: "include",
      });
      
      const responseData = await response.json();
      
      if (!response.ok) {
        throw new Error(responseData.detail || `Failed to change password (${response.status})`);
      }
      
      console.log("Password change response:", responseData);
      
      // Close password change dialog - we'll handle MFA setup in the next step
      setShowPasswordChange(false);
      
      // Handle response based on tokens and challenges
      if (responseData.access_token) {
        console.log("Password changed successfully, received access token");
        // Get the new access token and check/setup MFA
        await checkAndSetupMFA(responseData.access_token);
      } else if (responseData.ChallengeName === "SOFTWARE_TOKEN_MFA") {
        // MFA verification required
        console.log("Password changed, MFA verification required");
        setSession(responseData.session || "");
        setShowMFA(true);
      } else if (responseData.mfa_required || responseData.mfa_setup_required) {
        // Need to trigger MFA setup
        console.log("Password changed, MFA setup is required");
        
        // We need to log in again to get a fresh token for MFA setup
        try {
          const loginResponse = await fetch(apiBaseUrl + "/api/auth/authenticate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "Origin": window.location.origin
            },
            body: JSON.stringify({
              username: email,
              password: newPassword
            }),
            mode: "cors",
            credentials: "include",
          });
          
          const loginData = await loginResponse.json();
          
          if (loginResponse.ok && loginData.access_token) {
            // Got new token after password change, now check/setup MFA
            await checkAndSetupMFA(loginData.access_token);
          } else if (loginData.ChallengeName === "SOFTWARE_TOKEN_MFA") {
            // MFA verification required
            setSession(loginData.session || "");
            setShowMFA(true);
          } else {
            // Cannot automatically continue the flow
            setPassword(newPassword); // Set password field to new password
            setError("Password changed successfully. Please sign in with your new password.");
          }
        } catch (loginError) {
          console.error("Error logging in after password change:", loginError);
          setPassword(newPassword); // Set password field to new password
          setError("Password changed successfully. Please sign in with your new password.");
        }
      } else {
        // No clear next step, prompt user to sign in again
        setPassword(newPassword); // Set password field to new password
        setError("Password changed successfully. Please sign in with your new password.");
      }
    } catch (error: any) {
      console.error("Password change error:", error);
      setError(typeof error === 'object' && error.message ? error.message : "Failed to change password");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMFASetup = async () => {
    if (!apiBaseUrl || !mfaSecretCode) {
      setError("Unable to set up MFA.");
      return;
    }
    
    if (setupMfaCode.length !== 6) {
      setError("Please enter a valid 6-digit code.");
      return;
    }
    
    setIsLoading(true);
    setError("");
    
    try {
      // Get the access token
      const accessToken = tempAccessToken || localStorage.getItem("temp_access_token") || "";
      
      if (!accessToken && !session) {
        throw new Error("Missing authentication credentials");
      }
      
      const setupEndpoint = `${apiBaseUrl}/api/auth/verify-mfa-setup`;
      
      const response = await fetch(setupEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": window.location.origin
        },
        body: JSON.stringify({
          access_token: accessToken,
          code: setupMfaCode
        }),
        mode: "cors",
        credentials: "include",
      });
      
      const responseData = await response.json();
      
      if (!response.ok) {
        throw new Error(responseData.detail || `Failed to verify MFA setup (${response.status})`);
      }
      
      // MFA setup successful
      localStorage.removeItem("temp_access_token");
      setTempAccessToken(null);
      
      // Store the actual tokens
      if (responseData.access_token) {
        localStorage.setItem("access_token", responseData.access_token);
        localStorage.setItem("id_token", responseData.id_token || "");
        localStorage.setItem("refresh_token", responseData.refresh_token || "");
      } else {
        // Use the token we had before
        localStorage.setItem("access_token", accessToken);
      }
      
      // Clear state and close dialog
      setShowMFASetup(false);
      setMfaSecretCode("");
      setSetupMfaCode("");
      
      // Redirect to dashboard
      router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard");
    } catch (error: any) {
      console.error("MFA setup error:", error);
      setError(error.message || "Failed to set up MFA");
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
    
    // Updated endpoint to include the proper API path
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

      // Store tokens and redirect
      localStorage.setItem("access_token", data.access_token || "");
      localStorage.setItem("id_token", data.id_token || "");
      localStorage.setItem("refresh_token", data.refresh_token || "");
      
      // Clear state and close dialog
      setShowMFA(false);
      setMfaCode("");

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
                className="bg-background"
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

      {/* Password Change Dialog - Force user to complete this step */}
      <Dialog 
        open={showPasswordChange} 
        onOpenChange={(open) => {
          // Only allow opening, not closing
          if (open) setShowPasswordChange(true);
          // Closing is handled programmatically after successful password change
        }}
      >
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
              <AlertDescription className="text-xs">
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

      {/* MFA Setup Dialog - Force user to complete this step */}
      <Dialog 
        open={showMFASetup} 
        onOpenChange={(open) => {
          // Only allow opening, not closing
          if (open) setShowMFASetup(true);
          // Closing is handled programmatically after successful setup
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setup Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              For additional security, please set up two-factor authentication using an authenticator app.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Alert>
              <AlertDescription className="text-xs">
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
                    src={qrCodeUrl || "/placeholder.svg"} 
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

      {/* MFA Verification Dialog - Force user to complete this step */}
      <Dialog 
        open={showMFA} 
        onOpenChange={(open) => {
          // Only allow opening, not closing
          if (open) setShowMFA(true);
          // Closing is handled programmatically after successful verification
        }}
      >
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

      {/* Forgot Password Dialog */}
      <Dialog open={showForgotPassword} onOpenChange={(open) => {
        if (!open) handleForgotPasswordClose();
        else setShowForgotPassword(true);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Your Password</DialogTitle>
            <DialogDescription>
              {forgotPasswordStep === 1 
                ? "Enter your email address to receive a verification code" 
                : "Enter the verification code and your new password"}
            </DialogDescription>
          </DialogHeader>
          
          {forgotPasswordStep === 1 ? (
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email Address</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="name@example.com"
                  value={forgotPasswordEmail}
                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
                  className="bg-background"
                />
              </div>
              {forgotPasswordError && <p className="text-sm text-destructive">{forgotPasswordError}</p>}
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
              <div className="space-y-2">
                <Label htmlFor="reset-code">Verification Code</Label>
                <Input
                  id="reset-code"
                  placeholder="Enter verification code"
                  value={forgotPasswordCode}
                  onChange={(e) => setForgotPasswordCode(e.target.value)}
                  className="bg-background"
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
                  placeholder="Confirm new password"
                  value={confirmForgotPassword}
                  onChange={(e) => setConfirmForgotPassword(e.target.value)}
                />
              </div>
              {forgotPasswordError && <p className="text-sm text-destructive">{forgotPasswordError}</p>}
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
                  disabled={!forgotPasswordCode || !newForgotPassword || !confirmForgotPassword || isForgotPasswordLoading}
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
  );
}