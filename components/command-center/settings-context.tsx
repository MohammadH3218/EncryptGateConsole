"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { usePathname, useRouter } from "next/navigation"

export function SettingsContext() {
  const router = useRouter()
  const pathname = usePathname()
  const org = pathname?.split('/')?.[2] || ''

  return (
    <Card className="bg-[#0f0f0f] border-[#1f1f1f]">
      <CardHeader>
        <CardTitle className="text-white text-sm">Admin Shortcuts</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2">
        <Button className="justify-start bg-[#1f1f1f] hover:bg-[#2a2a2a]" onClick={() => router.push(`/o/${org}/admin/pushed-requests`)}>
          Review Pushed Requests
        </Button>
        <Button className="justify-start bg-[#1f1f1f] hover:bg-[#2a2a2a]" onClick={() => router.push(`/o/${org}/admin/company-settings/roles`)}>
          Manage Roles
        </Button>
      </CardContent>
    </Card>
  )
}
