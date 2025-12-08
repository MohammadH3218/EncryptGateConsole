import "@/app/globals.css"
import "@copilotkit/react-ui/styles.css"
import { Inter } from "next/font/google"
import type React from "react"
import { Providers } from "./providers"
import { Toaster } from "@/components/toaster"

const inter = Inter({ subsets: ["latin"] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  )
}

export const metadata = {
  title: 'EncryptGate Dashboard',
  description: 'Security email monitoring dashboard',
  generator: 'v0.dev'
}
