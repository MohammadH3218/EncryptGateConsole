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

type UserType = "admin" | "employee";

interface LoginResponse {
    token?: string | null;
    mfa_required: boolean;
    session?: string | null;
    role?: string | null;
    detail?: string | null;
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

    const handleLogin = async () => {
        console.log("Attempting login...");
        setIsLoading(true);

        try {
            const formData = new URLSearchParams();
            formData.append("username", email);
            formData.append("password", password);

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: formData.toString(),
            });

            const responseData: LoginResponse = await response.json();

            if (!response.ok) {
                throw new Error(responseData?.detail || "Invalid credentials");
            }

            if (responseData.mfa_required) {
                setSession(responseData.session || "");
                setShowMFA(true);
            } else if (responseData.token) {
                localStorage.setItem("token", responseData.token);
                router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard");
            } else {
                setError("Login failed: Token missing");
            }
        } catch (error: any) {
            setError(error.message || "Login error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    const handleMFASubmit = async () => {
        setError("");
        setIsLoading(true);

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/verify-mfa`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ code: mfaCode, session }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data?.detail || "Invalid MFA code");
            }

            if (data.token) {
                localStorage.setItem("token", data.token);
                router.push(userType === "admin" ? "/admin/dashboard" : "/employee/dashboard");
            } else {
                setError("MFA verification failed: Token missing");
            }
        } catch (error: any) {
            setError(error.message || "MFA verification error occurred");
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
                <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
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
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" disabled={isLoading} className="w-full">
                            {isLoading ? "Signing in..." : "Sign in"}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
