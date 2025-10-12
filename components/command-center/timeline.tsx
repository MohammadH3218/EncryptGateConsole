"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface EventItem { label: string; at: string }

export function CaseTimeline() {
  const pathname = usePathname()
  const [events, setEvents] = useState<EventItem[]>([])

  const invId = useMemo(() => (pathname || '').split('/').pop() || '', [pathname])

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const id = decodeURIComponent(invId)
        const res = await fetch(`/api/investigations/${encodeURIComponent(id)}`, { cache: 'no-store' })
        if (!active) return
        if (res.ok) {
          const data = await res.json()
          const base: EventItem[] = []
          if (data?.startedAt) base.push({ label: 'Created', at: data.startedAt })
          if (data?.lastUpdated) base.push({ label: 'Last Updated', at: data.lastUpdated })
          if (data?.escalatedToAdmin) base.push({ label: 'Escalated to Admin', at: data?.lastUpdated || new Date().toISOString() })
          setEvents(base.length ? base : [{ label: 'Opened', at: new Date().toISOString() }])
        } else {
          setEvents([{ label: 'Opened', at: new Date().toISOString() }])
        }
      } catch {
        setEvents([{ label: 'Opened', at: new Date().toISOString() }])
      }
    }
    if (invId) load()
    return () => { active = false }
  }, [invId])

  if (!invId) return null

  return (
    <Card className="bg-[#0f0f0f] border-[#1f1f1f]">
      <CardHeader>
        <CardTitle className="text-white text-sm">Case Timeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-gray-300">
        {events.map((e, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-white/70" />
            <div className="flex-1">
              <div className="text-white/90">{e.label}</div>
              <div className="text-gray-500">{new Date(e.at).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
