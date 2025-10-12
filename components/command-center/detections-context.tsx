"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Clock } from "lucide-react"

interface Detection { id: string; status: string; severity: string; createdAt?: string }

export function DetectionsContext() {
  const [stats, setStats] = useState<{ newC:number; inP:number; res:number }>({ newC:0, inP:0, res:0 })

  useEffect(() => {
    let m = true
    const load = async () => {
      try {
        const r = await fetch('/api/detections', { cache: 'no-store' })
        if (!m) return
        if (r.ok) {
          const data = await r.json()
          const list: Detection[] = data.detections || data || []
          setStats({
            newC: list.filter(d=>d.status==='new').length,
            inP: list.filter(d=>d.status==='in_progress').length,
            res: list.filter(d=>d.status==='resolved').length,
          })
        }
      } catch {}
    }
    load()
    const i = setInterval(load, 30000)
    return ()=>{ m=false; clearInterval(i) }
  }, [])

  return (
    <Card className="bg-[#0f0f0f] border-[#1f1f1f]">
      <CardHeader>
        <CardTitle className="text-white text-sm">Detections Tools</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="flex gap-2">
          <Badge variant="destructive" className="bg-red-600">New {stats.newC}</Badge>
          <Badge variant="secondary" className="bg-yellow-600">In Progress {stats.inP}</Badge>
          <Badge variant="outline" className="border-green-500 text-green-500">Resolved {stats.res}</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="h-7 bg-[#1f1f1f] hover:bg-[#2a2a2a]">Critical</Button>
          <Button size="sm" className="h-7 bg-[#1f1f1f] hover:bg-[#2a2a2a]">High</Button>
          <Button size="sm" variant="outline" className="h-7 bg-[#1a1a1a] border-[#2a2a2a]">Reset</Button>
        </div>
        <div className="flex items-center gap-1 text-gray-500">
          <Clock className="w-3 h-3" />
          Auto-refreshes every 30s
        </div>
      </CardContent>
    </Card>
  )
}
