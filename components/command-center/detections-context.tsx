"use client"

import { useState, useEffect } from "react"
import { Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface DetectionStats {
  critical: number
  high: number
  medium: number
  low: number
}

export function DetectionsContext() {
  const [stats, setStats] = useState<DetectionStats>({ critical: 0, high: 0, medium: 0, low: 0 })

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/stats/detections-summary?days=30")
        if (response.ok) {
          const data = await response.json()
          setStats({
            critical: data.severityBreakdown?.critical || 0,
            high: data.severityBreakdown?.high || 0,
            medium: data.severityBreakdown?.medium || 0,
            low: data.severityBreakdown?.low || 0,
          })
        }
      } catch (error) {
        console.log("[DetectionsContext] Failed to fetch detection stats:", error)
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2">
        <Filter className="w-4 h-4 text-orange-400" />
        <h3 className="text-white font-medium text-sm">Detection Tools</h3>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Badge variant="destructive" className="justify-center text-xs h-6">
            Critical: {stats.critical}
          </Badge>
          <Badge variant="destructive" className="justify-center text-xs h-6 bg-orange-600">
            High: {stats.high}
          </Badge>
          <Badge variant="secondary" className="justify-center text-xs h-6 bg-yellow-600">
            Medium: {stats.medium}
          </Badge>
          <Badge variant="secondary" className="justify-center text-xs h-6 bg-blue-600">
            Low: {stats.low}
          </Badge>
        </div>

        <div className="space-y-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-full justify-start text-xs text-gray-300 hover:text-white hover:bg-[#1f1f1f]"
          >
            Show Critical Only
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-full justify-start text-xs text-gray-300 hover:text-white hover:bg-[#1f1f1f]"
          >
            Show Unassigned
          </Button>
        </div>
      </div>
    </div>
  )
}
