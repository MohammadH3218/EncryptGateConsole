"use client"

import { usePathname, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Shield, Mail, AlertTriangle, ArrowUpRight } from "lucide-react"

export function QuickActions() {
  const router = useRouter()
  const pathname = usePathname()

  const getOrg = () => {
    const parts = pathname?.split("/") || []
    return parts[1] === "o" ? parts[2] : ""
  }

  const go = (path: string) => router.push(`/o/${getOrg()}${path}`)

  return (
    <Card className="bg-[#0f0f0f] border-[#1f1f1f]">
      <CardHeader>
        <CardTitle className="text-white text-sm">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-1.5">
        <Button className="justify-start bg-[#1f1f1f] hover:bg-[#2a2a2a]" onClick={() => go('/admin/detections')}>
          <AlertTriangle className="w-4 h-4 mr-2" /> Detections
        </Button>
        <Button className="justify-start bg-[#1f1f1f] hover:bg-[#2a2a2a]" onClick={() => go('/admin/all-emails')}>
          <Mail className="w-4 h-4 mr-2" /> Emails
        </Button>
        <Button className="justify-start bg-[#1f1f1f] hover:bg-[#2a2a2a]" onClick={() => go('/admin/pushed-requests')}>
          <ArrowUpRight className="w-4 h-4 mr-2" /> Pushed
        </Button>
        <Button className="justify-start bg-[#1f1f1f] hover:bg-[#2a2a2a]" onClick={() => go('/admin/assignments')}>
          <Shield className="w-4 h-4 mr-2" /> Assignments
        </Button>
      </CardContent>
    </Card>
  )
}
