export interface DashboardStats {
  totalIncomingEmails: number
  totalOutgoingEmails: number
  totalDetections: number
  severityBreakdown: {
    critical: number
    high: number
    medium: number
    low: number
  }
  assignedDetections: number
}

export interface SeverityDataPoint {
  name: string
  value: number
  color: string
}

export interface DetectionTrend {
  date: string
  critical: number
  high: number
  medium: number
  low: number
}

export interface CompletedDetection {
  id: string
  name: string
  severity: "Critical" | "High" | "Medium" | "Low"
  completedAt: string
}

export interface AutoBlockedEmailData {
  category: string
  count: number
}

