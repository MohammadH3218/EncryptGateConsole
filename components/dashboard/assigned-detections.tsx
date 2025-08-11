import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface AssignedDetectionsProps {
  count: number
}

export function AssignedDetections({ count }: AssignedDetectionsProps) {
  return (
    <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
      <CardHeader>
        <CardTitle className="text-white">Your Assigned Detections</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-white mb-2">{count}</div>
        <p className="text-sm text-gray-400">Active cases requiring your attention</p>
      </CardContent>
    </Card>
  )
}