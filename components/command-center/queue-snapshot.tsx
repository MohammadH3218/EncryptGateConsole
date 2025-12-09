"use client"

import { useState, useEffect } from "react"
import { Activity } from "lucide-react"

interface QueueStats {
  total: number
  new: number
  inProgress: number
  resolved: number
}

export function QueueSnapshot() {
  const [stats, setStats] = useState<QueueStats>({ total: 0, new: 0, inProgress: 0, resolved: 0 })

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/stats/queue")
        if (response.ok) {
          const data = await response.json()
          setStats({
            total: data.total || 0,
            new: data.new || 0,
            inProgress: data.inProgress || 0,
            resolved: data.resolved || 0,
          })
        }
      } catch (error) {
        console.log("[QueueSnapshot] Failed to fetch queue stats:", error)
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, 30000) // Poll every 30 seconds
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2">
        <Activity className="w-4 h-4 text-blue-400" />
        <h3 className="text-white font-medium text-sm">Queue</h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 rounded-lg bg-[#1f1f1f]">
          <p className="text-gray-400 text-xs">Total</p>
          <p className="text-white text-lg font-semibold">{stats.total}</p>
        </div>
        <div className="p-2 rounded-lg bg-[#1f1f1f]">
          <p className="text-gray-400 text-xs">New</p>
          <p className="text-red-400 text-lg font-semibold">{stats.new}</p>
        </div>
        <div className="p-2 rounded-lg bg-[#1f1f1f]">
          <p className="text-gray-400 text-xs">In Progress</p>
          <p className="text-yellow-400 text-lg font-semibold">{stats.inProgress}</p>
        </div>
        <div className="p-2 rounded-lg bg-[#1f1f1f]">
          <p className="text-gray-400 text-xs">Resolved</p>
          <p className="text-green-400 text-lg font-semibold">{stats.resolved}</p>
        </div>
      </div>
    </div>
  )
}
