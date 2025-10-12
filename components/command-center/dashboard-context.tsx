"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function DashboardContext() {
  const [meters, setMeters] = useState<{ detections:number; emails:number }>({ detections: 0, emails: 0 })

  useEffect(() => {
    let m = true
    const load = async () => {
      try {
        const [dR, eR] = await Promise.allSettled([
          fetch('/api/detections').then(r=>r.ok?r.json():[]),
          fetch('/api/email?limit=10').then(r=>r.ok?r.json():{ emails: [] }),
        ])
        if (!m) return
        const detections = dR.status==='fulfilled' ? (dR.value?.detections?.length ?? (Array.isArray(dR.value)? dR.value.length : 0)) : 0
        const emails = eR.status==='fulfilled' ? (eR.value?.emails?.length ?? 0) : 0
        setMeters({ detections, emails })
      } catch {}
    }
    load()
  }, [])

  return (
    <Card className="bg-[#0f0f0f] border-[#1f1f1f]">
      <CardHeader>
        <CardTitle className="text-white text-sm">Dashboard Helpers</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-gray-300">
        <div>Total detections loaded: <span className="text-white">{meters.detections}</span></div>
        <div>Recent emails fetched: <span className="text-white">{meters.emails}</span></div>
      </CardContent>
    </Card>
  )
}
