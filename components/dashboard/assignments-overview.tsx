import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Clock } from "lucide-react"

interface AssignmentsOverviewProps {}

export function AssignmentsOverview({}: AssignmentsOverviewProps) {
  const assignments = [
    {
      id: 1,
      title: "Investigation Subject 1",
      severity: "Critical",
      from: "user@example.com",
      lastUpdated: "8/11/2025, 1:51:11 PM",
      status: "continue",
    },
    {
      id: 2,
      title: "Investigation Subject 2",
      severity: "High",
      from: "user1@example.com",
      lastUpdated: "8/11/2025, 12:51:11 PM",
      status: "continue",
    },
  ]

  return (
    <Card className="transition duration-200 hover:border-app-border hover:shadow-[var(--shadow-md)]">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-app-textPrimary">Your Assignments</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex gap-4 text-app-textSecondary">
          <div className="flex-1">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm">Continue</span>
              <Badge variant="secondary" className="bg-white/10 text-white">
                2
              </Badge>
            </div>
          </div>
          <div className="flex-1">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm">New Assignments</span>
              <Badge variant="secondary" className="bg-white/10 text-white">
                2
              </Badge>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {assignments.map((assignment) => (
            <div
              key={assignment.id}
              className="rounded-2xl border border-white/5 bg-white/[0.04] px-4 py-3 transition duration-200 hover:border-app-ring/60"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-app-textMuted" />
                    <span className="text-sm font-medium text-app-textPrimary">{assignment.title}</span>
                    <Badge variant={assignment.severity === "Critical" ? "destructive" : "default"} className="text-xs">
                      {assignment.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-app-textSecondary">From: {assignment.from}</p>
                  <p className="text-xs text-app-textSecondary">Last updated: {assignment.lastUpdated}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-app-border/50 bg-transparent text-app-textPrimary hover:border-app-ring hover:bg-app-ring/10"
                >
                  Continue
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
