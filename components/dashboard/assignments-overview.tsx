import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Clock } from "lucide-react"

interface AssignmentsOverviewProps {
  username: string
}

export function AssignmentsOverview({ username }: AssignmentsOverviewProps) {
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
    <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
      <CardHeader>
        <CardTitle className="text-white">Your Assignments</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-gray-300">Continue</span>
              <Badge variant="secondary" className="bg-white/20 text-white">
                2
              </Badge>
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-gray-300">New Assignments</span>
              <Badge variant="secondary" className="bg-white/20 text-white">
                2
              </Badge>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {assignments.map((assignment) => (
            <div
              key={assignment.id}
              className="bg-transparent hover:bg-[#1f1f1f] rounded-lg p-3 transition-all duration-300"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-white">{assignment.title}</span>
                    <Badge variant={assignment.severity === "Critical" ? "destructive" : "default"} className="text-xs">
                      {assignment.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-400">From: {assignment.from}</p>
                  <p className="text-xs text-gray-400">Last updated: {assignment.lastUpdated}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
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