"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { StatCard } from "@/components/dashboard/stat-card"
import { SeverityPieChart } from "@/components/dashboard/severity-pie-chart"
import { CompletedDetections } from "@/components/dashboard/completed-detections"
import { AutoBlockedEmails } from "@/components/dashboard/auto-blocked-emails"
import { AssignmentsOverview } from "@/components/dashboard/assignments-overview"
import { useRouter } from "next/navigation"
import { AssignedDetections } from "@/components/dashboard/assigned-detections"
import type { CompletedDetection } from "@/components/dashboard/completed-detections" 
// test data
const mockDashboardStats = {
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
}

const mockCompletedDetections: CompletedDetection[] = [
  {
    id: "1",
    name: "Phishing Attempt",
    severity: "Critical",
    resolvedBy: "John Doe",
    completedAt: "2024-01-31T14:30:00Z"
  },
  {
    id: "2",
    name: "Suspicious Login",
    severity: "High",
    resolvedBy: "Jane Smith",
    completedAt: "2024-01-31T12:15:00Z"
  },
  {
    id: "3",
    name: "Malware Detection",
    severity: "Critical",
    resolvedBy: "John Doe",
    completedAt: "2024-01-31T10:45:00Z"
  }
]

const mockAutoBlockedEmails = {
  total: 24,
  data: [
    { sender: "malicious@phishing.com", reason: "Known phishing domain", timestamp: "2024-01-31T15:20:00Z" },
    { sender: "suspicious@unknown.net", reason: "Suspicious attachment", timestamp: "2024-01-31T14:10:00Z" },
    { sender: "spam@marketing.biz", reason: "Spam content detected", timestamp: "2024-01-31T12:30:00Z" },
  ],
}

export default function DashboardPage() {
  const router = useRouter()
  const [stats, setStats] = useState(mockDashboardStats)
  const [completedDetections, setCompletedDetections] = useState(mockCompletedDetections)
  const [autoBlockedEmails, setAutoBlockedEmails] = useState(mockAutoBlockedEmails)
  const [searchQuery, setSearchQuery] = useState("")

useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");

  const clientId = "u7p7ddajvruk8rccoajj8o5h0";
  const redirectUri = "https://console-encryptgate.net/admin/dashboard";
  const domain = "us-east-1kpxz426n8.auth.us-east-1.amazoncognito.com";

  // Case 1: We have a code, so let's exchange it for tokens
  if (code) {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code: code,
    });

    fetch(`https://${domain}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.id_token) {
          localStorage.setItem("idToken", data.id_token);
          localStorage.setItem("access_token", data.access_token);
          localStorage.setItem("refresh_token", data.refresh_token);

          // Remove the ?code=... from URL
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          console.error("Failed to get tokens", data);
          window.location.href = `https://${domain}/login?client_id=${clientId}&response_type=code&scope=email+openid+phone&redirect_uri=${redirectUri}`;
        }
      })
      .catch((err) => {
        console.error("Token exchange error", err);
        window.location.href = `https://${domain}/login?client_id=${clientId}&response_type=code&scope=email+openid+phone&redirect_uri=${redirectUri}`;
      });
  }

  // Case 2: No token and no code = redirect
  const idToken = localStorage.getItem("idToken");
  if (!idToken && !code) {
    window.location.href = `https://${domain}/login?client_id=${clientId}&response_type=code&scope=email+openid+phone&redirect_uri=${redirectUri}`;
  }
}, []);


  const severityData = [
    { name: "Critical", value: stats.severityBreakdown.critical, color: "#ef4444" },
    { name: "High", value: stats.severityBreakdown.high, color: "#f97316" },
    { name: "Medium", value: stats.severityBreakdown.medium, color: "#eab308" },
    { name: "Low", value: stats.severityBreakdown.low, color: "#22c55e" },
  ]

  return (
    <AppLayout username="John Doe" onSearch={setSearchQuery} notificationsCount={5}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
        <StatCard
          title="Incoming Emails"
          value={stats.totalIncomingEmails}
          description="Total emails sent to employees"
        />
        <StatCard
          title="Outgoing Emails"
          value={stats.totalOutgoingEmails}
          description="Total emails sent by employees"
        />
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
