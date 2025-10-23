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
  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "critical":
        return "bg-red-500"
      case "high":
        return "bg-orange-500"
      case "medium":
        return "bg-yellow-500"
      case "low":
        return "bg-green-500"
      default:
        return "bg-[#1f1f1f]"
    }
  }

  return (
    <Card className="card text-white transition-all duration-300">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-white">Completed Detections</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-2 text-2xl font-bold text-white">{detections.length}</div>
        <p className="mb-4 text-sm text-white/60">Completed today</p>

        <div className="space-y-2">
          {detections.slice(0, 3).map((detection) => (
            <div
              key={detection.id}
              className="rounded-2xl border border-white/5 bg-white/5 px-3 py-2 transition duration-200 hover:border-blue-400/40"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{detection.name}</p>
                  <p className="text-xs text-white/60">Resolved by {detection.resolvedBy}</p>
                </div>
                <Badge className={`${getSeverityColor(detection.severity)} text-white text-xs`}>
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
