"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react"

interface PushedRequest {
  id: string
  originalInvestigationId: string
  emailSubject: string
  sender: string
  severity: "Critical" | "High" | "Medium" | "Low"
  pushedBy: string
  pushedAt: string
  reason: string
  status: "pending" | "in_review" | "completed" | "rejected"
}

export function ActionInbox() {
  const [queue, setQueue] = useState<PushedRequest[]>([])
  const seenIds = useRef<Set<string>>(new Set())

  const severityBadge = (sev: string) => {
    const base = "px-2 py-0.5 text-xs"
    switch (sev) {
      case "Critical": return <Badge variant="destructive" className="bg-red-600 text-white">Critical</Badge>
      case "High": return <Badge variant="destructive" className="bg-orange-600 text-white">High</Badge>
      case "Medium": return <Badge variant="outline" className="border-yellow-500 text-yellow-500">Medium</Badge>
      default: return <Badge variant="outline">Low</Badge>
    }
  }

  const fetchLatest = async () => {
    try {
      const res = await fetch("/api/admin/pushed-requests", { cache: "no-store" })
      if (!res.ok) return
      const data: PushedRequest[] = await res.json()
      const pending = data.filter(d => d.status === "pending")

      const fresh = pending.filter(p => !seenIds.current.has(p.id))
      if (fresh.length > 0) {
        fresh.forEach(f => seenIds.current.add(f.id))
        // only show one at a time to avoid overload
        setQueue(prev => [...prev, ...fresh])
      }
    } catch {}
  }

  useEffect(() => {
    fetchLatest()
    const i = setInterval(fetchLatest, 10000)
    return () => clearInterval(i)
  }, [])

  const handleAction = async (id: string, action: "accept" | "deny") => {
    try {
      await fetch("/api/admin/pushed-requests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action })
      })
    } catch {}
    setQueue(q => q.filter(x => x.id !== id))
  }

  // Auto-dismiss after 7 seconds
  useEffect(() => {
    if (queue.length === 0) return
    const timer = setTimeout(() => {
      setQueue(q => q.slice(1))
    }, 7000)
    return () => clearTimeout(timer)
  }, [queue])

  const current = useMemo(() => queue[0], [queue])

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35 }}
        >
          <Card className="bg-[#0f0f0f] border-[#1f1f1f]">
            <CardContent className="p-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white font-medium truncate">Escalation: {current.emailSubject}</p>
                    {severityBadge(current.severity)}
                  </div>
                  <p className="text-xs text-gray-400 truncate">From {current.sender} • Reason: {current.reason}</p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" className="h-7 bg-[#1f1f1f] border-[#2a2a2a] text-white hover:bg-[#2a2a2a]" onClick={() => handleAction(current.id, "accept")}>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Accept
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 bg-[#1a1a1a] border-[#2a2a2a] text-white hover:bg-[#2a2a2a]" onClick={() => handleAction(current.id, "deny")}>
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Deny
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
