import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface AssignedDetectionsProps {
  count: number
}

export function AssignedDetections({ count }: AssignedDetectionsProps) {
  return (
    <Card className="transition duration-200 hover:border-app-border hover:shadow-[var(--shadow-md)]">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-app-textPrimary">Your Assigned Detections</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-2 text-3xl font-bold text-app-textPrimary">{count}</div>
        <p className="text-sm text-app-textSecondary">Active cases requiring your attention</p>
      </CardContent>
    </Card>
  )
}
