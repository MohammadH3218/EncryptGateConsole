"use client"

import Link from "next/link"
import { Shield, Mail, AlertTriangle, UserCheck } from "lucide-react"
import { Button } from "@/components/ui/button"

export function QuickActions() {
  const actions = [
    { icon: AlertTriangle, label: "Detections", href: "/detections" },
    { icon: Mail, label: "Emails", href: "/emails" },
    { icon: Shield, label: "Pushed", href: "/pushed-requests" },
    { icon: UserCheck, label: "Assignments", href: "/assignments" },
  ]

  return (
    <div className="space-y-2">
      <div className="px-2">
        <h3 className="text-white font-medium text-sm">Quick Actions</h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {actions.map((action, index) => (
          <Link key={index} href={action.href}>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-full text-xs bg-[#1f1f1f] border-[#2a2a2a] hover:bg-[#2a2a2a] text-white"
            >
              <action.icon className="w-3 h-3 mr-1" />
              {action.label}
            </Button>
          </Link>
        ))}
      </div>
    </div>
  )
}
