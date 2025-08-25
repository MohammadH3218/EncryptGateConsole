"use client"

import { useState, useEffect, useCallback } from "react"
import { AppLayout } from "@/components/app-layout"
import { StatCard } from "@/components/dashboard/stat-card"
import { InteractiveLineChart } from "@/components/dashboard/interactive-line-chart"
import { CompletedDetections } from "@/components/dashboard/completed-detections"
import { AutoBlockedEmails } from "@/components/dashboard/auto-blocked-emails"
import { AssignmentsOverview } from "@/components/dashboard/assignments-overview"
import { AssignedDetections } from "@/components/dashboard/assigned-detections"
import type { CompletedDetection } from "@/components/dashboard/completed-detections"
import { Mail, Send, Shield, RefreshCw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface Email {
  id: string
  direction: "inbound" | "outbound"
  timestamp: string
  status: string
  threatLevel: string
  flaggedCategory: string
  sender: string
  recipients: string[]
}

interface Detection {
  id: string
  name: string
  severity: string
  status: string
  assignedTo: string[]
  sentBy: string
  timestamp: string
  createdAt: string
}

export default function DashboardPage() {
  // ——— Real data state ———
  const [emails, setEmails] = useState<Email[]>([])
  const [detections, setDetections] = useState<Detection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // ——— Computed stats from real data ———
  const stats = {
    totalIncomingEmails: emails.filter(e => e.direction === "inbound").length,
    totalOutgoingEmails: emails.filter(e => e.direction === "outbound").length,
    totalDetections: detections.length,
    assignedDetections: detections.filter(d => d.assignedTo.length > 0).length,
    // Note: Previous week comparison not available without historical data
    previousWeek: {
      totalIncomingEmails: 0,
      totalOutgoingEmails: 0,
      totalDetections: 0,
    },
    severityBreakdown: {
      critical: detections.filter(d => d.severity.toLowerCase() === 'critical').length,
      high: detections.filter(d => d.severity.toLowerCase() === 'high').length,
      medium: detections.filter(d => d.severity.toLowerCase() === 'medium').length,
      low: detections.filter(d => d.severity.toLowerCase() === 'low').length,
    },
  }

  // ——— Detection trend data (last 7 days) ———
  const getDetectionTrendData = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const today = new Date()
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(today)
      date.setDate(today.getDate() - (6 - i))
      return date
    })

    return last7Days.map(date => {
      const dayDetections = detections.filter(d => {
        const detectionDate = new Date(d.createdAt || d.timestamp)
        return detectionDate.toDateString() === date.toDateString()
      })
      return {
        day: days[date.getDay()],
        value: dayDetections.length
      }
    })
  }

  // ——— Completed detections (resolved status) ———
  const completedDetections: CompletedDetection[] = detections
    .filter(d => d.status === 'resolved')
    .slice(0, 10)
    .map(d => ({
      id: d.id,
      name: d.name,
      severity: d.severity,
      resolvedBy: d.assignedTo[0] || 'Security Team',
      completedAt: d.timestamp || d.createdAt
    }))

  // ——— Auto-blocked emails (blocked status) ———
  const autoBlockedEmails = {
    total: emails.filter(e => e.status === 'blocked' || e.status === 'quarantined').length,
    data: emails
      .filter(e => e.status === 'blocked' || e.status === 'quarantined')
      .slice(0, 5)
      .map(e => ({
        sender: e.sender,
        reason: e.status === 'blocked' ? 'Automatically blocked' : 'Quarantined for review',
        timestamp: e.timestamp
      }))
  }

  // ——— Data fetching functions ———
  const loadEmails = useCallback(async () => {
    try {
      console.log('📧 Dashboard: Loading emails...')
      const response = await fetch('/api/email?limit=1000')
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      setEmails(data.emails || [])
      console.log(`✅ Dashboard: Loaded ${data.emails?.length || 0} emails`)
    } catch (err: any) {
      console.error('❌ Dashboard: Failed to load emails:', err)
      setError(`Failed to load emails: ${err.message}`)
    }
  }, [])

  const loadDetections = useCallback(async () => {
    try {
      console.log('🚨 Dashboard: Loading detections...')
      const response = await fetch('/api/detections?limit=1000')
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      setDetections(Array.isArray(data) ? data : [])
      console.log(`✅ Dashboard: Loaded ${Array.isArray(data) ? data.length : 0} detections`)
    } catch (err: any) {
      console.error('❌ Dashboard: Failed to load detections:', err)
      setError(`Failed to load detections: ${err.message}`)
    }
  }, [])

  const loadAllData = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      console.log('🔄 Dashboard: Loading all data...')
      await Promise.all([loadEmails(), loadDetections()])
      console.log('✅ Dashboard: All data loaded successfully')
    } catch (err: any) {
      console.error('❌ Dashboard: Error loading data:', err)
      setError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [loadEmails, loadDetections])

  // ——— Effects ———
  useEffect(() => {
    console.log('🚀 Dashboard: Component mounted, loading data...')
    loadAllData()
  }, [loadAllData])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('🔄 Dashboard: Auto-refreshing data...')
      loadAllData()
    }, 60000) // 60 seconds

    return () => clearInterval(interval)
  }, [loadAllData])

  // Show loading state
  if (loading) {
    return (
      <AppLayout username="John Doe" notificationsCount={5}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="animate-spin mx-auto h-8 w-8 mb-4 text-white" />
            <p className="text-white">Loading dashboard data...</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout username="John Doe" notificationsCount={5}>
      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="mb-6 bg-red-900/20 border-red-500/20">
          <Shield className="h-4 w-4" />
          <AlertTitle>Dashboard Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          title="Incoming Emails"
          value={stats.totalIncomingEmails}
          description="Total emails received by employees"
          previousValue={stats.previousWeek.totalIncomingEmails || undefined}
          icon={<Mail className="w-6 h-6" />}
        />
        <StatCard
          title="Outgoing Emails"
          value={stats.totalOutgoingEmails}
          description="Total emails sent by employees"
          previousValue={stats.previousWeek.totalOutgoingEmails || undefined}
          icon={<Send className="w-6 h-6" />}
        />
        <StatCard
          title="Total Detections"
          value={stats.totalDetections}
          description="Suspicious emails detected"
          previousValue={stats.previousWeek.totalDetections || undefined}
          icon={<Shield className="w-6 h-6" />}
        />
      </div>

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Assignments Overview - Takes 2 columns */}
        <div className="lg:col-span-2">
          <AssignmentsOverview username="John Doe" />
        </div>

        {/* Detection Trends Chart */}
        <div>
          <InteractiveLineChart 
            title="Detection Trends (7 days)" 
            data={getDetectionTrendData()} 
            color="#3b82f6" 
          />
        </div>

        {/* Assigned Detections */}
        <div>
          <AssignedDetections count={stats.assignedDetections} />
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

      {/* Data Summary Footer */}
      <div className="mt-6 text-center text-sm text-gray-400">
        Showing data for {emails.length} emails and {detections.length} detections • Auto-refresh every 60s
      </div>
    </AppLayout>
  )
}
