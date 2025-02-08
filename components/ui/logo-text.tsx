import type React from "react"

export function LogoText({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xl tracking-tight font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-300">
      {children}
    </span>
  )
}

