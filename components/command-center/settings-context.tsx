"use client"

import Link from "next/link"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"

export function SettingsContext() {
  const shortcuts = [
    { label: "Pushed Requests", href: "/pushed-requests" },
    { label: "Manage Roles", href: "/roles-permissions" },
  ]

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2">
        <Settings className="w-4 h-4 text-gray-400" />
        <h3 className="text-white font-medium text-sm">Admin Shortcuts</h3>
      </div>

      <div className="space-y-1">
        {shortcuts.map((shortcut, index) => (
          <Link key={index} href={shortcut.href}>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-full justify-start text-xs text-gray-300 hover:text-white hover:bg-[#1f1f1f]"
            >
              {shortcut.label}
            </Button>
          </Link>
        ))}
      </div>
    </div>
  )
}
