"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface Saved { name: string; query: string }

export function EmailsContext() {
  const [saved, setSaved] = useState<Saved[]>([])
  const [examples] = useState<Saved[]>([
    { name: 'Suspicious Domains', query: 'threat:high OR flaggedCategory:ai' },
    { name: 'From External', query: 'direction:inbound -domain:company.com' },
  ])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('saved_email_searches')
      if (raw) setSaved(JSON.parse(raw))
    } catch {}
  }, [])

  const use = (q: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('search', q)
    window.location.href = url.toString()
  }

  return (
    <Card className="bg-[#0f0f0f] border-[#1f1f1f]">
      <CardHeader>
        <CardTitle className="text-white text-sm">Email Shortcuts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {(saved.length === 0 ? examples : saved).map((s, i) => (
          <Button key={i} className="w-full justify-start bg-[#1f1f1f] hover:bg-[#2a2a2a]" onClick={() => use(s.query)}>
            {s.name}
          </Button>
        ))}
      </CardContent>
    </Card>
  )
}
