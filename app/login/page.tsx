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
} from "@/components/ui/dialog";

type UserType = "admin" | "employee";

interface LoginResponse {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  mfa_required?: boolean;
  session?: string;
  email?: string;
  role?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [userType, setUserType] = useState<UserType>("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showMFA, setShowMFA] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [session, setSession] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null);

  // Fetch API URL from the backend
  useEffect(() => {
    const fetchApiUrl = async () => {
      try {
        const response = await fetch("/api/config");
        const data = await response.json();
        if (data.apiUrl) {
          setApiBaseUrl(data.apiUrl);
        } else {
          setError("API URL is not configured correctly.");
        }
      } catch (error) {
        setError("Failed to fetch API URL.");
      }
    };
    fetchApiUrl();
  }, []);

  const handleLogin = async () => {
    if (!apiBaseUrl) {
      setError("API URL is not available.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/authenticate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: email,
          password,
        }),
      });

      const responseData: LoginResponse = await response.json();

      if (!response.ok) {
        throw new Error(responseData?.email || "Invalid credentials");
      }

      if (responseData.mfa_required) {
        setSession(responseData.session || "");
        setShowMFA(true);
      } else if (responseData.id_token && responseData.access_token) {
        localStorage.setItem("access_token", responseData.access_token);
        localStorage.setItem("id_token", responseData.id_token);
        localStorage.setItem("refresh_token", responseData.refresh_token || "");
        router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard");
      } else {
        throw new Error("Unexpected server response");
      }
    } catch (error: any) {
      console.error("Login error:", error.message);
      setError(error.message || "An error occurred. Please try again.");
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

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/verify-mfa`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: mfaCode, session, username: email }),
      });

      const data: LoginResponse = await response.json();

      if (!response.ok) {
        throw new Error("Invalid MFA code");
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
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
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
            <RadioGroup value={userType} onValueChange={(value: UserType) => setUserType(value)} className="grid gap-4">
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
              <Input id="email" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} />
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
    </div>
  );
}
