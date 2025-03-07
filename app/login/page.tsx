"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
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

interface LoginResponse {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  mfa_required?: boolean;
  ChallengeName?: string;
  session?: string;
  email?: string;
  secretCode?: string;
  qrCodeImage?: string;
  detail?: string;
  message?: string;
  status?: string;
  username?: string;
}

export default function LoginPage() {
  const router = useRouter();

  // Basic states
  const [userType, setUserType] = useState<UserType>("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null);

  // MFA verification states
  const [showMFA, setShowMFA] = useState(false);
  const [mfaCode, setMfaCode] = useState("");

  // Password change states
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [session, setSession] = useState("");

  // MFA setup states
  const [showMFASetup, setShowMFASetup] = useState(false);
  const [mfaSecretCode, setMfaSecretCode] = useState("");
  const [setupMfaCode, setSetupMfaCode] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  // Forgot Password states
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordStep, setForgotPasswordStep] = useState(1);
  const [forgotPasswordCode, setForgotPasswordCode] = useState("");
  const [newForgotPassword, setNewForgotPassword] = useState("");
  const [confirmForgotPassword, setConfirmForgotPassword] = useState("");
  const [forgotPasswordError, setForgotPasswordError] = useState("");
  const [isForgotPasswordLoading, setIsForgotPasswordLoading] = useState(false);

  // Debug mode state
  const [debugMode, setDebugMode] = useState(false);

  // Fetch API URL from environment or fallback
  useEffect(() => {
    const configuredUrl = process.env.NEXT_PUBLIC_API_URL;
    const fallbackUrl = "https://api.console-encryptgate.net";
    setApiBaseUrl(configuredUrl || fallbackUrl);
  }, []);

  // Generate QR code URL when secret code is available
  useEffect(() => {
    if (mfaSecretCode && !qrCodeUrl) {
      const serviceName = "EncryptGate";
      const otpauthUrl = `otpauth://totp/${serviceName}:${encodeURIComponent(
        email
      )}?secret=${mfaSecretCode}&issuer=${serviceName}`;
      setQrCodeUrl(
        `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
          otpauthUrl
        )}`
      );
    }
  }, [mfaSecretCode, email, qrCodeUrl]);

  // Close forgot password dialog
  const handleForgotPasswordClose = () => {
    setForgotPasswordStep(1);
    setForgotPasswordEmail("");
    setForgotPasswordCode("");
    setNewForgotPassword("");
    setConfirmForgotPassword("");
    setForgotPasswordError("");
    setShowForgotPassword(false);
  };

  // Forgot password (step 1)
  const handleForgotPasswordRequest = async () => {
    if (!forgotPasswordEmail) {
      setForgotPasswordError("Please enter your email address");
      return;
    }
    if (!apiBaseUrl) {
      setForgotPasswordError("API URL is not available.");
      return;
    }

    setIsForgotPasswordLoading(true);
    setForgotPasswordError("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/forgot-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ username: forgotPasswordEmail }),
        credentials: "include",
      });
      const data: LoginResponse = await response.json();
      if (!response.ok) {
        throw new Error(
          data.detail ||
            `Failed to initiate password reset (${response.status})`
        );
      }
      setForgotPasswordStep(2);
    } catch (err: any) {
      setForgotPasswordError(err.message || "Failed to initiate password reset");
    } finally {
      setIsForgotPasswordLoading(false);
    }
  };

  // Forgot password (step 2)
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
    if (!apiBaseUrl) {
      setForgotPasswordError("API URL is not available.");
      return;
    }

    setIsForgotPasswordLoading(true);
    setForgotPasswordError("");
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/auth/confirm-forgot-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            username: forgotPasswordEmail,
            code: forgotPasswordCode,
            password: newForgotPassword,
          }),
          credentials: "include",
        }
      );
      const data: LoginResponse = await response.json();
      if (!response.ok) {
        throw new Error(
          data.detail ||
            `Failed to reset password (${response.status})`
        );
      }
      handleForgotPasswordClose();
      setSuccessMessage(
        "Password reset successful. Please sign in with your new password."
      );
    } catch (err: any) {
      setForgotPasswordError(err.message || "Failed to reset password");
    } finally {
      setIsForgotPasswordLoading(false);
    }
  };

  // Utility: fetch with optional retries
  const fetchWithRetry = async (
    url: string,
    options: RequestInit,
    retries = 2,
    timeout = 10000
  ) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    options.signal = controller.signal;

    try {
      const response = await fetch(url, options);
      clearTimeout(id);
      return response;
    } catch (err: any) {
      clearTimeout(id);
      if (
        retries > 0 &&
        (err.name === "AbortError" || err.name === "TypeError")
      ) {
        return fetchWithRetry(url, options, retries - 1, timeout);
      }
      throw err;
    }
  };

  // Handle login
  const handleLogin = async () => {
    if (!apiBaseUrl) {
      setError("API URL is not available.");
      return;
    }
    setIsLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/authenticate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ username: email, password }),
          credentials: "include",
        }
      );
      const data: LoginResponse = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || `Authentication failed (${response.status})`);
      }

      // Check different flows
      if (data.ChallengeName === "NEW_PASSWORD_REQUIRED") {
        setSession(data.session || "");
        setShowPasswordChange(true);
      } else if (data.mfa_required) {
        setSession(data.session || "");
        setShowMFA(true);
      } else if (data.access_token) {
        // Attempt MFA setup
        try {
          const mfaResponse = await fetchWithRetry(
            `${apiBaseUrl}/api/auth/setup-mfa`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({ access_token: data.access_token }),
              credentials: "include",
            },
            1
          );
          const mfaData: LoginResponse = await mfaResponse.json();
          if (mfaResponse.ok && mfaData.secretCode) {
            setMfaSecretCode(mfaData.secretCode);
            if (mfaData.qrCodeImage) {
              setQrCodeUrl(mfaData.qrCodeImage);
            }
            localStorage.setItem("temp_access_token", data.access_token);
            setShowMFASetup(true);
            return;
          }
        } catch {
          // If MFA setup fails silently, continue
        }
        // Otherwise, user is fully authenticated
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("id_token", data.id_token || "");
        localStorage.setItem("refresh_token", data.refresh_token || "");
        router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard");
      } else {
        throw new Error("Unexpected server response format");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle password change
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
      const response = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/respond-to-challenge`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            username: email,
            session: session,
            challengeName: "NEW_PASSWORD_REQUIRED",
            challengeResponses: { NEW_PASSWORD: newPassword },
          }),
          credentials: "include",
        },
        1
      );
      const data: LoginResponse = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || `Failed to change password (${response.status})`);
      }

      if (data.access_token) {
        // Attempt MFA setup
        try {
          const mfaResponse = await fetchWithRetry(
            `${apiBaseUrl}/api/auth/setup-mfa`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({ access_token: data.access_token }),
              credentials: "include",
            },
            1
          );
          const mfaData: LoginResponse = await mfaResponse.json();
          if (mfaResponse.ok && mfaData.secretCode) {
            setShowPasswordChange(false);
            setMfaSecretCode(mfaData.secretCode);
            if (mfaData.qrCodeImage) {
              setQrCodeUrl(mfaData.qrCodeImage);
            }
            localStorage.setItem("temp_access_token", data.access_token);
            setShowMFASetup(true);
            return;
          }
        } catch {
          // If MFA setup fails silently, continue
        }
        // Otherwise, user is fully authenticated
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("id_token", data.id_token || "");
        localStorage.setItem("refresh_token", data.refresh_token || "");
        setShowPasswordChange(false);
        router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard");
      } else if (data.ChallengeName) {
        if (data.ChallengeName === "MFA_SETUP") {
          setSession(data.session || "");
          setShowPasswordChange(false);
          setMfaSecretCode(data.secretCode || "");
          setShowMFASetup(true);
        } else if (data.mfa_required) {
          setSession(data.session || "");
          setShowPasswordChange(false);
          setShowMFA(true);
        }
      } else {
        throw new Error("Unexpected response format");
      }
    } catch (err: any) {
      setError(err.message || "Failed to change password");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle MFA setup verification
  const handleMFASetup = async () => {
    if (!apiBaseUrl) {
      setError("API URL is not available.");
      return;
    }
    if (setupMfaCode.length !== 6) {
      setError("Please enter a valid 6-digit code from your authenticator app.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const accessToken =
        localStorage.getItem("temp_access_token") ||
        localStorage.getItem("access_token");
      if (!accessToken && !session) {
        throw new Error("Authentication session expired. Please log in again.");
      }

      let endpoint: string;
      let requestBody: Record<string, string>;
      if (accessToken) {
        endpoint = `${apiBaseUrl}/api/auth/verify-mfa-setup`;
        requestBody = { access_token: accessToken, code: setupMfaCode };
      } else {
        endpoint = `${apiBaseUrl}/api/auth/confirm-mfa-setup`;
        requestBody = { username: email, session: session, code: setupMfaCode };
      }

      const response = await fetchWithRetry(
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(requestBody),
          credentials: "include",
        },
        1
      );
      const data: LoginResponse = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || `Failed to verify MFA setup (${response.status})`);
      }

      setShowMFASetup(false);
      localStorage.removeItem("temp_access_token");

      if (data.access_token) {
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("id_token", data.id_token || "");
        localStorage.setItem("refresh_token", data.refresh_token || "");
        router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard");
      } else {
        setSuccessMessage("MFA setup successful. Please log in again.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to set up MFA");
      if (err.message.includes("code") || err.message.includes("verification")) {
        setSetupMfaCode("");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle MFA code submission
  const handleMFASubmit = async () => {
    if (!apiBaseUrl) {
      setError("API URL is not available.");
      return;
    }
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/verify-mfa`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ code: mfaCode, session, username: email }),
        credentials: "include",
      });
      const data: LoginResponse = await response.json();
      if (!response.ok) {
        if (
          response.status === 400 &&
          data.detail &&
          data.detail.includes("verification code")
        ) {
          setMfaCode("");
        }
        throw new Error(data?.detail || "Invalid MFA code");
      }
      localStorage.setItem("access_token", data.access_token || "");
      localStorage.setItem("id_token", data.id_token || "");
      localStorage.setItem("refresh_token", data.refresh_token || "");
      router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard");
    } catch (err: any) {
      setError(err.message || "MFA verification failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Regenerate MFA setup
  const handleRegenerateMfaSetup = async () => {
    if (!apiBaseUrl) {
      setError("API URL is not available.");
      return;
    }
    setIsLoading(true);
    setError("");

    try {
      const accessToken =
        localStorage.getItem("temp_access_token") ||
        localStorage.getItem("access_token");
      if (!accessToken) {
        throw new Error("Authentication session expired. Please log in again.");
      }

      const response = await fetchWithRetry(
        `${apiBaseUrl}/api/auth/setup-mfa`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ access_token: accessToken }),
          credentials: "include",
        },
        1
      );
      const data: LoginResponse = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to regenerate MFA setup");
      }
      setMfaSecretCode(data.secretCode || "");
      if (data.qrCodeImage) {
        setQrCodeUrl(data.qrCodeImage);
      }
      setSetupMfaCode("");
    } catch (err: any) {
      setError(err.message || "Failed to regenerate MFA setup");
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
          <p className="text-sm text-center text-muted-foreground">
            Choose your account type to access the security dashboard
          </p>
        </CardHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
        >
          <CardContent className="space-y-6">
            <RadioGroup
              value={userType}
              onValueChange={(value: UserType) => setUserType(value)}
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
                <AlertDescription className="text-sm">
                  {successMessage}
                </AlertDescription>
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

      {/* Password Change Dialog */}
      <Dialog
        open={showPasswordChange}
        onOpenChange={(open) => open && setShowPasswordChange(open)}
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
            {error && (
              <Alert variant="destructive">
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            )}
            <Alert>
              <AlertDescription>
                Your password must be at least 8 characters long and include uppercase
                and lowercase letters, numbers, and special characters.
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
        onOpenChange={(open) => open && setShowMFASetup(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setup Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              For additional security, please set up two-factor authentication using an
              authenticator app.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Alert>
              <AlertDescription>
                1. Install an authenticator app like Google Authenticator or Authy on
                your mobile device.
                <br />
                2. Scan the QR code or enter the secret key in your app.
                <br />
                3. Enter the 6-digit code from your authenticator app below.
              </AlertDescription>
            </Alert>

            {mfaSecretCode && (
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="text-center">
                  <Label className="mb-2 block">Scan QR Code</Label>
                  <div className="bg-white p-4 rounded-md inline-block">
                    {qrCodeUrl ? (
                      <img
                        src={qrCodeUrl}
                        alt="QR Code for MFA setup"
                        className="w-48 h-48"
                      />
                    ) : (
                      <div className="w-48 h-48 flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    )}
                  </div>
                </div>
                <div className="w-full text-center mt-2">
                  <Label className="mb-2 block">Secret Key</Label>
                  <div className="p-3 bg-muted rounded-md font-mono text-center break-all">
                    {mfaSecretCode}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Enter this code manually if you cannot scan the QR code
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2 mt-2">
              <Label htmlFor="setup-mfa-code">Authentication Code</Label>
              <Input
                id="setup-mfa-code"
                placeholder="000000"
                value={setupMfaCode}
                onChange={(e) =>
                  setSetupMfaCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))
                }
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
          <DialogFooter className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant="outline"
              onClick={handleRegenerateMfaSetup}
              disabled={isLoading}
              className="sm:w-auto w-full"
            >
              Regenerate Code
            </Button>
            <Button
              onClick={handleMFASetup}
              disabled={setupMfaCode.length !== 6 || isLoading}
              className="sm:w-auto w-full"
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

      {/* MFA Verification Dialog */}
      <Dialog
        open={showMFA}
        onOpenChange={(open) => open && setShowMFA(open)}
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
                onChange={(e) =>
                  setMfaCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))
                }
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
              onClick={handleMFASubmit}
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

      {/* Forgot Password Dialog */}
      <Dialog
        open={showForgotPassword}
        onOpenChange={(open) => {
          if (!open) handleForgotPasswordClose();
          else setShowForgotPassword(true);
        }}
      >
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
                  placeholder="Enter verification code"
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
                  placeholder="Confirm new password"
                  value={confirmForgotPassword}
                  onChange={(e) => setConfirmForgotPassword(e.target.value)}
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

      {/* Hidden Debug Mode Toggle */}
      <div className="hidden">
        <button onClick={() => setDebugMode((prev) => !prev)}>
          Debug Mode
        </button>
      </div>
    </div>
  );
}
