"use client"

import { useState } from "react"
import { AppLayout } from "@/components/app-layout"
import { StatCard } from "@/components/dashboard/stat-card"
import { SeverityPieChart } from "@/components/dashboard/severity-pie-chart"
import { CompletedDetections } from "@/components/dashboard/completed-detections"
import { AutoBlockedEmails } from "@/components/dashboard/auto-blocked-emails"
import { AssignmentsOverview } from "@/components/dashboard/assignments-overview"
import { AssignedDetections } from "@/components/dashboard/assigned-detections"
import type { CompletedDetection } from "@/components/dashboard/completed-detections"
import { useAuthSession } from "@/hooks/use-auth-session" // ✅ add this line

// ✅ run auth session logic
export default function DashboardPage() {
  useAuthSession()

  const [stats, setStats] = useState({
    totalIncomingEmails: 1245,
    totalOutgoingEmails: 876,
    totalDetections: 32,
    assignedDetections: 8,
    severityBreakdown: {
      critical: 5,
      high: 12,
      medium: 10,
      low: 5,
    },
  })

  const [completedDetections, setCompletedDetections] = useState<CompletedDetection[]>([
    {
      id: "1",
      name: "Phishing Attempt",
      severity: "Critical",
      resolvedBy: "John Doe",
      completedAt: "2024-01-31T14:30:00Z",
    },
    {
      id: "2",
      name: "Suspicious Login",
      severity: "High",
      resolvedBy: "Jane Smith",
      completedAt: "2024-01-31T12:15:00Z",
    },
    {
      id: "3",
      name: "Malware Detection",
      severity: "Critical",
      resolvedBy: "John Doe",
      completedAt: "2024-01-31T10:45:00Z",
    },
  ])

  const [autoBlockedEmails, setAutoBlockedEmails] = useState({
    total: 24,
    data: [
      {
        sender: "malicious@phishing.com",
        reason: "Known phishing domain",
        timestamp: "2024-01-31T15:20:00Z",
      },
      {
        sender: "suspicious@unknown.net",
        reason: "Suspicious attachment",
        timestamp: "2024-01-31T14:10:00Z",
      },
      {
        sender: "spam@marketing.biz",
        reason: "Spam content detected",
        timestamp: "2024-01-31T12:30:00Z",
      },
    ],
  })

  const [searchQuery, setSearchQuery] = useState("")

  const severityData = [
    { name: "Critical", value: stats.severityBreakdown.critical, color: "#ef4444" },
    { name: "High", value: stats.severityBreakdown.high, color: "#f97316" },
    { name: "Medium", value: stats.severityBreakdown.medium, color: "#eab308" },
    { name: "Low", value: stats.severityBreakdown.low, color: "#22c55e" },
  ]

  return (
    <AppLayout username="John Doe" onSearch={setSearchQuery} notificationsCount={5}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
        <StatCard title="Incoming Emails" value={stats.totalIncomingEmails} description="Total emails sent to employees" />
        <StatCard title="Outgoing Emails" value={stats.totalOutgoingEmails} description="Total emails sent by employees" />
        <StatCard title="Total Detections" value={stats.totalDetections} description="Suspicious emails detected" />

        <div className="md:col-span-2">
          <AssignmentsOverview username="John Doe" />
        </div>

        <div>
          <SeverityPieChart data={severityData} />
        </div>

        <div>
          <AssignedDetections count={15} />
        </div>

        <div>
          <CompletedDetections detections={completedDetections} />
        </div>

        <div>
          <AutoBlockedEmails data={autoBlockedEmails.data} total={autoBlockedEmails.total} />
        </div>
      </div>
    </AppLayout>
  )
}
