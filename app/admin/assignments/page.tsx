"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Clock, CheckCircle2 } from "lucide-react"
import { getInProgressInvestigations } from "@/lib/investigation-service"
import { cn } from "@/lib/utils"
import { AssignmentsList } from "@/components/assignments-list"

// Mock data for assignments
const mockAssignments = [
  {
    id: 1,
    uniqueId: "DET-001",
    severity: "Critical",
    name: "Phishing Attempt",
    status: "In Progress",
    assignedTo: ["John Doe"],
    sentBy: "suspicious@phishing.com",
    timestamp: "2024-01-31T15:20:00Z",
    description: "Suspicious email with malicious attachment",
    indicators: ["Suspicious sender", "Malicious attachment", "Urgent request"],
    recommendations: ["Block sender", "Delete email", "Notify affected users"],
  },
  {
    id: 2,
    uniqueId: "DET-002",
    severity: "High",
    name: "Suspicious Login",
    status: "New",
    assignedTo: ["John Doe", "Jane Smith"],
    sentBy: "security@company.com",
    timestamp: "2024-01-31T14:10:00Z",
    description: "Multiple failed login attempts from unusual location",
    indicators: ["Multiple failures", "Unusual location", "Off-hours activity"],
    recommendations: ["Reset password", "Enable 2FA", "Review access logs"],
  },
  {
    id: 3,
    uniqueId: "DET-003",
    severity: "Medium",
    name: "Data Exfiltration Attempt",
    status: "In Progress",
    assignedTo: ["John Doe"],
    sentBy: "employee@company.com",
    timestamp: "2024-01-31T12:30:00Z",
    description: "Large amount of data being sent to external location",
    indicators: ["Large data transfer", "Unusual recipient", "Sensitive data"],
    recommendations: ["Block transfer", "Investigate user", "Review DLP policies"],
  },
]
type Investigation = ReturnType<typeof getInProgressInvestigations>[0];

interface InvestigationWithSeverity extends Investigation {
  severity: string;
}

export default function AssignmentsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [assignments, setAssignments] = useState(mockAssignments)
  const [inProgressInvestigations, setInProgressInvestigations] = useState<InvestigationWithSeverity[]>([])
  const [activeTab, setActiveTab] = useState("continue")
  const router = useRouter()

    // Load in-progress investigations
    const investigations = getInProgressInvestigations()

    // Add mock severity for demo purposes
    // In a real app, this would come from the actual investigation data
    const investigationsWithSeverity = investigations.map((inv) => ({
      ...inv,
      severity:
        Math.random() > 0.7 ? "Critical" : Math.random() > 0.5 ? "High" : Math.random() > 0.3 ? "Medium" : "Low",
    }))

    // Sort by severity (Critical -> High -> Medium -> Low)
    const sortedInvestigations = investigationsWithSeverity.sort((a, b) => {
      const severityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 }
      return (
        severityOrder[a.severity as keyof typeof severityOrder] -
        severityOrder[b.severity as keyof typeof severityOrder]
      )
    })

    setInProgressInvestigations(sortedInvestigations)
  }, [router])

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
    <AppLayout username="John Doe" onSearch={setSearchQuery} notificationsCount={1}>
      <FadeInSection>
        <h2 className="text-2xl font-bold mb-4">Assignments</h2>

        <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="continue" className="relative">
              Continue Investigations
              {inProgressInvestigations.length > 0 && (
                <Badge className="ml-2 bg-primary text-primary-foreground">{inProgressInvestigations.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="new" className="relative">
              New Assignments
              {assignments.length > 0 && (
                <Badge className="ml-2 bg-primary text-primary-foreground">{assignments.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="continue">
            <Card>
              <CardHeader>
                <CardTitle>In-Progress Investigations</CardTitle>
              </CardHeader>
              <CardContent>
                {inProgressInvestigations.length > 0 ? (
                  <div className="space-y-4">
                    {inProgressInvestigations.map((investigation) => (
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
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No in-progress investigations</h3>
                    <p className="text-sm text-muted-foreground mt-1">All your investigations are complete</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="new">
            <AssignmentsList searchQuery={searchQuery} assignments={assignments} />
          </TabsContent>
        </Tabs>
      </FadeInSection>
    </AppLayout>
  )
}
