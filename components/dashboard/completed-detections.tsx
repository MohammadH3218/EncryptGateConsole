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
    <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
      <CardHeader>
        <CardTitle className="text-white">Completed Detections</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-white mb-2">{detections.length}</div>
        <p className="text-sm text-gray-400 mb-4">Completed today</p>

        <div className="space-y-2">
          {detections.slice(0, 3).map((detection) => (
            <div
              key={detection.id}
              className="bg-transparent hover:bg-[#1f1f1f] rounded-lg p-2 transition-all duration-300"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{detection.name}</p>
                  <p className="text-xs text-gray-400">Resolved by {detection.resolvedBy}</p>
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