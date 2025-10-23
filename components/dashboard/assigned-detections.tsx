import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface AssignedDetectionsProps {
  count: number
}

export function AssignedDetections({ count }: AssignedDetectionsProps) {
  return (
    <Card className="card text-white transition-all duration-300">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-white">Your Assigned Detections</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-2 text-3xl font-bold text-white">{count}</div>
        <p className="text-sm text-white/60">Active cases requiring your attention</p>
      </CardContent>
    </Card>
  )
}
