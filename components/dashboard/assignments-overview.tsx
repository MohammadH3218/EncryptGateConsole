"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { getInProgressInvestigations } from "@/lib/investigation-service"
import { cn } from "@/lib/utils"

interface Assignment {
  id: number
  uniqueId: string
  severity: string
  name: string
  status: string
  assignedTo: string[] | string
  sentBy: string
  timestamp: string
}

type InvestigationBase = ReturnType<typeof getInProgressInvestigations>[number];

interface InvestigationWithSeverity extends InvestigationBase {
  severity: string
  emailSubject: string
  sender: string
  lastUpdated: string
}

interface AssignmentsOverviewProps {
  username: string
}

export function AssignmentsOverview({ username }: AssignmentsOverviewProps) {
  const router = useRouter()
  const [inProgressInvestigations, setInProgressInvestigations] = useState<InvestigationWithSeverity[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [activeTab, setActiveTab] = useState("continue")

  useEffect(() => {
    const investigations = getInProgressInvestigations()

    const investigationsWithSeverity: InvestigationWithSeverity[] = investigations.map((inv, index) => ({
      ...inv,
      severity:
        Math.random() > 0.7 ? "Critical" : Math.random() > 0.5 ? "High" : Math.random() > 0.3 ? "Medium" : "Low",
      emailSubject: `Investigation Subject ${index + 1}`,
      sender: `user${index}@example.com`,
      lastUpdated: new Date(Date.now() - index * 3600000).toISOString(),
    }))

    const severityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 }
    const sortedInvestigations = investigationsWithSeverity.sort((a, b) => {
      return (
        severityOrder[a.severity as keyof typeof severityOrder] -
        severityOrder[b.severity as keyof typeof severityOrder]
      )
    })

    setInProgressInvestigations(sortedInvestigations)

    setAssignments([
      {
        id: 1,
        uniqueId: "DET-001",
        severity: "Critical",
        name: "Phishing Attempt",
        status: "New",
        assignedTo: [username],
        sentBy: "suspicious@phishing.com",
        timestamp: new Date().toISOString(),
      },
      {
        id: 2,
        uniqueId: "DET-002",
        severity: "High",
        name: "Suspicious Login",
        status: "New",
        assignedTo: [username],
        sentBy: "security@company.com",
        timestamp: new Date(Date.now() - 3600000).toISOString(),
      },
    ])
  }, [username])

  const handleContinueInvestigation = (id: string) => {
    router.push(`/admin/investigate/${id}`)
  }

  const handleStartInvestigation = (id: number) => {
    router.push(`/admin/investigate/${id}`)
  }

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity) {
      case "Critical":
        return "bg-red-600 text-white"
      case "High":
        return "bg-orange-500 text-white"
      case "Medium":
        return "bg-yellow-500 text-white"
      case "Low":
        return "bg-green-500 text-white"
      default:
        return "bg-gray-500 text-white"
    }
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Your Assignments</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="continue">
              Continue
              {inProgressInvestigations.length > 0 && (
                <Badge className="ml-2 bg-primary text-primary-foreground">
                  {inProgressInvestigations.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="new">
              New Assignments
              {assignments.length > 0 && (
                <Badge className="ml-2 bg-primary text-primary-foreground">
                  {assignments.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="continue" className="space-y-4">
            {inProgressInvestigations.length > 0 ? (
              inProgressInvestigations.map((investigation) => (
                <div
                  key={investigation.id}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="bg-muted rounded-full p-2">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{investigation.emailSubject}</h3>
                        <Badge className={cn("text-xs", getSeverityBadgeClass(investigation.severity))}>
                          {investigation.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">From: {investigation.sender}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Last updated: {new Date(investigation.lastUpdated).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Button onClick={() => handleContinueInvestigation(investigation.id)} className="ml-4">
                    Continue
                  </Button>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No in-progress investigations</h3>
                <p className="text-sm text-muted-foreground mt-1">All your investigations are complete</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="new" className="space-y-4">
            {assignments.length > 0 ? (
              assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="rounded-full p-2">
                      <AlertTriangle
                        className={cn(
                          "h-5 w-5",
                          assignment.severity === "Critical"
                            ? "text-red-500"
                            : assignment.severity === "High"
                            ? "text-orange-500"
                            : assignment.severity === "Medium"
                            ? "text-yellow-500"
                            : "text-green-500",
                        )}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{assignment.name}</h3>
                        <Badge className={cn("text-xs", getSeverityBadgeClass(assignment.severity))}>
                          {assignment.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">From: {assignment.sentBy}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(assignment.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Button onClick={() => handleStartInvestigation(assignment.id)} className="ml-4">
                    Investigate
                  </Button>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No new assignments</h3>
                <p className="text-sm text-muted-foreground mt-1">You're all caught up!</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
