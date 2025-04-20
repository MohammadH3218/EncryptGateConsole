import type { DashboardStats, DetectionTrend, CompletedDetection, AutoBlockedEmailData } from "@/types/dashboard"

export function fetchDashboardStats(): DashboardStats {
  return {
    totalIncomingEmails: 1247,
    totalOutgoingEmails: 892,
    totalDetections: 156,
    severityBreakdown: {
      critical: 12,
      high: 28,
      medium: 64,
      low: 52,
    },
    assignedDetections: 15,
  }
}

export function fetchDetectionTrends(timeframe: string): DetectionTrend[] {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()

  switch (timeframe) {
    case "today": {
      return Array.from({ length: 24 }, (_, i) => {
        const date = new Date(currentYear, currentMonth, now.getDate(), i)
        return {
          date: date.toISOString(),
          critical: Math.floor(Math.random() * 10),
          high: Math.floor(Math.random() * 15),
          medium: Math.floor(Math.random() * 20),
          low: Math.floor(Math.random() * 25),
        }
      })
    }

    case "week": {
      return Array.from({ length: 7 }, (_, i) => {
        const date = new Date(now)
        date.setDate(date.getDate() - (6 - i))
        return {
          date: date.toISOString(),
          critical: Math.floor(Math.random() * 15),
          high: Math.floor(Math.random() * 20),
          medium: Math.floor(Math.random() * 30),
          low: Math.floor(Math.random() * 35),
        }
      })
    }

    case "month": {
      return Array.from({ length: 30 }, (_, i) => {
        const date = new Date(now)
        date.setDate(date.getDate() - (29 - i))
        return {
          date: date.toISOString(),
          critical: Math.floor(Math.random() * 20),
          high: Math.floor(Math.random() * 25),
          medium: Math.floor(Math.random() * 35),
          low: Math.floor(Math.random() * 40),
        }
      })
    }

    case "year-to-date": {
      const months = currentMonth + 1
      return Array.from({ length: months }, (_, i) => {
        const monthProgress = i / months
        const multiplier = 1 + Math.sin(monthProgress * Math.PI) * 0.5

        return {
          date: new Date(currentYear, i, 1).toISOString(),
          critical: Math.floor(10 * multiplier + Math.random() * 5),
          high: Math.floor(15 * multiplier + Math.random() * 8),
          medium: Math.floor(25 * multiplier + Math.random() * 10),
          low: Math.floor(30 * multiplier + Math.random() * 12),
        }
      })
    }

    case "all-time": {
      // Reduce the number of data points and make them more spread out
      const years = 5
      const pointsPerYear = 4 // One point per quarter
      const totalPoints = years * pointsPerYear

      return Array.from({ length: totalPoints }, (_, i) => {
        const yearOffset = Math.floor(i / pointsPerYear)
        const quarterOffset = i % pointsPerYear
        const date = new Date(currentYear - years + yearOffset, quarterOffset * 3, 1)

        // Create more distinct patterns for each severity level
        const timeProgress = i / totalPoints
        const baseValue = Math.sin(timeProgress * Math.PI * 2) * 10 + 20

        return {
          date: date.toISOString(),
          critical: Math.max(5, Math.floor(baseValue * 0.7 + Math.sin(timeProgress * Math.PI * 4) * 5)),
          high: Math.max(8, Math.floor(baseValue * 0.9 + Math.sin(timeProgress * Math.PI * 3) * 8)),
          medium: Math.max(12, Math.floor(baseValue * 1.1 + Math.sin(timeProgress * Math.PI * 2) * 10)),
          low: Math.max(15, Math.floor(baseValue * 1.3 + Math.sin(timeProgress * Math.PI) * 12)),
        }
      })
    }

    default:
      return []
  }
}

export function fetchCompletedDetections(): CompletedDetection[] {
  return [
    { id: "1", name: "Suspicious Login Attempt", severity: "High", completedAt: "2:30 PM" },
    { id: "2", name: "Potential Data Leak", severity: "Critical", completedAt: "11:45 AM" },
    { id: "3", name: "Unusual File Access", severity: "Medium", completedAt: "9:15 AM" },
    { id: "4", name: "Failed Password Reset", severity: "Low", completedAt: "3:20 PM" },
  ]
}

export function fetchAutoBlockedEmails(): { data: AutoBlockedEmailData[]; total: number } {
  const data = [
    { category: "Spam", count: 152 },
    { category: "Phishing", count: 89 },
    { category: "Malware", count: 37 },
    { category: "Content Policy", count: 23 },
  ]
  const total = data.reduce((sum, item) => sum + item.count, 0)
  return { data, total }
}
