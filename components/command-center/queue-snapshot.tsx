"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface Snapshot {
  detections: { total: number; new: number; inProgress: number; resolved: number }
  emails: { flagged: number; clean: number }
}

export function QueueSnapshot() {
  const [snap, setSnap] = useState<Snapshot | null>(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        // Minimal: try endpoints; if they fail, show a friendly baseline
        const [det] = await Promise.allSettled([
          fetch('/api/detections', { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject('fail')),
        ])
        const detections = (() => {
          if (det.status === 'fulfilled' && Array.isArray(det.value?.detections || det.value)) {
            const list = det.value.detections || det.value
            const total = list.length
            const newC = list.filter((d: any) => d.status === 'new').length
            const inP = list.filter((d: any) => d.status === 'in_progress').length
            const res = list.filter((d: any) => d.status === 'resolved').length
            return { total, new: newC, inProgress: inP, resolved: res }
          }
          return { total: 0, new: 0, inProgress: 0, resolved: 0 }
        })()
        if (mounted) setSnap({ detections, emails: { flagged: 0, clean: 0 } })
      } catch {
        if (mounted) setSnap({ detections: { total: 0, new: 0, inProgress: 0, resolved: 0 }, emails: { flagged: 0, clean: 0 } })
      }
    }
    load()
    const i = setInterval(load, 30000)
    return () => { mounted = false; clearInterval(i) }
  }, [])

  return (
    <Card className="bg-[#0f0f0f] border-[#1f1f1f]">
      <CardHeader>
        <CardTitle className="text-white text-sm">Queue Snapshot</CardTitle>
      </CardHeader>
      <CardContent className="p-3">`n        {!snap ? (
          <div className="text-xs text-gray-500">Loading�</div>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded bg-[#1a1a1a]">
              <div className="text-gray-400 text-xs">Detections</div>
              <div className="text-white font-medium">{snap.detections.total}</div>
              <div className="mt-1 flex gap-1 text-xs">
                <Badge variant="destructive" className="bg-red-600 px-1.5 py-0 text-[10px] leading-4 whitespace-nowrap">New {snap.detections.new}</Badge>
                <Badge variant="secondary" className="bg-yellow-600 px-1.5 py-0 text-[10px] leading-4 whitespace-nowrap">In Prog {snap.detections.inProgress}</Badge>
                <Badge variant="outline" className="border-green-500 text-green-500 px-1.5 py-0 text-[10px] leading-4 whitespace-nowrap">Res {snap.detections.resolved}</Badge>
              </div>
            </div>
            <div className="p-2 rounded bg-[#1a1a1a]">
              <div className="text-gray-400 text-xs">Emails</div>
              <div className="text-white font-medium">�</div>
              <div className="mt-1 flex gap-1 text-xs">
                <Badge variant="destructive" className="bg-purple-600 px-1.5 py-0 text-[10px] leading-4 whitespace-nowrap">Flg {snap.emails.flagged}</Badge>
                <Badge variant="outline" className="border-gray-500 text-gray-400 px-1.5 py-0 text-[10px] leading-4 whitespace-nowrap">Clean {snap.emails.clean}</Badge>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
