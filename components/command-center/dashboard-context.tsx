"use client"

import { useState, useEffect } from "react"
import { BarChart3 } from "lucide-react"

interface DashboardStats {
  totalEmails: number
  totalDetections: number
  activeInvestigations: number
}

export function DashboardContext() {
  const [stats, setStats] = useState<DashboardStats>({
    totalEmails: 0,
    totalDetections: 0,
    activeInvestigations: 0,
  })

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [detectionsRes, emailsRes] = await Promise.all([fetch("/api/detections"), fetch("/api/email")])

        if (detectionsRes.ok && emailsRes.ok) {
          const detectionsData = await detectionsRes.json()
          const emailsData = await emailsRes.json()

          setStats({
            totalEmails: emailsData.total || 0,
            totalDetections: detectionsData.total || 0,
            activeInvestigations: detectionsData.inProgress || 0,
          })
        }
      } catch (error) {
        console.log("[v0] Failed to fetch dashboard stats:", error)
      }
    }

    fetchStats()
  }, [])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2">
        <BarChart3 className="w-4 h-4 text-blue-400" />
        <h3 className="text-white font-medium text-sm">Dashboard Snapshot</h3>
      </div>

      <div className="space-y-2">
        <div className="p-2 rounded-lg bg-[#1f1f1f]">
          <p className="text-gray-400 text-xs">Total Emails</p>
          <p className="text-white text-lg font-semibold">{stats.totalEmails}</p>
        </div>
        <div className="p-2 rounded-lg bg-[#1f1f1f]">
          <p className="text-gray-400 text-xs">Total Detections</p>
          <p className="text-white text-lg font-semibold">{stats.totalDetections}</p>
        </div>
        <div className="p-2 rounded-lg bg-[#1f1f1f]">
          <p className="text-gray-400 text-xs">Active Investigations</p>
          <p className="text-white text-lg font-semibold">{stats.activeInvestigations}</p>
        </div>
      </div>
    </div>
  )
}
