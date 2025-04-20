import type React from "react"
import { cn } from "@/lib/utils"

interface LogoTextProps {
  children: React.ReactNode
  className?: string
}

export function LogoText({ children, className }: LogoTextProps) {
  return <span className={cn("text-xl font-bold tracking-tight", className)}>{children}</span>
}
