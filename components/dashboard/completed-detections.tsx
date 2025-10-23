import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export interface CompletedDetection {
  id: string
  name: string
  severity: string
  resolvedBy: string
  completedAt: string
}

interface CompletedDetectionsProps {
  detections: CompletedDetection[]
}

export function CompletedDetections({ detections }: CompletedDetectionsProps) {
  const getSeverityClasses = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "critical":
        return "bg-app-danger/15 text-app-danger"
      case "high":
        return "bg-orange-500/15 text-orange-400"
      case "medium":
        return "bg-yellow-500/15 text-yellow-400"
      case "low":
        return "bg-app-success/15 text-app-success"
      default:
        return "bg-white/5 text-app-textSecondary"
    }
  }

  return (
    <Card className="transition duration-200 hover:border-app-border hover:shadow-[var(--shadow-md)]">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-app-textPrimary">Completed Detections</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-2 text-2xl font-bold text-app-textPrimary">{detections.length}</div>
        <p className="mb-4 text-sm text-app-textSecondary">Completed today</p>

        <div className="space-y-2">
          {detections.slice(0, 3).map((detection) => (
            <div
              key={detection.id}
              className="rounded-2xl border border-white/5 bg-white/[0.04] px-3 py-2 transition duration-200 hover:border-app-ring/60"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-app-textPrimary">{detection.name}</p>
                  <p className="text-xs text-app-textSecondary">Resolved by {detection.resolvedBy}</p>
                </div>
                <Badge className={`${getSeverityClasses(detection.severity)} text-xs`}> 
                  {detection.severity}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
