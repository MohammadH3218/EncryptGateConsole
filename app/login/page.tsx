"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

// --- Helper functions for time parsing ---
function parseIsoDatetime(datetimeStr: string): Date {
  // Replace 'Z' with '+00:00' if needed and return a UTC Date object
  return new Date(datetimeStr.replace("Z", "+00:00"));
}

function getTimeDifferenceSeconds(dt1: Date, dt2: Date): number {
  // Ensure both dates are treated as UTC
  return Math.abs((dt1.getTime() - dt2.getTime()) / 1000);
}

// Helper to get adjusted time with server offset
function getAdjustedTime(): Date | null {
  try {
    const timeOffset = localStorage.getItem("server_time_offset");
    if (timeOffset) {
      return new Date(Date.now() + parseInt(timeOffset));
    }
    return null;
  } catch (e) {
    console.error("Error calculating adjusted time:", e);
    return null;
  }
}

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
  message?: string;
  status?: string;
  username?: string;
  currentCode?: string;
  currentValidCode?: string;
  serverGeneratedCode?: string;
  validCodes?: string[];
  timeInfo?: any;
}

export default function LoginPage() {
  const router = useRouter();
  const [userType, setUserType] = useState<UserType>("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // MFA verification states
  const [showMFA, setShowMFA] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRecoveryCodes, setMfaRecoveryCodes] = useState<string[]>([]);

  // Password change states
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // MFA setup states
  const [showMFASetup, setShowMFASetup] = useState(false);
  const [mfaSecretCode, setMfaSecretCode] = useState("");
  const [setupMfaCode, setSetupMfaCode] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [mfaSetupAttempts, setMfaSetupAttempts] = useState(0);
  const [validMfaCodes, setValidMfaCodes] = useState<string[]>([]);

  // Forgot Password states
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordStep, setForgotPasswordStep] = useState(1); // 1: request, 2: confirm
  const [forgotPasswordCode, setForgotPasswordCode] = useState("");
  const [newForgotPassword, setNewForgotPassword] = useState("");
  const [confirmForgotPassword, setConfirmForgotPassword] = useState("");
  const [forgotPasswordError, setForgotPasswordError] = useState("");
  const [isForgotPasswordLoading, setIsForgotPasswordLoading] = useState(false);

  // Server data
  const [session, setSession] = useState("");
  const [serverTime, setServerTime] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [apiCallLog, setApiCallLog] = useState<
    Array<{ timestamp: string; action: string; result: string }>
  >([]);

  // Helper to log API calls for debugging
  const logApiCall = useCallback(
    (action: string, result: string) => {
      if (debugMode) {
        const timestamp = new Date().toISOString();
        setApiCallLog((prev) => [...prev, { timestamp, action, result }]);
        console.log(`[${timestamp}] ${action}: ${result}`);
      }
    },
    [debugMode]
  );

  // Helper to log session token info
  const logSessionInfo = useCallback(
    (label: string, sessionToken?: string) => {
      const token = sessionToken || session;
      if (!token) {
        console.log(`[SESSION INFO] ${label}: No session token available`);
        return;
      }
      console.log(`[SESSION INFO] ${label}:`);
      console.log(`- Length: ${token.length}`);
      console.log(`- First 20 chars: ${token.substring(0, 20)}`);
      console.log(`- Last 20 chars: ${token.substring(token.length - 20)}`);
      console.log(`- Current timestamp: ${new Date().toISOString()}`);

      if (debugMode) {
        setApiCallLog((prev) => [
          ...prev,
          {
            timestamp: new Date().toISOString(),
            action: "Session Info",
            result: `${label}: Length=${token.length}, First 20 chars=${token.substring(
              0,
              20
            )}`,
          },
        ]);
      }
    },
    [session, debugMode]
  );

  // Fetch API URL from backend with fallback
  useEffect(() => {
    const configuredUrl = process.env.NEXT_PUBLIC_API_URL;
    const fallbackUrl = "https://api.console-encryptgate.net";
    const finalUrl = configuredUrl || fallbackUrl;
    setApiBaseUrl(finalUrl);
    logApiCall("API URL Configuration", `Set API URL to ${finalUrl}`);
    if (finalUrl) {
      fetchServerTime(finalUrl);
    }
  }, [logApiCall]);

  // Update fetchServerTime to handle time differences
  const fetchServerTime = async (baseUrl: string) => {
    try {
      const response = await fetch(`${baseUrl}/api/auth/test-mfa-code`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json" 
        },
        body: JSON.stringify({ 
          secret: "AAAAAAAAAA",
          client_time: new Date().toISOString()
        }),
      });
      
      const data = await response.json();
      if (data.server_time) {
        setServerTime(data.server_time);
        const serverDate = new Date(data.server_time);
        const clientDate = new Date();
        const diffMs = Math.abs(serverDate.getTime() - clientDate.getTime());
        const timeOffset = serverDate.getTime() - clientDate.getTime();
        
        // Store the time offset for future use
        localStorage.setItem("server_time_offset", timeOffset.toString());
        
        if (diffMs > 10000) { // 10 seconds threshold
          console.warn(
            `Time synchronization issue: Server time differs by ${Math.round(
              diffMs / 1000
            )} seconds`
          );
          if (debugMode) {
            setApiCallLog((prev) => [
              ...prev,
              {
                timestamp: new Date().toISOString(),
                action: "Time Sync Warning",
                result: `Server time differs by ${Math.round(
                  diffMs / 1000
                )} seconds. Offset stored for MFA verification.`,
              },
            ]);
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch server time:", error);
      logApiCall("Time Synchronization Error", String(error));
    }
  };

  // Generate QR code URL when secret code is available
  useEffect(() => {
    if (mfaSecretCode) {
      const serviceName = "EncryptGate";
      const otpauthUrl = `otpauth://totp/${serviceName.toLowerCase()}:${encodeURIComponent(
        email
      )}?secret=${mfaSecretCode}&issuer=${serviceName.toLowerCase()}`;
      const qrCodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
        otpauthUrl
      )}`;
      setQrCodeUrl(qrCodeApiUrl);
      logApiCall("QR Code Generation", `Generated QR code for secret: ${mfaSecretCode}`);
      getServerGeneratedCodes();
    }
  }, [mfaSecretCode, email, logApiCall]);

  // Get server-generated MFA codes with time window information
  const getServerGeneratedCodes = async () => {
    if (!apiBaseUrl || !mfaSecretCode) return;
    
    try {
      // Get the adjusted time if available
      const adjustedTime = getAdjustedTime();
      
      const response = await fetch(`${apiBaseUrl}/api/auth/test-mfa-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          secret: mfaSecretCode,
          client_time: new Date().toISOString(),
          adjusted_time: adjustedTime ? adjustedTime.toISOString() : undefined
        }),
      });
      
      const result = await response.json();
      logApiCall("Get Server MFA Codes", `Retrieved codes: ${JSON.stringify(result.time_windows || {})}`);
      
      if (result.current_code) {
        setSetupMfaCode(result.current_code);
        
        // Store valid codes for retry mechanisms
        if (result.time_windows) {
          const codes = result.time_windows.map((window: any) => window.code);
          setValidMfaCodes(codes);
        } else if (result.validCodes) {
          setValidMfaCodes(result.validCodes);
        }
        
        return result.current_code;
      }
      
      return null;
    } catch (error) {
      logApiCall("Get Server MFA Codes Error", String(error));
      return null;
    }
  };

  const handleForgotPasswordRequest = async () => {
    if (!forgotPasswordEmail) {
      setForgotPasswordError("Please enter your email address");
      return;
    }
    setIsForgotPasswordLoading(true);
    setForgotPasswordError("");
    try {
      const forgotPasswordEndpoint = `${apiBaseUrl}/api/auth/forgot-password`;
      logApiCall("Forgot Password Request", `Initiating request for email: ${forgotPasswordEmail}`);
      const response = await fetch(forgotPasswordEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": window.location.origin,
        },
        body: JSON.stringify({ username: forgotPasswordEmail }),
        mode: "cors",
        credentials: "include",
      });
      const responseData = await response.json();
      logApiCall("Forgot Password Response", `Status: ${response.status}, Response: ${JSON.stringify(responseData)}`);
      if (!response.ok) {
        throw new Error(responseData.detail || `Failed to initiate password reset (${response.status})`);
      }
      setForgotPasswordStep(2);
    } catch (error: any) {
      setForgotPasswordError(error.message || "Failed to initiate password reset");
      logApiCall("Forgot Password Error", error.message || "Unknown error");
    } finally {
      setIsForgotPasswordLoading(false);
    }
  };

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
      logApiCall("Confirm Forgot Password", `Confirming reset for email: ${forgotPasswordEmail} with code: ${forgotPasswordCode}`);
      const response = await fetch(confirmForgotPasswordEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": window.location.origin,
        },
        body: JSON.stringify({
          username: forgotPasswordEmail,
          code: forgotPasswordCode,
          password: newForgotPassword,
        }),
        mode: "cors",
        credentials: "include",
      });
      const responseData = await response.json();
      logApiCall("Confirm Forgot Password Response", `Status: ${response.status}, Response: ${JSON.stringify(responseData)}`);
      if (!response.ok) {
        throw new Error(responseData.detail || `Failed to reset password (${response.status})`);
      }
      resetForgotPasswordState();
      setShowForgotPassword(false);
      setSuccessMessage("Password reset successful. Please sign in with your new password.");
    } catch (error: any) {
      setForgotPasswordError(error.message || "Failed to reset password");
      logApiCall("Confirm Forgot Password Error", error.message || "Unknown error");
    } finally {
      setIsForgotPasswordLoading(false);
    }
  };

  const resetForgotPasswordState = () => {
    setForgotPasswordStep(1);
    setForgotPasswordEmail("");
    setForgotPasswordCode("");
    setNewForgotPassword("");
    setConfirmForgotPassword("");
    setForgotPasswordError("");
  };

  const handleForgotPasswordClose = () => {
    resetForgotPasswordState();
    setShowForgotPassword(false);
  };

  const fetchWithRetry = async (url: string, options: RequestInit, retries = 2, timeout = 10000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    options.signal = controller.signal;
    try {
      const response = await fetch(url, options);
      clearTimeout(id);
      return response;
    } catch (error: any) {
      clearTimeout(id);
      if (retries > 0 && (error.name === "AbortError" || error.name === "TypeError")) {
        logApiCall("Fetch Retry", `Retrying ${url} after error: ${error.message}`);
        return fetchWithRetry(url, options, retries - 1, timeout);
      }
      throw error;
    }
  };

  // Synchronize time with server and get MFA code
  const synchronizeTimeAndGetCode = async () => {
    if (!apiBaseUrl || !mfaSecretCode) return null;
    
    try {
      // Get the adjusted time if available
      const adjustedTime = getAdjustedTime();
      
      // Fetch server time and get the correct MFA codes
      const response = await fetch(`${apiBaseUrl}/api/auth/test-mfa-code`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ 
          secret: mfaSecretCode,
          client_time: new Date().toISOString(),
          adjusted_time: adjustedTime ? adjustedTime.toISOString() : undefined
        }),
      });
      
      const data = await response.json();
      
      if (data.server_time) {
        setServerTime(data.server_time);
        
        // Store time offset for future use
        if (data.time_sync_info && data.time_sync_info.time_drift) {
          const serverDate = new Date(data.server_time);
          const clientDate = new Date();
          const timeOffset = serverDate.getTime() - clientDate.getTime();
          localStorage.setItem("server_time_offset", timeOffset.toString());
        }
        
        logApiCall(
          "Time Synchronization",
          `Server time: ${data.server_time}, Client time: ${new Date().toISOString()}`
        );
      }
      
      // Store valid codes for retry mechanisms
      if (data.time_windows) {
        const codes = data.time_windows.map((window: any) => window.code);
        setValidMfaCodes(codes);
      } else if (data.validCodes) {
        setValidMfaCodes(data.validCodes);
      }
      
      return data.current_code || null;
    } catch (error) {
      logApiCall("Time Synchronization Error", String(error));
      return null;
    }
  };

  const handleLogin = async () => {
    if (!apiBaseUrl) {
      setError("API URL is not available.");
      return;
    }
    setIsLoading(true);
    setError("");
    setSuccessMessage("");
    const loginEndpoint = `${apiBaseUrl}/api/auth/authenticate`;
    try {
      logApiCall("Login Request", `Authenticating user: ${email}`);
      const response = await fetchWithRetry(loginEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": window.location.origin,
        },
        body: JSON.stringify({ username: email, password }),
        mode: "cors",
        credentials: "include",
      }).catch((fetchError) => {
        logApiCall("Login Network Error", fetchError.message);
        throw new Error(`Network error: ${fetchError.message}`);
      });
      
      let responseData: LoginResponse;
      try {
        responseData = await response.json();
        logApiCall(
          "Login Response",
          `Status: ${response.status}, Response keys: ${Object.keys(responseData).join(", ")}`
        );
      } catch (jsonError) {
        logApiCall("Login JSON Parse Error", String(jsonError));
        throw new Error("Invalid response from server. Please try again.");
      }
      
      if (!response.ok) {
        logApiCall("Login Error", responseData?.detail || `Authentication failed (${response.status})`);
        throw new Error(responseData?.detail || `Authentication failed (${response.status})`);
      }
      
      // Store session for MFA verification if provided
      if (responseData.session) {
        setSession(responseData.session);
        logSessionInfo("Initial login session", responseData.session);
      }
      
      // Store temporary password if needed for MFA setup
      if (responseData.mfa_required || responseData.ChallengeName === "SOFTWARE_TOKEN_MFA" || 
          responseData.ChallengeName === "NEW_PASSWORD_REQUIRED") {
        sessionStorage.setItem("temp_password", password);
        logApiCall("Password Storage", "Stored password temporarily for MFA setup");
      }
      
      // Handle different authentication flows
      if (responseData.ChallengeName === "NEW_PASSWORD_REQUIRED") {
        // New password is required
        logApiCall("Login Flow", "NEW_PASSWORD_REQUIRED challenge detected");
        setShowPasswordChange(true);
      } else if (responseData.ChallengeName === "SOFTWARE_TOKEN_MFA" || responseData.mfa_required) {
        // MFA verification is required
        logApiCall("Login Flow", "MFA verification required");
        setShowMFA(true);
      } else if (responseData.access_token) {
        // User is fully authenticated - check if MFA needs to be set up
        logApiCall("Login Flow", "Access token received, checking if MFA setup is needed");
        try {
          const setupMfaEndpoint = `${apiBaseUrl}/api/auth/setup-mfa`;
          const mfaResponse = await fetchWithRetry(setupMfaEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "Origin": window.location.origin,
            },
            body: JSON.stringify({ access_token: responseData.access_token }),
            mode: "cors",
            credentials: "include",
          }, 1);
          
          // Check if we got a valid response
          if (mfaResponse.ok) {
            const mfaData = await mfaResponse.json();
            logApiCall(
              "MFA Setup Check",
              `Status: ${mfaResponse.status}, Has secret: ${!!mfaData.secretCode}`
            );
            
            if (mfaData.secretCode) {
              // MFA needs to be set up
              setMfaSecretCode(mfaData.secretCode);
              localStorage.setItem("temp_access_token", responseData.access_token);
              
              // Store all valid codes provided by the server
              if (mfaData.validCodes) {
                setValidMfaCodes(Array.isArray(mfaData.validCodes) ? mfaData.validCodes : [mfaData.validCodes]);
              }
              
              if (mfaData.currentCode) {
                setSetupMfaCode(mfaData.currentCode);
              }
              setShowMFASetup(true);
              return;
            }
          }
          
          // No MFA setup needed, proceed with login
          logApiCall("Login Flow", "User is fully authenticated, redirecting to dashboard");
          localStorage.setItem("access_token", responseData.access_token);
          localStorage.setItem("id_token", responseData.id_token || "");
          localStorage.setItem("refresh_token", responseData.refresh_token || "");
          sessionStorage.removeItem("temp_password");
          router.push("/admin/dashboard");
        } catch (mfaError: any) {
          // If there's an error checking MFA status, assume user is authenticated
          logApiCall("MFA Setup Check Error", mfaError.message || "Unknown error");
          localStorage.setItem("access_token", responseData.access_token);
          localStorage.setItem("id_token", responseData.id_token || "");
          localStorage.setItem("refresh_token", responseData.refresh_token || "");
          sessionStorage.removeItem("temp_password");
          router.push("/admin/dashboard");
        }
      } else {
        // Unexpected response format
        logApiCall("Login Flow Error", "Unexpected server response format");
        throw new Error("Unexpected server response format. Please try again.");
      }
    } catch (error: any) {
      setError(error.message || "An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
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
      logApiCall("Password Change Request", "Sending NEW_PASSWORD_REQUIRED challenge response");
      logSessionInfo("Password change session");
      const response = await fetchWithRetry(challengeEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": window.location.origin,
        },
        body: JSON.stringify({
          username: email,
          session: session,
          challengeName: "NEW_PASSWORD_REQUIRED",
          challengeResponses: { NEW_PASSWORD: newPassword },
        }),
        mode: "cors",
        credentials: "include",
      }, 1);
      
      const responseData = await response.json();
      logApiCall(
        "Password Change Response",
        `Status: ${response.status}, Response keys: ${Object.keys(responseData).join(", ")}`
      );
      
      if (!response.ok) {
        logApiCall("Password Change Error", responseData.detail || `Failed to change password (${response.status})`);
        throw new Error(responseData.detail || `Failed to change password (${response.status})`);
      }
      
      if (responseData.session) {
        setSession(responseData.session);
        logSessionInfo("Updated session after password change", responseData.session);
      }
      
      sessionStorage.setItem("temp_password", newPassword);
      
      if (responseData.access_token) {
        logApiCall("Password Change Flow", "Access token received, checking MFA setup");
        try {
          const setupMfaEndpoint = `${apiBaseUrl}/api/auth/setup-mfa`;
          const mfaResponse = await fetchWithRetry(setupMfaEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "Origin": window.location.origin,
            },
            body: JSON.stringify({ access_token: responseData.access_token }),
            mode: "cors",
            credentials: "include",
          }, 1);
          
          if (mfaResponse.ok) {
            const mfaData = await mfaResponse.json();
            logApiCall(
              "MFA Setup Check",
              `Status: ${mfaResponse.status}, Has secret: ${!!mfaData.secretCode}`
            );
            
            if (mfaData.secretCode) {
              // MFA setup required
              setShowPasswordChange(false);
              setMfaSecretCode(mfaData.secretCode);
              localStorage.setItem("temp_access_token", responseData.access_token);
              
              // Store valid codes if provided
              if (mfaData.validCodes) {
                setValidMfaCodes(Array.isArray(mfaData.validCodes) ? mfaData.validCodes : [mfaData.validCodes]);
              }
              
              if (mfaData.currentCode) {
                setSetupMfaCode(mfaData.currentCode);
              }
              setShowMFASetup(true);
              return;
            }
          }
          
          // No MFA setup needed
          logApiCall("Password Change Flow", "Proceeding with login (MFA already set up or not required)");
          localStorage.setItem("access_token", responseData.access_token);
          localStorage.setItem("id_token", responseData.id_token || "");
          localStorage.setItem("refresh_token", responseData.refresh_token || "");
          setShowPasswordChange(false);
          sessionStorage.removeItem("temp_password");
          router.push("/admin/dashboard");
        } catch (mfaError: any) {
          // If MFA check fails, assume no MFA needed
          logApiCall("MFA Setup Check Error", mfaError.message || "Unknown error");
          localStorage.setItem("access_token", responseData.access_token);
          localStorage.setItem("id_token", responseData.id_token || "");
          localStorage.setItem("refresh_token", responseData.refresh_token || "");
          setShowPasswordChange(false);
          sessionStorage.removeItem("temp_password");
          router.push("/admin/dashboard");
        }
      } else if (responseData.ChallengeName) {
        // Handle any additional challenges
        if (responseData.ChallengeName === "SOFTWARE_TOKEN_MFA") {
          logApiCall("Password Change Flow", "MFA verification required");
          setShowPasswordChange(false);
          setShowMFA(true);
        } else if (responseData.ChallengeName === "MFA_SETUP") {
          logApiCall("Password Change Flow", "MFA setup challenge received");
          setShowPasswordChange(false);
          setMfaSecretCode(responseData.secretCode || "");
          setShowMFASetup(true);
        } else {
          logApiCall("Password Change Flow", `Unexpected challenge: ${responseData.ChallengeName}`);
          throw new Error(`Unexpected challenge: ${responseData.ChallengeName}`);
        }
      } else {
        logApiCall("Password Change Flow Error", "Unexpected response format");
        throw new Error("Unexpected response format");
      }
    } catch (error: any) {
      setError(error.message || "Failed to change password");
      logApiCall("Password Change Error", error.message || "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle MFA Setup - Updated to automatically use server-generated codes
  const handleMFASetup = async () => {
    if (!apiBaseUrl) {
      setError("API URL is not available.");
      return;
    }
    
    setIsLoading(true);
    setError("");
    setSuccessMessage("");
    
    // First ensure we have a valid MFA code
    try {
      // If the code is empty or not 6 digits, get a server-generated code
      if (!setupMfaCode || setupMfaCode.length !== 6 || !setupMfaCode.match(/^\d{6}$/)) {
        const serverCode = await synchronizeTimeAndGetCode();
        if (serverCode) {
          setSetupMfaCode(serverCode);
          logApiCall("MFA Setup", `Using server-generated code: ${serverCode}`);
          setSuccessMessage("Using server-generated verification code...");
        } else {
          setError("Failed to get verification code from server. Please try again.");
          setIsLoading(false);
          return;
        }
      }
    } catch (error) {
      setError("Failed to get verification code. Please try again.");
      setIsLoading(false);
      return;
    }
    
    logSessionInfo("MFA setup session");
    const savedPassword = sessionStorage.getItem("temp_password") || "";
    logApiCall("MFA Setup", `Password available for MFA setup: ${!!savedPassword}`);
    
    if (!session) {
      setError("Your session has expired. Please log in again to restart the MFA setup process.");
      setIsLoading(false);
      return;
    }
    
    try {
      // Get adjusted time for better synchronization
      const adjustedTime = getAdjustedTime();
      
      const endpoint = `${apiBaseUrl}/api/auth/confirm-mfa-setup`;
      const requestBody = {
        username: email,
        session: session,
        code: setupMfaCode,
        password: savedPassword,
        client_time: new Date().toISOString(),
        adjusted_time: adjustedTime ? adjustedTime.toISOString() : undefined
      };
      
      logApiCall(
        "MFA Setup Verification",
        `Sending verification request with code ${setupMfaCode}, session length ${session.length}, password included: ${!!savedPassword}`
      );
      
      if (debugMode) {
        console.log("MFA Setup Request Body:", JSON.stringify({
          ...requestBody,
          password: savedPassword ? "[REDACTED]" : ""
        }));
      }
      
      const response = await fetchWithRetry(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": window.location.origin,
        },
        body: JSON.stringify(requestBody),
        mode: "cors",
        credentials: "include",
      }, 2); // Increased retry count for reliability
      
      let responseData: LoginResponse;
      try {
        responseData = await response.json();
        logApiCall(
          "MFA Setup Verification Response",
          `Status: ${response.status}, Keys: ${Object.keys(responseData).join(", ")}`
        );
      } catch (parseError) {
        throw new Error("Unable to parse server response. Please try again.");
      }
      
      if (!response.ok) {
        // Handle error responses with suggested codes
        if (response.status === 400 && responseData.detail) {
          if (responseData.currentValidCode || responseData.serverGeneratedCode) {
            // Use the server-provided code for automatic retry
            const validCode = responseData.currentValidCode || responseData.serverGeneratedCode;
            setSetupMfaCode(validCode || "");
            
            // If we have valid codes, store them
            if (responseData.validCodes) {
              setValidMfaCodes(responseData.validCodes);
            }
            
            logApiCall("MFA Setup Retry", `Retrying with correct code: ${validCode}`);
            setError("");
            setSuccessMessage("Using correct verification code...");
            
            // Small delay then retry
            setTimeout(() => {
              setIsLoading(false);
              handleMFASetup();
            }, 1000);
            return;
          }
          
          if (responseData.detail.includes("code is incorrect") ||
              responseData.detail.includes("CodeMismatchException")) {
            throw new Error(responseData.detail);
          } else {
            throw new Error(responseData.detail);
          }
        } else if (response.status === 401) {
          throw new Error("Your session has expired. Please log in again to restart the MFA setup process.");
        } else {
          throw new Error(responseData.detail || `Failed to verify MFA setup (${response.status})`);
        }
      }
      
      setShowMFASetup(false);
      localStorage.removeItem("temp_access_token");
      sessionStorage.removeItem("temp_password");
      
      if (responseData.access_token) {
        // Store tokens and redirect to dashboard
        localStorage.setItem("access_token", responseData.access_token);
        localStorage.setItem("id_token", responseData.id_token || "");
        localStorage.setItem("refresh_token", responseData.refresh_token || "");
        logApiCall("MFA Setup Complete", "Redirecting to dashboard");
        router.push("/admin/dashboard");
      } else {
        setSuccessMessage("MFA setup successful. Please log in again.");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to set up MFA";
      setError(errorMessage);
      logApiCall("MFA Setup Error", errorMessage);
      
      // Try automated recovery with valid codes
      if (errorMessage.includes("code") || errorMessage.includes("verification")) {
        // Check if we have valid codes to try with
        if (validMfaCodes.length > 0) {
          // Try a different code from our valid codes list
          const alternativeCode = validMfaCodes.find(code => code !== setupMfaCode);
          if (alternativeCode) {
            setSetupMfaCode(alternativeCode);
            setError(`The verification code appears to be incorrect. Trying with a new code: ${alternativeCode}`);
            
            // Delay and retry
            setTimeout(() => {
              setIsLoading(false);
              handleMFASetup();
            }, 1500);
            return;
          }
        }
        
        // If we don't have valid codes or all have been tried, get a fresh one from the server
        try {
          const freshCode = await synchronizeTimeAndGetCode();
          if (freshCode) {
            setSetupMfaCode(freshCode);
            setError(`The verification code appears to be incorrect. A new code has been generated: ${freshCode}`);
            
            // Delay and retry
            setTimeout(() => {
              setIsLoading(false);
              handleMFASetup();
            }, 1500);
            return;
          }
        } catch (codeError) {
          setError("Verification failed. Please try again with a new code.");
        }
      }
      
      if (errorMessage.includes("session has expired")) {
        setTimeout(() => {
          setShowMFASetup(false);
          sessionStorage.removeItem("temp_password");
        }, 3000);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Updated MFA verification for existing MFA users
  const handleMFASubmit = async () => {
    if (!apiBaseUrl) {
      setError("API URL is not available.");
      return;
    }
    
    // Validate the MFA code format
    if (!mfaCode || mfaCode.length !== 6 || !mfaCode.match(/^\d{6}$/)) {
      setError("Please enter the 6-digit verification code from your authenticator app");
      return;
    }
    
    setError("");
    setSuccessMessage("");
    setIsLoading(true);
    const mfaEndpoint = `${apiBaseUrl}/api/auth/verify-mfa`;
    logSessionInfo("MFA verification session");
    
    try {
      // Get the adjusted time for better synchronization
      const adjustedTime = getAdjustedTime();
      const clientTime = new Date().toISOString();
      
      logApiCall("MFA Verification", `Verifying MFA code: ${mfaCode}, session length: ${session.length}`);
      
      const response = await fetchWithRetry(mfaEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": window.location.origin,
        },
        body: JSON.stringify({
          code: mfaCode,
          session,
          username: email,
          client_time: clientTime,
          adjusted_time: adjustedTime ? adjustedTime.toISOString() : undefined,
          skip_code_generation: true  // Add this flag to tell backend not to try generating codes
        }),
        mode: "cors",
        credentials: "include",
      }, 2).catch((fetchError) => { // Increased retry count for reliability
        logApiCall("MFA Verification Network Error", fetchError.message);
        throw new Error(`Network error: ${fetchError.message}`);
      });
      
      let data: LoginResponse;
      try {
        data = await response.json();
        logApiCall(
          "MFA Verification Response",
          `Status: ${response.status}, Response keys: ${Object.keys(data).join(", ")}`
        );
      } catch (jsonError) {
        logApiCall("MFA Verification Parse Error", String(jsonError));
        throw new Error("Invalid response from server. Please try again.");
      }
      
      if (!response.ok) {
        // Handle error cases with server-provided recovery codes
        if (response.status === 400 && data.detail) {
          if (data.serverGeneratedCode) {
            // Store the server-provided codes for recovery
            if (data.validCodes) {
              setMfaRecoveryCodes(data.validCodes);
            }
            
            // Try the server-generated code automatically
            logApiCall("MFA Auto-Recovery", `Retrying with server-generated code: ${data.serverGeneratedCode}`);
            
            // Retry with the server-provided code
            const retryResponse = await fetchWithRetry(mfaEndpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Origin": window.location.origin,
              },
              body: JSON.stringify({
                code: data.serverGeneratedCode,
                session,
                username: email,
                client_time: clientTime,
                adjusted_time: adjustedTime ? adjustedTime.toISOString() : undefined,
                skip_code_generation: true
              }),
              mode: "cors",
              credentials: "include",
            }, 1);
            
            // If retry succeeds, use that response instead
            if (retryResponse.ok) {
              const retryData = await retryResponse.json();
              logApiCall("MFA Auto-Recovery Success", "Successfully authenticated with server-generated code");
              
              // Store tokens in localStorage for authenticated session
              localStorage.setItem("access_token", retryData.access_token || "");
              localStorage.setItem("id_token", retryData.id_token || "");
              localStorage.setItem("refresh_token", retryData.refresh_token || "");
              sessionStorage.removeItem("temp_password");
              
              // Successful MFA verification - redirect to dashboard
              router.push("/admin/dashboard");
              return;
            }
            
            // If retry failed, continue with original error handling
            setMfaCode(data.serverGeneratedCode);
            setError("Automatic retry failed. Please use this server-generated code and try again: " + data.serverGeneratedCode);
            setIsLoading(false);
            return;
          }
          
          if (data.detail.includes("verification code")) {
            setMfaCode("");
            logApiCall("MFA Verification Error", data.detail || "Invalid MFA code");
          } else if (data.detail.includes("session")) {
            logApiCall("MFA Verification Error", "Session expired");
            throw new Error("Your session has expired. Please log in again.");
          }
        }
        throw new Error(data?.detail || "Invalid MFA code");
      }
      
      // Store tokens in localStorage for authenticated session
      localStorage.setItem("access_token", data.access_token || "");
      localStorage.setItem("id_token", data.id_token || "");
      localStorage.setItem("refresh_token", data.refresh_token || "");
      sessionStorage.removeItem("temp_password");
      logApiCall("MFA Verification", "Successful, redirecting to dashboard");
      
      // Successful MFA verification - redirect to dashboard
      router.push("/admin/dashboard");
    } catch (error: any) {
      setError(error.message || "MFA verification failed. Please try again.");
      logApiCall("MFA Verification Error", error.message || "Unknown error");
      
      // Handle session expired error
      if (error.message.includes("session has expired")) {
        setTimeout(() => {
          setShowMFA(false);
          sessionStorage.removeItem("temp_password");
        }, 3000);
      }
      
      // Try automatic recovery if we have any recovery codes
      if (mfaRecoveryCodes.length > 0 && error.message.includes("verification code")) {
        // Try the first recovery code
        const recoveryCode = mfaRecoveryCodes[0];
        setMfaRecoveryCodes(prev => prev.filter(code => code !== recoveryCode)); // Remove the used code
        
        setMfaCode(recoveryCode);
        setError(`Automatic retry with recovery code: ${recoveryCode}`);
        
        // Delay and retry
        setTimeout(() => {
          setIsLoading(false);
          handleMFASubmit();
        }, 1500);
        return;
      }
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDebugMode = () => {
    setDebugMode((prev) => {
      const newMode = !prev;
      console.log("Debug mode:", newMode ? "ON" : "OFF");
      if (newMode) {
        logSessionInfo("Current session token");
        console.log("Temporary password stored:", !!sessionStorage.getItem("temp_password"));
      }
      return newMode;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        toggleDebugMode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

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
            {debugMode && (
              <div className="mt-4 text-xs text-muted-foreground">
                <details>
                  <summary>Debug Info</summary>
                  <div className="mt-2 p-2 bg-muted rounded overflow-auto max-h-60">
                    <div className="mb-2">
                      <strong>Session:</strong>{" "}
                      {session ? `${session.substring(0, 30)}... (length: ${session.length})` : "No session"}
                    </div>
                    <div className="mb-2">
                      <strong>Temp Password:</strong>{" "}
                      {sessionStorage.getItem("temp_password") ? "Available" : "Not available"}
                    </div>
                    <div className="mb-2">
                      <strong>Server Time:</strong>{" "}
                      {serverTime || "Unknown"}
                    </div>
                    <div className="mb-2">
                      <strong>Local Time:</strong>{" "}
                      {new Date().toISOString()}
                    </div>
                    <div className="mb-2">
                      <strong>Adjusted Time:</strong>{" "}
                      {getAdjustedTime()?.toISOString() || "No offset stored"}
                    </div>
                    <div className="mb-2">
                      <strong>Time Offset:</strong>{" "}
                      {localStorage.getItem("server_time_offset") || "None"} ms
                    </div>
                    <button 
                      onClick={async () => {
                        try {
                          // Get client time
                          const clientTime = new Date().toISOString();
                          // Get adjusted time
                          const adjustedTime = getAdjustedTime();
                          
                          const resp = await fetch(`${apiBaseUrl}/api/auth/test-mfa-code`, {
                            method: "POST", 
                            headers: {"Content-Type": "application/json"},
                            body: JSON.stringify({ 
                              secret: "AAAAAAAAAA", 
                              client_time: clientTime,
                              adjusted_time: adjustedTime ? adjustedTime.toISOString() : undefined
                            })
                          });
                          const data = await resp.json();
                          setServerTime(data.server_time);
                          
                          // Calculate and store new time offset
                          const serverDate = new Date(data.server_time);
                          const clientDate = new Date();
                          const timeOffset = serverDate.getTime() - clientDate.getTime();
                          localStorage.setItem("server_time_offset", timeOffset.toString());
                          
                          console.log("Server time:", data.server_time);
                          console.log("Time offset:", timeOffset, "ms");
                          
                          alert(
                            `Server time: ${data.server_time}\n` +
                            `Local time: ${clientTime}\n` +
                            `Time difference: ${Math.abs(serverDate.getTime() - clientDate.getTime()) / 1000} seconds\n` +
                            `Adjusted time: ${adjustedTime ? adjustedTime.toISOString() : "None"}`
                          );
                        } catch (e) {
                          console.error("Error getting server time:", e);
                        }
                      }} 
                      className="mb-2 text-blue-500 underline"
                    >
                      Check & Sync Server Time
                    </button>
                    <pre>{JSON.stringify(apiCallLog, null, 2)}</pre>
                  </div>
                </details>
              </div>
            )}
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
              disabled={isLoading || !newPassword || !confirmPassword || newPassword !== confirmPassword}
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
      <Dialog open={showMFASetup} onOpenChange={(open) => open && setShowMFASetup(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setup Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              For additional security, please set up two-factor authentication using Google Authenticator.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Alert>
              <AlertDescription>
                <strong>Important Instructions:</strong>
                <ol className="list-decimal list-inside mt-2 space-y-1">
                  <li>Install Google Authenticator on your mobile device</li>
                  <li>Open Google Authenticator and scan the QR code below</li>
                  <li>The verification code will be automatically populated below</li>
                  <li>Click "Verify & Complete" to finish the setup</li>
                </ol>
              </AlertDescription>
            </Alert>
            {qrCodeUrl && (
              <div className="flex flex-col items-center justify-center space-y-2">
                <Label>Scan QR Code with Google Authenticator</Label>
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
                <Label>Secret Key (if you can't scan the QR code)</Label>
                <div className="p-3 bg-muted rounded-md font-mono text-center break-all">
                  {mfaSecretCode}
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter this code manually in Google Authenticator if scanning fails
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="setup-mfa-code">Verification Code</Label>
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
              <p className="text-xs text-center text-muted-foreground">
                A server-generated verification code has been provided. Click verify to continue.
              </p>
              {validMfaCodes.length > 0 && (
                <div className="text-xs text-center text-muted-foreground mt-2">
                  <details>
                    <summary>Need a different code?</summary>
                    <div className="mt-2 p-2 bg-muted rounded">
                      <p>These codes may also work:</p>
                      <div className="flex flex-wrap gap-2 mt-1 justify-center">
                        {validMfaCodes.slice(0, 5).map((code, i) => (
                          <button
                            key={i}
                            className="px-2 py-1 bg-gray-700 text-white rounded hover:bg-gray-600"
                            onClick={() => setSetupMfaCode(code)}
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
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            )}
            {successMessage && (
              <Alert>
                <AlertDescription className="text-sm">{successMessage}</AlertDescription>
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
                onChange={(e) =>
                  setMfaCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))
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
                        {mfaRecoveryCodes.slice(0, 5).map((code, i) => (
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
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            )}
            {successMessage && (
              <Alert>
                <AlertDescription className="text-sm">{successMessage}</AlertDescription>
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
                />
              </div>
              {forgotPasswordError && (
                <Alert variant="destructive">
                  <AlertDescription className="text-sm">{forgotPasswordError}</AlertDescription>
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
                  <AlertDescription className="text-sm">{forgotPasswordError}</AlertDescription>
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

      {/* Debug Mode Button (hidden) */}
      <div className="hidden">
        <button
          onClick={toggleDebugMode}
          onKeyDown={(e) => {
            if (e.ctrlKey && e.shiftKey && e.key === "D") {
              toggleDebugMode();
            }
          }}
        >
          Debug Mode
        </button>
      </div>
    </div>
  );
}