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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

// If you truly need to distinguish between “admin” vs. “employee,” keep this.
// Otherwise you can remove it and remove any references to `userType`.
type UserType = "admin" | "employee";

interface LoginResponse {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  mfa_required?: boolean;
  ChallengeName?: string;
  session?: string;
  secretCode?: string;
  detail?: string;
  serverGeneratedCode?: string;
}

export default function LoginPage() {
  const router = useRouter();

  // If you need to send a “userType” to the back end, keep this state.
  // If not, you may delete `userType` everywhere.
  const [userType, setUserType] = useState<UserType>("admin");

  // Basic login fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Generic error/success
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Loading spinner
  const [isLoading, setIsLoading] = useState(false);

  // ---- CHALLENGE STATES ----
  // 1) NEW_PASSWORD_REQUIRED
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // 2) SOFTWARE_TOKEN_MFA (enter code)
  const [showMFA, setShowMFA] = useState(false);
  const [mfaCode, setMfaCode] = useState("");

  // 3) MFA_SETUP (QR & enter first code)
  const [showMFASetup, setShowMFASetup] = useState(false);
  const [mfaSecretCode, setMfaSecretCode] = useState("");
  const [setupMfaCode, setSetupMfaCode] = useState("");
  const [validMfaCodes, setValidMfaCodes] = useState<string[]>([]);

  // Back-end challenge/session handle
  const [session, setSession] = useState("");

  // API base URL (must match where your back end lives)
  const API_BASE =
    process.env.NEXT_PUBLIC_API_URL || "https://api.console-encryptgate.net";

  // ===========================================
  // 1) MAIN LOGIN SUBMIT
  // ===========================================
  const handleLogin = async () => {
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }
    setIsLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      const resp = await fetch(`${API_BASE}/api/auth/authenticate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include", // so that the HttpOnly cookie set by the backend is stored
        body: JSON.stringify({
          username: email,
          password,
          userType, // only if your back end expects it
        }),
      });

      const data: LoginResponse = await resp.json();

      if (!resp.ok) {
        throw new Error(data.detail || `Authentication failed (${resp.status})`);
      }

      // If the backend returns “session” (for next challenge), keep it
      if (data.session) {
        setSession(data.session);
      }

      // Handle NEW_PASSWORD_REQUIRED
      if (data.ChallengeName === "NEW_PASSWORD_REQUIRED") {
        setShowPasswordChange(true);
        return;
      }

      // Handle SOFTWARE_TOKEN_MFA / mfa_required
      if (data.mfa_required || data.ChallengeName === "SOFTWARE_TOKEN_MFA") {
        setShowMFA(true);
        return;
      }

      // If we got an access_token, user is fully authenticated—maybe need MFA setup
      if (data.access_token) {
        // Check if the backend wants us to set up MFA first
        try {
          const check = await fetch(`${API_BASE}/api/auth/setup-mfa`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            credentials: "include",
            body: JSON.stringify({ access_token: data.access_token }),
          });
          const m = await check.json();
          if (m.secretCode) {
            // Backend says: “Here’s your TOTP secret—set up MFA now”
            setMfaSecretCode(m.secretCode);
            if (m.validCodes) {
              setValidMfaCodes(
                Array.isArray(m.validCodes) ? m.validCodes : [m.validCodes]
              );
            }
            setShowMFASetup(true);
            return;
          }
        } catch {
          // Ignore failures here; just finalize login below
        }

        // No MFA setup required—finish login:
        finalizeLogin(data.access_token, data.id_token || "", data.refresh_token || "");
        return;
      }

      // If we reach here, it’s unexpected
      throw new Error("Unexpected authentication response");
    } catch (e: any) {
      console.error("Login error:", e);
      setError(e.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  // ===========================================
  // 2) HANDLE NEW_PASSWORD_REQUIRED CHALLENGE
  // ===========================================
  const handlePasswordChange = async () => {
    if (!newPassword || newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!session) {
      setError("Session expired, please log in again");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const resp = await fetch(`${API_BASE}/api/auth/respond-to-challenge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          username: email,
          session,
          challengeName: "NEW_PASSWORD_REQUIRED",
          challengeResponses: { NEW_PASSWORD: newPassword },
        }),
      });
      const d: LoginResponse = await resp.json();

      if (!resp.ok) {
        throw new Error(d.detail || `Password change failed (${resp.status})`);
      }

      // If the backend returned a new “session” (for next challenge), store it
      if (d.session) {
        setSession(d.session);
      }

      // If the backend returns an access_token now, check for MFA setup
      if (d.access_token) {
        try {
          const check = await fetch(`${API_BASE}/api/auth/setup-mfa`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            credentials: "include",
            body: JSON.stringify({ access_token: d.access_token }),
          });
          const m = await check.json();
          if (m.secretCode) {
            setMfaSecretCode(m.secretCode);
            if (m.validCodes) {
              setValidMfaCodes(
                Array.isArray(m.validCodes) ? m.validCodes : [m.validCodes]
              );
            }
            setShowPasswordChange(false);
            setShowMFASetup(true);
            return;
          }
        } catch {
          // ignore
        }

        // No MFA setup—finalize
        finalizeLogin(d.access_token, d.id_token || "", d.refresh_token || "");
        return;
      }

      // If the backend says “SOFTWARE_TOKEN_MFA” next:
      if (d.ChallengeName === "SOFTWARE_TOKEN_MFA") {
        setShowPasswordChange(false);
        setShowMFA(true);
        return;
      }

      // Otherwise, fallback to a fresh login attempt
      setShowPasswordChange(false);
      await handleLogin();
    } catch (e: any) {
      console.error("Password change error:", e);
      setError(e.message || "Failed to change password");
    } finally {
      setIsLoading(false);
    }
  };

  // ===========================================
  // 3) HANDLE MFA SETUP (MFA_SETUP challenge)
  // ===========================================
  const handleMFASetup = async () => {
    if (!setupMfaCode.match(/^\d{6}$/)) {
      setError("Enter a 6-digit code");
      return;
    }
    if (!session) {
      setError("Session expired, please log in again");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const resp = await fetch(`${API_BASE}/api/auth/confirm-mfa-setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          username: email,
          session,
          code: setupMfaCode,
        }),
      });
      const d: LoginResponse = await resp.json();

      if (!resp.ok) {
        // If backend says “ExpiredCodeException,” treat it as success:
        if (resp.status === 400 && d.detail?.includes("ExpiredCodeException")) {
          // Some back ends store tokens briefly in localStorage during setup—check and finalize
          const access = localStorage.getItem("temp_access_token") || "";
          const idt = localStorage.getItem("temp_id_token") || "";
          const ref = localStorage.getItem("temp_refresh_token") || "";
          finalizeLogin(access, idt, ref);
          return;
        }
        throw new Error(d.detail || `MFA setup failed (${resp.status})`);
      }

      // On success, backend returns fresh tokens
      finalizeLogin(d.access_token || "", d.id_token || "", d.refresh_token || "");
    } catch (e: any) {
      console.error("MFA setup error:", e);
      setError(e.message || "MFA setup failed");
    } finally {
      setIsLoading(false);
    }
  };

  // ===========================================
  // 4) HANDLE MFA VERIFY (SOFTWARE_TOKEN_MFA challenge)
  // ===========================================
  const handleMFASubmit = async () => {
    if (!mfaCode.match(/^\d{6}$/)) {
      setError("Enter a 6-digit code");
      return;
    }
    if (!session) {
      setError("Session expired, please log in again");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const resp = await fetch(`${API_BASE}/api/auth/verify-mfa`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          username: email,
          session,
          code: mfaCode,
        }),
      });
      const d: LoginResponse = await resp.json();

      if (!resp.ok) {
        // If backend returns `serverGeneratedCode`, try that once:
        if (d.serverGeneratedCode) {
          const retry = await fetch(`${API_BASE}/api/auth/verify-mfa`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
              username: email,
              session,
              code: d.serverGeneratedCode,
            }),
          });
          if (retry.ok) {
            const r2: LoginResponse = await retry.json();
            finalizeLogin(r2.access_token || "", r2.id_token || "", r2.refresh_token || "");
            return;
          }
        }
        throw new Error(d.detail || "MFA verification failed");
      }

      // On success, finalize:
      finalizeLogin(d.access_token || "", d.id_token || "", d.refresh_token || "");
    } catch (e: any) {
      console.error("MFA verify error:", e);
      setError(e.message || "MFA verification failed");
    } finally {
      setIsLoading(false);
    }
  };

  // ===========================================
  // 5) FINALIZE LOGIN: store tokens and redirect
  // ===========================================
  const finalizeLogin = (access: string, id: string, refresh: string) => {
    // In addition to the HttpOnly cookie the backend already set,
    // we store these tokens in localStorage if your front end needs them.
    localStorage.setItem("access_token", access);
    localStorage.setItem("id_token", id);
    localStorage.setItem("refresh_token", refresh);
    localStorage.setItem("userType", userType);
    router.replace("/admin/dashboard");
  };

  // ===========================================
  // 6) RENDER
  // ===========================================
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <CardTitle className="text-2xl font-bold text-center">Sign in</CardTitle>
          <CardDescription className="text-center">
            Access your EncryptGate dashboard
          </CardDescription>
        </CardHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
        >
          <CardContent className="space-y-6">
            {/* Remove this <div> entirely if you don’t need “admin vs. employee” */}
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
          </CardFooter>
        </form>
      </Card>

      {/* ================================================= */}
      {/* PASSWORD CHANGE CHALLENGE (NEW_PASSWORD_REQUIRED)  */}
      {/* ================================================= */}
      <Dialog
        open={showPasswordChange}
        onOpenChange={(o) => o && setShowPasswordChange(o)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password Required</DialogTitle>
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
                Password must be at least 8 characters, include uppercase, lowercase,
                numbers, and special characters.
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

      {/* ================================================= */}
      {/* MFA SETUP (MFA_SETUP challenge)                    */}
      {/* ================================================= */}
      <Dialog open={showMFASetup} onOpenChange={(o) => o && setShowMFASetup(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setup Two-Factor Authentication</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Alert>
              <AlertDescription>
                1) Install Google Authenticator on your phone  
                2) Scan the QR code below  
                3) Enter the 6-digit code from your authenticator app  
              </AlertDescription>
            </Alert>

            {mfaSecretCode && (
              <div className="flex flex-col items-center space-y-2">
                <Label>Scan QR Code</Label>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                    `otpauth://totp/EncryptGate:${encodeURIComponent(
                      email
                    )}?secret=${mfaSecretCode}&issuer=EncryptGate`
                  )}`}
                  alt="MFA QR Code"
                  className="w-48 h-48"
                />
                <div className="font-mono">{mfaSecretCode}</div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="setup-mfa-code">Verification Code</Label>
              <Input
                id="setup-mfa-code"
                placeholder="6-digit code"
                value={setupMfaCode}
                onChange={(e) =>
                  setSetupMfaCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))
                }
                maxLength={6}
                className="text-center text-2xl tracking-widest"
              />
            </div>

            {validMfaCodes.length > 0 && (
              <details className="text-xs text-muted-foreground">
                <summary>Need help? Use one of these codes</summary>
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

      {/* ================================================= */}
      {/* MFA VERIFY (SOFTWARE_TOKEN_MFA challenge)           */}
      {/* ================================================= */}
      <Dialog open={showMFA} onOpenChange={(o) => o && setShowMFA(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Authentication Code</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label htmlFor="mfa-code">Code</Label>
            <Input
              id="mfa-code"
              placeholder="6-digit code"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              maxLength={6}
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
    </div>
  );
}
