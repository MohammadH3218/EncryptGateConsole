import "@/styles/globals.css";
import { Inter } from "next/font/google";
import type React from "react";
import { Suspense } from "react";
import { Providers } from "./providers";
import { Toaster } from "@/components/toaster";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <Providers>
          <Suspense fallback={<div>Loading page...</div>}>
            {children}
          </Suspense>
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}