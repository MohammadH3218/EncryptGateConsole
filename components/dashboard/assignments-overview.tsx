"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Clock, RefreshCw, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

interface AssignmentsOverviewProps {}

interface Investigation {
  investigationId: string
  emailMessageId: string
  emailSubject?: string
  sender?: string
  severity?: string
  priority?: string
  status: string
  updatedAt?: string
  createdAt?: string
  lastUpdated?: string
  findings?: string
}

interface Detection {
  id: string
  detectionId: string
  name: string
  severity: string
  status: string
  emailMessageId?: string
  sentBy?: string
  createdAt?: string
  timestamp?: string
  assignedTo?: string[]
}

interface AssignmentItem {
  type: 'investigation' | 'detection'
  id: string
  emailId: string
  title: string
  severity: string
  from: string
  lastUpdated: string
  status: 'continue' | 'new'
}

export function AssignmentsOverview({}: AssignmentsOverviewProps) {
  const [assignments, setAssignments] = useState<AssignmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch investigations and detections
  const loadData = useCallback(async () => {
    try {
      setError(null)
      
      // Fetch active investigations
      const invResponse = await fetch('/api/investigations?status=active&limit=10')
      let investigationsData: Investigation[] = []
      if (invResponse.ok) {
        investigationsData = await invResponse.json()
      }

      // Fetch detections assigned to current user
      const detResponse = await fetch('/api/detections?limit=100')
      let detectionsData: Detection[] = []
      if (detResponse.ok) {
        const detData = await detResponse.json()
        detectionsData = Array.isArray(detData) ? detData : []
      }

      // Get current user email from token (simplified - you may want to get from session)
      const token = localStorage.getItem("access_token")
      let currentUserEmail = ""
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]))
          currentUserEmail = payload.email || ""
        } catch {
          // If can't parse token, show all detections
        }
      }

      // Filter detections assigned to current user or all if no user email
      const assignedDetections = detectionsData.filter((d: Detection) => {
        if (!currentUserEmail) return true // Show all if no user email
        const assigned = Array.isArray(d.assignedTo) ? d.assignedTo : []
        return assigned.length === 0 || assigned.some((a: string) => 
          typeof a === 'string' && a.toLowerCase().includes(currentUserEmail.toLowerCase())
        )
      })

      // Combine and sort by most recent
      const combined: AssignmentItem[] = [
        ...investigationsData.map((inv: Investigation) => ({
          type: 'investigation' as const,
          id: inv.investigationId || inv.emailMessageId,
          emailId: inv.emailMessageId,
          title: inv.emailSubject || inv.findings || 'Investigation',
          severity: inv.priority === 'critical' ? 'Critical' : 
                   inv.priority === 'high' ? 'High' : 
                   inv.priority === 'medium' ? 'Medium' : 'Low',
          from: inv.sender || 'Unknown',
          lastUpdated: inv.updatedAt || inv.createdAt || inv.lastUpdated || new Date().toISOString(),
          status: inv.status === 'active' ? 'continue' : 'new',
        })),
        ...assignedDetections.slice(0, 5).map((det: Detection) => ({
          type: 'detection' as const,
          id: det.detectionId || det.id,
          emailId: det.emailMessageId || '',
          title: det.name || 'Detection',
          severity: det.severity || 'Medium',
          from: det.sentBy || 'Unknown',
          lastUpdated: det.createdAt || det.timestamp || new Date().toISOString(),
          status: det.status === 'in_progress' ? 'continue' : 'new',
        })),
      ].sort((a, b) => {
        const dateA = new Date(a.lastUpdated).getTime()
        const dateB = new Date(b.lastUpdated).getTime()
        return dateB - dateA // Most recent first
      })

      setAssignments(combined.slice(0, 10)) // Show top 10 most recent
      setLoading(false)
    } catch (err: any) {
      console.error('Failed to load assignments:', err)
      setError(err.message)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [loadData])

  const handleContinue = (item: AssignmentItem) => {
    const emailId = item.emailId || item.id
    if (emailId) {
      const encodedId = encodeURIComponent(emailId)
      window.open(`/investigate/${encodedId}`, "_blank", "noopener,noreferrer")
    }
  }

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case "critical":
        return "bg-red-600 text-white"
      case "high":
        return "bg-orange-500 text-white"
      case "medium":
        return "bg-yellow-500 text-white"
      case "low":
        return "bg-green-500 text-white"
      default:
        return "bg-gray-500 text-white"
    }
  }

  const continueItems = assignments.filter(item => item.status === 'continue')
  const newItems = assignments.filter(item => item.status === 'new')

  return (
    <Card className="transition duration-200 hover:border-app-border hover:shadow-[var(--shadow-md)]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-app-textPrimary">Your Assignments</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 text-sm text-red-400">
            Error loading assignments: {error}
          </div>
        )}
        
        <div className="mb-4 flex gap-4 text-app-textSecondary">
          <div className="flex-1">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm">Continue</span>
              <Badge variant="secondary" className="bg-white/10 text-white">
                {continueItems.length}
              </Badge>
            </div>
          </div>
          <div className="flex-1">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm">New Assignments</span>
              <Badge variant="secondary" className="bg-white/10 text-white">
                {newItems.length}
              </Badge>
            </div>
          </div>
        </div>

        {loading && assignments.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-app-textSecondary" />
          </div>
        ) : assignments.length === 0 ? (
          <div className="text-center py-8 text-app-textSecondary">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No assignments found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-white/5 bg-white/[0.04] px-4 py-3 transition duration-200 hover:border-app-ring/60 cursor-pointer group"
                onClick={() => handleContinue(item)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-app-textMuted shrink-0" />
                      <span className="text-sm font-medium text-app-textPrimary truncate">{item.title}</span>
                      <Badge 
                        className={cn(
                          "text-xs shrink-0",
                          getSeverityBadgeClass(item.severity)
                        )}
                      >
                        {item.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-app-textSecondary truncate">From: {item.from}</p>
                    <p className="text-xs text-app-textSecondary mt-1">
                      Last updated: {new Date(item.lastUpdated).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleContinue(item)
                    }}
                    size="sm"
                    variant="outline"
                    className="border-app-border/50 bg-transparent text-app-textPrimary hover:border-app-ring hover:bg-app-ring/10 shrink-0"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Continue
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
