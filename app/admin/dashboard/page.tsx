"use client"

import { useState } from "react"
import { AppLayout } from "@/components/app-layout"
import { StatCard } from "@/components/dashboard/stat-card"
import { InteractiveLineChart } from "@/components/dashboard/interactive-line-chart"
import { CompletedDetections } from "@/components/dashboard/completed-detections"
import { AutoBlockedEmails } from "@/components/dashboard/auto-blocked-emails"
import { AssignmentsOverview } from "@/components/dashboard/assignments-overview"
import { AssignedDetections } from "@/components/dashboard/assigned-detections"
import type { CompletedDetection } from "@/components/dashboard/completed-detections"
import { Mail, Send, Shield } from "lucide-react"

export default function DashboardPage() {
  // ——— Stats state ———
  const [stats] = useState({
    totalIncomingEmails: 1245,
    totalOutgoingEmails: 876,
    totalDetections: 32,
    assignedDetections: 8,
    previousWeek: {
      totalIncomingEmails: 1003,
      totalOutgoingEmails: 992,
      totalDetections: 28,
    },
    severityBreakdown: {
      critical: 5,
      high: 12,
      medium: 10,
      low: 5,
    },
  })

  // ——— Weekly detection trend data for line chart ———
  const [detectionTrendData] = useState([
    { day: "Mon", value: 8 },
    { day: "Tue", value: 12 },
    { day: "Wed", value: 15 },
    { day: "Thu", value: 9 },
    { day: "Fri", value: 18 },
    { day: "Sat", value: 6 },
    { day: "Sun", value: 4 },
  ])

  // ——— Completed detections table ———
  const [completedDetections] = useState<CompletedDetection[]>([
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

  // ——— Auto-blocked emails list ———
  const [autoBlockedEmails] = useState({
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

  return (
    <AppLayout username="John Doe" notificationsCount={5}>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          title="Incoming Emails"
          value={stats.totalIncomingEmails}
          description="Total emails sent to employees"
          previousValue={stats.previousWeek.totalIncomingEmails}
          icon={<Mail className="w-6 h-6" />}
        />
        <StatCard
          title="Outgoing Emails"
          value={stats.totalOutgoingEmails}
          description="Total emails sent by employees"
          previousValue={stats.previousWeek.totalOutgoingEmails}
          icon={<Send className="w-6 h-6" />}
        />
        <StatCard
          title="Total Detections"
          value={stats.totalDetections}
          description="Suspicious emails detected"
          previousValue={stats.previousWeek.totalDetections}
          icon={<Shield className="w-6 h-6" />}
        />
      </div>

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Assignments Overview - Takes 2 columns */}
        <div className="lg:col-span-2">
          <AssignmentsOverview username="John Doe" />
        </div>

        {/* Severity Chart */}
        <div>
          <InteractiveLineChart title="Detection Trends" data={detectionTrendData} color="#3b82f6" />
        </div>

        {/* Assigned Detections */}
        <div>
          <AssignedDetections count={15} />
        </div>

        {/* Completed Detections */}
        <div>
          <CompletedDetections detections={completedDetections} />
        </div>

        {/* Auto-blocked Emails */}
        <div>
          <AutoBlockedEmails data={autoBlockedEmails.data} total={autoBlockedEmails.total} />
        </div>
      </div>
    </AppLayout>
  )
}
