"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { LogoText } from "@/components/ui/logo-text";
import { Progress } from "@/components/ui/progress";
import { QrCode, KeyRound, ShieldCheck } from "lucide-react";

interface SetupStepProps {
  onNext: () => void;
  onError: (error: string) => void;
  email: string;
  session: string;
}

const PasswordStep = ({ onNext, onError, email, session }: SetupStepProps) => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      onError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: email,
          session,
          new_password: newPassword,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to change password");
      }

      onNext();
    } catch (error) {
      onError("Failed to change password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new-password">New Password</Label>
        <Input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Enter your new password"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm Password</Label>
        <Input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm your new password"
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Updating..." : "Update Password"}
      </Button>
    </form>
  );
};

const MFASetupStep = ({ onNext, onError, email, session }: SetupStepProps) => {
  const [qrCode, setQrCode] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMFADetails = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/mfa-setup-details`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ username: email, session }),
        });

        if (!response.ok) {
          throw new Error("Failed to fetch MFA setup details");
        }

        const data = await response.json();
        setQrCode(data.qr_code);
        setSecretKey(data.secret_key);
      } catch (error) {
        onError("Failed to fetch MFA setup details. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchMFADetails();
  }, [email, session, onError]);

  if (isLoading) {
    return <div>Loading MFA setup...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          {qrCode && (
            <img
              src={`data:image/png;base64,${qrCode}`}
              alt="QR Code for MFA setup"
              className="w-48 h-48 border-2 p-2 rounded-lg"
            />
          )}
        </div>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Scan this QR code with your authenticator app or manually enter the secret key:
          </p>
          <code className="block p-2 bg-muted rounded text-sm break-all">{secretKey}</code>
        </div>
      </div>
      <Button onClick={onNext} className="w-full">
        Continue
      </Button>
    </div>
  );
};

const MFAVerificationStep = ({ onNext, onError, email, session }: SetupStepProps) => {
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/verify-mfa`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: email, session, code }),
      });

      if (!response.ok) {
        throw new Error("Invalid verification code");
      }

      onNext();
    } catch (error) {
      onError("Failed to verify MFA code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="verification-code">Verification Code</Label>
        <Input
          id="verification-code"
          value={code}
          onChange={(e) => setCode(e.target.value.slice(0, 6))}
          maxLength={6}
          placeholder="000000"
          className="text-center text-2xl tracking-widest"
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Verifying..." : "Verify"}
      </Button>
    </form>
  );
};

export default function SetupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState("");

  const email = searchParams?.get("email") || "";
  const session = searchParams?.get("session") || "";

  useEffect(() => {
    if (!email || !session) {
      router.push("/login");
    }
  }, [email, session, router]);

  const steps = [
    { title: "Create Password", description: "Set up your new password", icon: KeyRound, component: PasswordStep },
    { title: "Set up MFA", description: "Configure your authenticator app", icon: QrCode, component: MFASetupStep },
    { title: "Verify MFA", description: "Verify your authenticator setup", icon: ShieldCheck, component: MFAVerificationStep },
  ];

  const handleNext = () => {
    if (currentStep === steps.length - 1) {
      router.push("/login");
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const CurrentStepComponent = steps[currentStep].component;

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
                  d="M16 7.6c-4.632 0-8.4 3.768-8.4 8.4s3.768 8.4 8.4 8.4 8.4-3.768 8.4-8.4-3.768-8.4-8.4-8.4zm0 14c-3.08 0-5.6-2.52-5.6-5.6s2.52-5.6 5.6-5.6 5.6 2.52 5.6 5.6-2.52 5.6-5.6-5.6z"
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
          <CardTitle className="text-2xl font-bold text-center">{steps[currentStep].title}</CardTitle>
          <CardDescription className="text-center">{steps[currentStep].description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <Progress value={(currentStep + 1) * (100 / steps.length)} className="h-2" />
            <div className="flex justify-between mt-2">
              {steps.map((step, index) => (
                <div
                  key={index}
                  className={`flex items-center ${index <= currentStep ? "text-primary" : "text-muted-foreground"}`}
                >
                  <step.icon className="w-4 h-4" />
                </div>
              ))}
            </div>
          </div>
          {error && <div className="mb-4 p-2 bg-destructive/10 text-destructive text-sm rounded">{error}</div>}
          <CurrentStepComponent onNext={handleNext} onError={setError} email={email} session={session} />
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground text-center w-full">
            Step {currentStep + 1} of {steps.length}
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
