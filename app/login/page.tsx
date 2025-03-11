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
import { Loader2 } from 'lucide-react';

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
  serverCode?: string;
  clientCode?: string;
  adjustedCode?: string;
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
  const [apiCallLog, setApiCallLog] = useState<Array<{timestamp: string, action: string, result: string}>>([]);

  // Helper function to log API calls for debugging
  const logApiCall = useCallback((action: string, result: string) => {
    if (debugMode) {
      const timestamp = new Date().toISOString();
      setApiCallLog(prev => [...prev, { timestamp, action, result }]);
      console.log(`[${timestamp}] ${action}: ${result}`);
    }
  }, [debugMode]);

  // Helper function to log session token info
  const logSessionInfo = useCallback((label: string, sessionToken?: string) => {
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
      setApiCallLog(prev => [...prev, { 
        timestamp: new Date().toISOString(),
        action: "Session Info", 
        result: `${label}: Length=${token.length}, First 20 chars=${token.substring(0, 20)}`
      }]);
    }
  }, [session, debugMode, setApiCallLog]);

  // Fetch API URL from the backend with fallback
  useEffect(() => {
    const configuredUrl = process.env.NEXT_PUBLIC_API_URL;
    
    // Use the configured URL or fall back to the correct API URL
    const fallbackUrl = "https://api.console-encryptgate.net";
    const finalUrl = configuredUrl || fallbackUrl;
    
    setApiBaseUrl(finalUrl);
    logApiCall("API URL Configuration", `Set API URL to ${finalUrl}`);
    
    // Check server time when API URL is set
    if (finalUrl) {
      fetchServerTime(finalUrl);
    }
  }, [logApiCall]);

  // Enhanced time synchronization function that returns more detailed info
  const synchronizeTime = async () => {
    if (!apiBaseUrl) return null;

    try {
      // First, get server time and calculate offset
      const response = await fetch(`${apiBaseUrl}/api/auth/test-mfa-code`, {
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ 
          secret: "AAAAAAAAAA", 
          code: "000000",
          client_time: new Date().toISOString()
        })
      });
      
      const data = await response.json();
      
      if (data.server_time) {
        setServerTime(data.server_time);
        
        // Calculate and store time offset
        const serverDate = new Date(data.server_time);
        const clientDate = new Date();
        const timeOffset = serverDate.getTime() - clientDate.getTime();
        
        // Store the offset with a timestamp to know when it was calculated
        localStorage.setItem("server_time_offset", timeOffset.toString());
        localStorage.setItem("time_sync_timestamp", Date.now().toString());
        
        logApiCall("Time Synchronization", 
          `Server time: ${data.server_time}, Client time: ${clientDate.toISOString()}, Offset: ${timeOffset}ms`);
        
        return {
          timeOffset,
          serverTime: data.server_time,
          clientTime: clientDate.toISOString(),
          diffSeconds: Math.abs(timeOffset) / 1000
        };
      }
    } catch (error) {
      console.error("Failed to synchronize time:", error);
      logApiCall("Time Synchronization Error", String(error));
    }

    return null;
  };

  // Update the fetchServerTime function to check and handle time differences
  const fetchServerTime = async (baseUrl: string) => {
    try {
      const response = await fetch(`${baseUrl}/api/auth/test-mfa-code`, {
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ secret: "AAAAAAAAAA", code: "000000" })
      });
      const data = await response.json();
      
      if (data.server_time) {
        setServerTime(data.server_time);
        
        // Check time difference
        const serverDate = new Date(data.server_time);
        const clientDate = new Date();
        const diffMs = Math.abs(serverDate.getTime() - clientDate.getTime());
        
        if (diffMs > 30000) { // 30 seconds
          console.warn(`Time synchronization issue: Server time differs by ${Math.round(diffMs/1000)} seconds`);
        
          // Store the time offset for future calculations
          const timeOffset = serverDate.getTime() - clientDate.getTime();
          localStorage.setItem("server_time_offset", timeOffset.toString());
          localStorage.setItem("time_sync_timestamp", Date.now().toString());
        
          if (debugMode) {
            setApiCallLog(prev => [...prev, {
              timestamp: new Date().toISOString(),
              action: "Time Sync Warning",
              result: `Server time differs by ${Math.round(diffMs/1000)} seconds. Offset stored for MFA verification.`
            }]);
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch server time:", error);
    }
  };

  // Function to get server-adjusted time for MFA verification
  const getServerAdjustedTime = () => {
    const timeOffset = localStorage.getItem("server_time_offset");
    const syncTimestamp = localStorage.getItem("time_sync_timestamp");
    
    if (!timeOffset) return null;
    
    // Calculate what the server time would be right now
    const serverTimeNow = new Date(Date.now() + parseInt(timeOffset));
    
    // Check if our time sync is recent enough (within last hour)
    const isSyncRecent = syncTimestamp && 
      (Date.now() - parseInt(syncTimestamp)) < 3600000; // 1 hour in milliseconds
    
    // Log the adjusted time for debugging
    if (debugMode) {
      console.log(`[Server Time Adjustment] Original: ${new Date().toISOString()}`);
      console.log(`[Server Time Adjustment] Adjusted: ${serverTimeNow.toISOString()}`);
      console.log(`[Server Time Adjustment] Offset: ${timeOffset}ms, Sync Recent: ${isSyncRecent}`);
    }
    
    return serverTimeNow;
  };

  // Generate QR code URL when secret code is available
  useEffect(() => {
    if (mfaSecretCode) {
      // Create a QR code URL for the authenticator app
      // Format optimized for Google Authenticator
      const serviceName = "EncryptGate";
      const otpauthUrl = `otpauth://totp/${serviceName.toLowerCase()}:${encodeURIComponent(email)}?secret=${mfaSecretCode}&issuer=${serviceName.toLowerCase()}`;
      
      // Generate QR code URL using a QR code API
      const qrCodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`;
      setQrCodeUrl(qrCodeApiUrl);
      
      logApiCall("QR Code Generation", `Generated QR code for secret: ${mfaSecretCode}`);
      
      // Try to get current valid code from server
      getCurrentValidCode();
    }
  }, [mfaSecretCode, email, logApiCall]);

  // Enhanced getCurrentValidCode function that uses server's time
  const getCurrentValidCode = async (): Promise<string | null> => {
    if (!apiBaseUrl || !mfaSecretCode) return null;

    try {
      // Always send both client time and adjusted time
      const clientTime = new Date().toISOString();
      const serverAdjustedTime = getServerAdjustedTime()?.toISOString() || clientTime;
      
      const response = await fetch(`${apiBaseUrl}/api/auth/test-mfa-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          secret: mfaSecretCode,
          client_time: clientTime,
          adjusted_time: serverAdjustedTime
        }),
      });
    
      const result = await response.json();
      
      // Try to use server-generated code first, fallback to client-code if provided
      if (result.current_code) {
        logApiCall("Get Current MFA Code", `Using server's current code: ${result.current_code}`);
        return result.current_code;
      } else if (result.client_code) {
        logApiCall("Get Current MFA Code", `Using client-adjusted code: ${result.client_code}`);
        return result.client_code;
      }
      
      return null;
    } catch (error) {
      logApiCall("Get Current MFA Code Error", String(error));
      return null;
    }
  };

  // Update the testMfaCode function to properly handle time synchronization
  const testMfaCode = async (code: string): Promise<boolean> => {
    if (!apiBaseUrl || !mfaSecretCode) return false;
  
    try {
      // Get current client time and server-adjusted time
      const clientTime = new Date().toISOString();
      const serverAdjustedTime = getServerAdjustedTime()?.toISOString() || clientTime;
      
      const response = await fetch(`${apiBaseUrl}/api/auth/test-mfa-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          secret: mfaSecretCode,
          code: code,
          client_time: clientTime,
          adjusted_time: serverAdjustedTime
        }),
      });
    
      const result = await response.json();
      logApiCall("MFA Code Test", JSON.stringify(result));
    
      // If server provides a valid code, use it
      if (!result.valid && (result.current_code || result.serverCode)) {
        const suggestedCode = result.current_code || result.serverCode;
        setSetupMfaCode(suggestedCode);
        setError(`Code mismatch. Try using this code instead: ${suggestedCode}`);
      }
    
      return result.valid;
    } catch (error) {
      logApiCall("MFA Code Test Error", String(error));
      return false;
    }
  };

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
      
      logApiCall("Forgot Password Request", `Initiating request for email: ${forgotPasswordEmail}`);
      
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
      
      logApiCall("Forgot Password Response", `Status: ${response.status}, Response: ${JSON.stringify(responseData)}`);
      
      if (!response.ok) {
        throw new Error(responseData.detail || `Failed to initiate password reset (${response.status})`);
      }
      
      // Move to confirmation step
      setForgotPasswordStep(2);
    } catch (error: any) {
      setForgotPasswordError(error.message || "Failed to initiate password reset");
      logApiCall("Forgot Password Error", error.message || "Unknown error");
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
      
      logApiCall("Confirm Forgot Password", `Confirming reset for email: ${forgotPasswordEmail} with code: ${forgotPasswordCode}`);
      
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
      
      logApiCall("Confirm Forgot Password Response", `Status: ${response.status}, Response: ${JSON.stringify(responseData)}`);
      
      if (!response.ok) {
        throw new Error(responseData.detail || `Failed to reset password (${response.status})`);
      }
      
      // Reset state and close dialog
      resetForgotPasswordState();
      setShowForgotPassword(false);
      
      // Show success message
      setSuccessMessage("Password reset successful. Please sign in with your new password.");
    } catch (error: any) {
      setForgotPasswordError(error.message || "Failed to reset password");
      logApiCall("Confirm Forgot Password Error", error.message || "Unknown error");
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

  // Make fetch with timeout and retry for better error handling
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
      
      if (retries > 0 && (error.name === 'AbortError' || error.name === 'TypeError')) {
        logApiCall("Fetch Retry", `Retrying ${url} after error: ${error.message}`);
        return fetchWithRetry(url, options, retries - 1, timeout);
      }
      
      throw error;
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
          "Origin": window.location.origin
        },
        body: JSON.stringify({
          username: email,
          password,
        }),
        mode: "cors",
        credentials: "include",
      }).catch(fetchError => {
        logApiCall("Login Network Error", fetchError.message);
        throw new Error(`Network error: ${fetchError.message}`);
      });

      let responseData: LoginResponse;
      try {
        responseData = await response.json();
        logApiCall("Login Response", `Status: ${response.status}, Response keys: ${Object.keys(responseData).join(', ')}`);
      } catch (jsonError) {
        logApiCall("Login JSON Parse Error", String(jsonError));
        throw new Error("Invalid response from server. Please try again.");
      }

      if (!response.ok) {
        logApiCall("Login Error", responseData?.detail || `Authentication failed (${response.status})`);
        throw new Error(responseData?.detail || `Authentication failed (${response.status})`);
      }

      // Immediately save session if available - THIS IS CRITICAL FOR MFA FLOW
      if (responseData.session) {
        setSession(responseData.session);
        logSessionInfo("Initial login session", responseData.session);
      }

      // Store password temporarily for MFA setup if needed
      if (responseData.mfa_required || responseData.ChallengeName === "NEW_PASSWORD_REQUIRED") {
        sessionStorage.setItem("temp_password", password);
        logApiCall("Password Storage", "Stored password temporarily for MFA setup");
      }

      // Handle different authentication flows
      if (responseData.ChallengeName === "NEW_PASSWORD_REQUIRED") {
        // Handle password change requirement
        logApiCall("Login Flow", "NEW_PASSWORD_REQUIRED challenge detected");
        setShowPasswordChange(true);
      } else if (responseData.access_token) {
        // We have an access token, check if we need to set up MFA
        logApiCall("Login Flow", "Access token received, checking MFA setup");
        try {
          const setupMfaEndpoint = `${apiBaseUrl}/api/auth/setup-mfa`;
          const mfaResponse = await fetchWithRetry(setupMfaEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "Origin": window.location.origin
            },
            body: JSON.stringify({
              access_token: responseData.access_token
            }),
            mode: "cors",
            credentials: "include",
          }, 1);
          
          const mfaData = await mfaResponse.json();
          logApiCall("MFA Setup Check", `Status: ${mfaResponse.status}, Has secret: ${!!mfaData.secretCode}`);
          
          if (mfaResponse.ok && mfaData.secretCode) {
            // We have a secret code - show MFA setup
            setMfaSecretCode(mfaData.secretCode);
            // Store the access token for later use in MFA verification
            localStorage.setItem("temp_access_token", responseData.access_token);
            // If there's a current valid code from the server, use it
            if (mfaData.currentCode) {
              setSetupMfaCode(mfaData.currentCode);
            }
            setShowMFASetup(true);
            return;
          }
        } catch (mfaError: any) {
          // Continue with login if MFA setup fails - user is already authenticated
          logApiCall("MFA Setup Check Error", mfaError.message || "Unknown error");
        }
        
        logApiCall("Login Flow", "Proceeding with login (MFA already set up or not required)");
        
        // Store tokens and redirect
        localStorage.setItem("access_token", responseData.access_token);
        localStorage.setItem("id_token", responseData.id_token || "");
        localStorage.setItem("refresh_token", responseData.refresh_token || "");
        // Clear temporary password
        sessionStorage.removeItem("temp_password");
        router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard");
      } else if (responseData.mfa_required) {
        // Standard MFA verification
        logApiCall("Login Flow", "MFA verification required");
        setShowMFA(true);
      } else {
        logApiCall("Login Flow Error", "Unexpected server response format");
        throw new Error("Unexpected server response format");
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
      }, 1);
      
      const responseData = await response.json();
      
      logApiCall("Password Change Response", `Status: ${response.status}, Response keys: ${Object.keys(responseData).join(', ')}`);
      
      if (!response.ok) {
        logApiCall("Password Change Error", responseData.detail || `Failed to change password (${response.status})`);
        throw new Error(responseData.detail || `Failed to change password (${response.status})`);
      }
      
      // Save new session if available - CRITICAL FOR MFA FLOW
      if (responseData.session) {
        setSession(responseData.session);
        logSessionInfo("Updated session after password change", responseData.session);
      }

      // Update stored password for MFA setup
      sessionStorage.setItem("temp_password", newPassword);
      
      // Handle different response types
      if (responseData.access_token) {
        // We have access_token, try to set up MFA
        logApiCall("Password Change Flow", "Access token received, checking MFA setup");
        try {
          const setupMfaEndpoint = `${apiBaseUrl}/api/auth/setup-mfa`;
          const mfaResponse = await fetchWithRetry(setupMfaEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "Origin": window.location.origin
            },
            body: JSON.stringify({
              access_token: responseData.access_token
            }),
            mode: "cors",
            credentials: "include",
          }, 1);
          
          const mfaData = await mfaResponse.json();
          
          logApiCall("MFA Setup Check", `Status: ${mfaResponse.status}, Has secret: ${!!mfaData.secretCode}`);
          
          if (mfaResponse.ok && mfaData.secretCode) {
            // Close password change dialog and show MFA setup
            setShowPasswordChange(false);
            setMfaSecretCode(mfaData.secretCode);
            // Store the access token for later use in MFA verification
            localStorage.setItem("temp_access_token", responseData.access_token);
            // If there's a current valid code from the server, use it
            if (mfaData.currentCode) {
              setSetupMfaCode(mfaData.currentCode);
            }
            setShowMFASetup(true);
            return;
          }
        } catch (mfaError: any) {
          // Continue with login if MFA setup fails
          logApiCall("MFA Setup Check Error", mfaError.message || "Unknown error");
        }
        
        logApiCall("Password Change Flow", "Proceeding with login (MFA already set up or not required)");
        
        // Store tokens and redirect
        localStorage.setItem("access_token", responseData.access_token);
        localStorage.setItem("id_token", responseData.id_token || "");
        localStorage.setItem("refresh_token", responseData.refresh_token || "");
        setShowPasswordChange(false);
        // Clear temporary password
        sessionStorage.removeItem("temp_password");
        router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard");
      } else if (responseData.ChallengeName) {
        // Handle additional challenges
        if (responseData.ChallengeName === "MFA_SETUP") {
          logApiCall("Password Change Flow", "MFA setup challenge received");
          setShowPasswordChange(false);
          setMfaSecretCode(responseData.secretCode || "");
          setShowMFASetup(true);
        } else if (responseData.mfa_required) {
          logApiCall("Password Change Flow", "MFA verification required");
          setShowPasswordChange(false);
          setShowMFA(true);
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

  // Enhanced refreshMfaCode function with improved time handling
  const refreshMfaCode = async () => {
    if (!mfaSecretCode) return;
  
    setIsLoading(true);
    setError("");
    
    try {
      // Always synchronize time first
      await synchronizeTime();
      
      // Get current valid code from server
      const endpoint = `${apiBaseUrl}/api/auth/test-mfa-code`;
      
      // Get current client time and server-adjusted time
      const clientTime = new Date().toISOString();
      const serverAdjustedTime = getServerAdjustedTime()?.toISOString();
      
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          secret: mfaSecretCode,
          client_time: clientTime,
          adjusted_time: serverAdjustedTime
        }),
      });
    
      const result = await response.json();
      
      // Use the best available code
      let freshCode = null;
      if (result.client_code && serverAdjustedTime) {
        // If we have client-adjusted time and the server generated a code for it
        freshCode = result.client_code;
        logApiCall("Get Current MFA Code", `Using client-adjusted code: ${freshCode}`);
      } else if (result.current_code) {
        // Otherwise use server's current code
        freshCode = result.current_code;
        logApiCall("Get Current MFA Code", `Using server's current code: ${freshCode}`);
      }
      
      if (freshCode) {
        setSetupMfaCode(freshCode);
        setSuccessMessage("Using the current valid code from the server. Click Verify to continue.");
      } else {
        setError("Could not get a valid code from the server. Please try manually.");
      }
    } catch (error) {
      setError("Failed to get a valid code. Try typing the code from your Google Authenticator app.");
      logApiCall("Refresh MFA Code Error", String(error));
    } finally {
      setIsLoading(false);
    }
  };

  // Enhanced MFA setup function with improved time handling
  const handleMFASetup = async () => {
    if (!apiBaseUrl) {
      setError("API URL is not available.");
      return;
    }

    if (setupMfaCode.length !== 6) {
      setError("Please enter a valid 6-digit code from your authenticator app.");
      return;
    }

    // Always synchronize time first to ensure we have the latest offset
    setIsLoading(true);
    try {
      const timeInfo = await synchronizeTime();
      if (timeInfo && Math.abs(timeInfo.diffSeconds) > 30) {
        logApiCall("Time Synchronization", `Large time difference detected: ${timeInfo.diffSeconds} seconds`);
      }
    } catch (timeError) {
      logApiCall("Time Sync Error", String(timeError));
      // Continue even if time sync fails
    }

    // Get the password from session storage
    const savedPassword = sessionStorage.getItem("temp_password") || "";
    logApiCall("MFA Setup", `Password available for MFA setup: ${!!savedPassword}`);

    // Log critical session info
    logSessionInfo("MFA setup session");

    // Validate the session before proceeding
    if (!session) {
      setError("Your session has expired. Please log in again to restart the MFA setup process.");
      setIsLoading(false);
      return;
    }

    try {
      // Get current client time and server-adjusted time
      const clientTime = new Date().toISOString();
      const serverAdjustedTime = getServerAdjustedTime()?.toISOString();
      
      // Use the session-based flow for MFA verification
      const endpoint = `${apiBaseUrl}/api/auth/confirm-mfa-setup`;
      
      const requestBody = {
        username: email,
        session: session,
        code: setupMfaCode,
        password: savedPassword,
        client_time: clientTime,
        adjusted_time: serverAdjustedTime
      };
    
      logApiCall("MFA Setup Verification", 
        `Sending verification request with code ${setupMfaCode}, session length ${session.length}, adjusted time: ${serverAdjustedTime}`);
    
      const response = await fetchWithRetry(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": window.location.origin
        },
        body: JSON.stringify(requestBody),
        mode: "cors",
        credentials: "include",
      }, 2); // Increase retries to 2
    
      // Process response
      const responseData = await response.json();
      logApiCall("MFA Setup Verification Response", 
        `Status: ${response.status}, Keys: ${Object.keys(responseData).join(', ')}`);
      
      if (!response.ok) {
        // Check for time-related errors and server-suggested codes
        if (responseData.currentValidCode || responseData.serverCode || responseData.adjustedCode) {
          // Try the server-suggested code
          const suggestedCode = responseData.currentValidCode || responseData.serverCode || responseData.adjustedCode;
          setSetupMfaCode(suggestedCode);
          throw new Error(`The code you entered is incorrect. Try this server-generated code: ${suggestedCode}`);
        } else if (response.status === 401) {
          throw new Error("Your session has expired. Please log in again to restart the MFA setup process.");
        } else {
          throw new Error(responseData.detail || `Failed to verify MFA setup (${response.status})`);
        }
      }
    
      // MFA setup successful
      setShowMFASetup(false);
      localStorage.removeItem("temp_access_token");
      sessionStorage.removeItem("temp_password");
    
      // Check if we received tokens in the response
      if (responseData.access_token) {
        localStorage.setItem("access_token", responseData.access_token);
        localStorage.setItem("id_token", responseData.id_token || "");
        localStorage.setItem("refresh_token", responseData.refresh_token || "");
        setSuccessMessage("MFA setup successful. Redirecting to dashboard...");
        setTimeout(() => {
          router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard");
        }, 1000);
      } else {
        setSuccessMessage("MFA setup successful. Please log in again.");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to set up MFA";
      setError(errorMessage);
      logApiCall("MFA Setup Error", errorMessage);
    
      // If the error suggests using a server-generated code, don't clear the input
      if (!errorMessage.includes("Try this server-generated code") && 
          (errorMessage.includes("code") || errorMessage.includes("verification"))) {
        setSetupMfaCode("");
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

  // Enhanced MFA verification function with improved time handling
  const handleMFASubmit = async () => {
    if (!apiBaseUrl) {
      setError("API URL is not available.");
      return;
    }

    setError("");
    setIsLoading(true);

    // Always synchronize time first to ensure we have the latest offset
    try {
      await synchronizeTime();
    } catch (timeError) {
      // Continue even if time sync fails
      logApiCall("Time Sync Error", String(timeError));
    }

    const mfaEndpoint = `${apiBaseUrl}/api/auth/verify-mfa`;
    
    // Log session information for debugging
    logSessionInfo("MFA verification session");

    try {
      // Get current client time and server-adjusted time
      const clientTime = new Date().toISOString();
      const serverAdjustedTime = getServerAdjustedTime()?.toISOString();
      
      logApiCall("MFA Verification", 
        `Verifying MFA code: ${mfaCode}, adjusted time: ${serverAdjustedTime}`);
    
      const response = await fetchWithRetry(mfaEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": window.location.origin
        },
        body: JSON.stringify({ 
          code: mfaCode, 
          session, 
          username: email,
          client_time: clientTime,
          adjusted_time: serverAdjustedTime
        }),
        mode: "cors",
        credentials: "include",
      }, 2).catch(fetchError => {
        logApiCall("MFA Verification Network Error", fetchError.message);
        throw new Error(`Network error: ${fetchError.message}`);
      });

      const data = await response.json();
      logApiCall("MFA Verification Response", 
        `Status: ${response.status}, Response keys: ${Object.keys(data).join(', ')}`);

      if (!response.ok) {
        if (response.status === 400 && data.detail && data.detail.includes("verification code")) {
          // If server provides a valid code, suggest it
          if (data.currentValidCode || data.serverCode) {
            const suggestedCode = data.currentValidCode || data.serverCode;
            setMfaCode(suggestedCode);
            throw new Error(`Code mismatch. Try using this server-generated code: ${suggestedCode}`);
          }
        
          setMfaCode("");
        } else if (response.status === 401 && data.detail && data.detail.includes("session")) {
          throw new Error("Your session has expired. Please log in again.");
        }
        throw new Error(data?.detail || "Invalid MFA code");
      }

      // Authentication successful - store tokens and redirect
      localStorage.setItem("access_token", data.access_token || "");
      localStorage.setItem("id_token", data.id_token || "");
      localStorage.setItem("refresh_token", data.refresh_token || "");
      sessionStorage.removeItem("temp_password");

      logApiCall("MFA Verification", "Successful, redirecting to dashboard");
      setSuccessMessage("Verification successful. Redirecting to dashboard...");
      setTimeout(() => {
        router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard");
      }, 1000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "MFA verification failed. Please try again.";
      setError(errorMessage);
      logApiCall("MFA Verification Error", errorMessage);
    
      // Don't clear the code if it's suggesting a server-generated code
      if (!errorMessage.includes("Try using this server-generated code")) {
        setMfaCode("");
      }
      
      if (errorMessage.includes("session has expired")) {
        setTimeout(() => {
          setShowMFA(false);
          sessionStorage.removeItem("temp_password");
        }, 3000);
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  // Helper to regenerate MFA setup
  const handleRegenerateMfaSetup = async () => {
    if (!apiBaseUrl) {
      setError("API URL is not available.");
      return;
    }
    
    setIsLoading(true);
    setError("");
    
    try {
      // Get the access token from localStorage
      const accessToken = localStorage.getItem("temp_access_token") || localStorage.getItem("access_token");
      
      if (!accessToken) {
        throw new Error("Authentication session expired. Please log in again.");
      }
      
      logApiCall("Regenerate MFA Setup", "Requesting new MFA setup");
      
      const setupMfaEndpoint = `${apiBaseUrl}/api/auth/setup-mfa`;
      const mfaResponse = await fetchWithRetry(setupMfaEndpoint, {
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
      }, 1);
      
      const mfaData = await mfaResponse.json();
      
      logApiCall("Regenerate MFA Setup Response", `Status: ${mfaResponse.status}, Has secret: ${!!mfaData.secretCode}`);
      
      if (mfaResponse.ok && mfaData.secretCode) {
        // Update the secret code and clear the input
        setMfaSecretCode(mfaData.secretCode);
        // If there's a current valid code from the server, use it
        if (mfaData.currentCode) {
          setSetupMfaCode(mfaData.currentCode);
        } else {
          setSetupMfaCode("");
        }
        setMfaSetupAttempts(0);
        setSuccessMessage("MFA setup regenerated. Scan the new QR code with Google Authenticator.");
        return;
      } else {
        throw new Error(mfaData.detail || "Failed to regenerate MFA setup");
      }
    } catch (error: any) {
      setError(error.message || "Failed to regenerate MFA setup");
      logApiCall("Regenerate MFA Setup Error", error.message || "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle debug mode for development
  const toggleDebugMode = () => {
    setDebugMode(prev => {
      const newMode = !prev;
      console.log("Debug mode:", newMode ? "ON" : "OFF");
      // Automatically log session info when debug mode is turned on
      if (newMode) {
        logSessionInfo("Current session token");
        console.log("Temporary password stored:", !!sessionStorage.getItem("temp_password"));
      }
      return newMode;
    });
  };

  // Add key listener for Ctrl+Shift+D to toggle debug mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        toggleDebugMode();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
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
                    <button 
                      onClick={async () => {
                        try {
                          const resp = await fetch(`${apiBaseUrl}/api/auth/test-mfa-code`, {
                            method: "POST", 
                            headers: {"Content-Type": "application/json"},
                            body: JSON.stringify({secret: "AAAAAAAAAA", code: "000000"})
                          });
                          const data = await resp.json();
                          setServerTime(data.server_time);
                          console.log("Server time:", data.server_time);
                          alert(`Server time: ${data.server_time}\nLocal time: ${new Date().toISOString()}`);
                        } catch (e) {
                          console.error("Error getting server time:", e);
                        }
                      }} 
                      className="mb-2 text-blue-500 underline"
                    >
                      Check Server Time
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
                  <li>Enter the 6-digit code shown in Google Authenticator</li>
                  <li>Click "Get Current Code" if you encounter any issues</li>
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
              <Label htmlFor="setup-mfa-code">Verification Code from Google Authenticator</Label>
              <Input
                id="setup-mfa-code"
                placeholder="000000"
                value={setupMfaCode}
                onChange={(e) => setSetupMfaCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                maxLength={6}
                className="text-center text-2xl tracking-widest"
              />
              <p className="text-xs text-center text-muted-foreground">
                Enter the current code shown in Google Authenticator app
              </p>
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
              variant="secondary"
              onClick={refreshMfaCode}
              disabled={isLoading}
              className="sm:w-auto w-full"
            >
              Get Current Code
            </Button>
            <Button 
              variant="outline"
              onClick={handleRegenerateMfaSetup}
              disabled={isLoading}
              className="sm:w-auto w-full"
            >
              Regenerate QR
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
            {successMessage && (
              <Alert>
                <AlertDescription className="text-sm">{successMessage}</AlertDescription>
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
                  disabled={!forgotPasswordCode || !newForgotPassword || !confirmForgotPassword || isForgotPasswordLoading}
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
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
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