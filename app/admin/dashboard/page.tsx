"use client"

import { useState, useEffect } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { StatCard } from "@/components/dashboard/stat-card"
import { SeverityPieChart } from "@/components/dashboard/severity-pie-chart"
import { SeverityLineChart } from "@/components/dashboard/severity-line-chart"
import { CompletedDetections } from "@/components/dashboard/completed-detections"
import { AutoBlockedEmails } from "@/components/dashboard/auto-blocked-emails"
import {
  fetchDashboardStats,
  fetchDetectionTrends,
  fetchCompletedDetections,
  fetchAutoBlockedEmails,
} from "@/lib/dashboard-service"
import { FadeInSection } from "@/components/fade-in-section"
import { useRequireAuth } from "@/lib/auth"
import { logout } from "@/lib/auth"
import { useRouter } from "next/navigation"

export default function HomePage() {
  useRequireAuth()
  const router = useRouter()
  const [timeframe, setTimeframe] = useState("today")
  const [stats, setStats] = useState(() => fetchDashboardStats())
  const [trends, setTrends] = useState(() => fetchDetectionTrends("today"))
  const [completedDetections, setCompletedDetections] = useState(() => fetchCompletedDetections())
  const [autoBlockedEmails, setAutoBlockedEmails] = useState(() => fetchAutoBlockedEmails())

  const severityData = [
    { name: "Critical", value: stats.severityBreakdown.critical, color: "#ef4444" },
    { name: "High", value: stats.severityBreakdown.high, color: "#f97316" },
    { name: "Medium", value: stats.severityBreakdown.medium, color: "#eab308" },
    { name: "Low", value: stats.severityBreakdown.low, color: "#22c55e" },
  ]

  useEffect(() => {
    setTrends(fetchDetectionTrends(timeframe))
  }, [timeframe])

  const handleTimeframeChange = (newTimeframe: string) => {
    setTimeframe(newTimeframe)
  }

  const handleSignOut = async () => {
    logout()
    router.push("/login")
  }

  return (
    <div className="min-h-screen bg-background animated-background">
      <DashboardHeader
        username="John Doe"
        onSignOut={handleSignOut}
        notificationsCount={5} // This will be replaced with actual data in the future
      />
      <main className="p-5">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <FadeInSection>
            <StatCard
              title="Incoming Emails"
              value={stats.totalIncomingEmails}
              description="Total emails sent to employees"
            />
          </FadeInSection>
          <FadeInSection>
            <StatCard
              title="Outgoing Emails"
              value={stats.totalOutgoingEmails}
              description="Total emails sent by employees"
            />
          </FadeInSection>
          <FadeInSection>
            <StatCard title="Total Detections" value={stats.totalDetections} description="Suspicious emails detected" />
          </FadeInSection>

          <FadeInSection className="md:col-span-2">
            <SeverityLineChart data={trends} timeframe={timeframe} onTimeframeChange={handleTimeframeChange} />
          </FadeInSection>

          <FadeInSection>
            <SeverityPieChart data={severityData} />
          </FadeInSection>

          <FadeInSection>
            <StatCard
              title="Your Assigned Detections"
              value={stats.assignedDetections}
              description="Active cases requiring your attention"
            />
          </FadeInSection>

          <FadeInSection>
            <CompletedDetections detections={completedDetections} />
          </FadeInSection>

          <FadeInSection>
            <AutoBlockedEmails data={autoBlockedEmails.data} total={autoBlockedEmails.total} />
          </FadeInSection>
        </div>
      </main>
    </div>
  )
}

