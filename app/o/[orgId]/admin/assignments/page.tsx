"use client"

import { useState, useEffect } from "react"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { useRouter, useParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Clock, CheckCircle2 } from "lucide-react"
import { getInProgressInvestigations } from "@/lib/investigation-service"
import { cn } from "@/lib/utils"
import { AssignmentsList } from "@/components/assignments-list"

interface Assignment {
  id: number
  uniqueId: string
  severity: string
  name: string
  status: string
  assignedTo: string[]
  sentBy: string
  timestamp: string
  description: string
  indicators: string[]
  recommendations: string[]
}

const mockAssignments: Assignment[] = []
type Investigation = ReturnType<typeof getInProgressInvestigations>[0];

interface InvestigationWithSeverity extends Investigation {
  severity: string;
}

export default function AssignmentsPage() {
  const params = useParams()
  const [searchQuery] = useState("")
  const [assignments] = useState<Assignment[]>(mockAssignments)
  const [inProgressInvestigations, setInProgressInvestigations] = useState<InvestigationWithSeverity[]>([])
  const [activeTab, setActiveTab] = useState("continue")
  const router = useRouter()

  useEffect(() => {
    // Load in-progress investigations
    const investigations = getInProgressInvestigations()

    const investigationsWithSeverity = investigations.map((inv) => ({
      ...inv,
      severity: "Low",
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
  }, [])

  const handleContinueInvestigation = (id: string) => {
    router.push(`/o/${params.orgId}/admin/investigate/${id}`)
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
    <AppLayout notificationsCount={1}>
      <FadeInSection>
        <h2 className="text-2xl font-bold mb-4 text-white">Assignments</h2>

        <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4 bg-[#1f1f1f] border-[#1f1f1f]">
            <TabsTrigger value="continue" className="relative text-white data-[state=active]:bg-[#0f0f0f] data-[state=active]:text-white">
              Continue Investigations
              {inProgressInvestigations.length > 0 && (
                <Badge className="ml-2 bg-blue-600 text-white">{inProgressInvestigations.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="new" className="relative text-white data-[state=active]:bg-[#0f0f0f] data-[state=active]:text-white">
              New Assignments
              {assignments.length > 0 && (
                <Badge className="ml-2 bg-blue-600 text-white">{assignments.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="continue">
            <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
              <CardHeader>
                <CardTitle className="text-white">In-Progress Investigations</CardTitle>
              </CardHeader>
              <CardContent>
                {inProgressInvestigations.length > 0 ? (
                  <div className="space-y-4">
                    {inProgressInvestigations.map((investigation) => (
                      <div
                        key={investigation.id}
                        className="flex items-center justify-between p-4 rounded-lg border border-[#1f1f1f] bg-[#1f1f1f] hover:bg-[#2a2a2a] transition-colors"
                      >
                        <div className="flex items-start gap-4">
                          <div className="bg-[#2a2a2a] rounded-full p-2">
                            <Clock className="h-5 w-5 text-gray-400" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium text-white">{investigation.emailSubject}</h3>
                              <Badge className={cn("text-xs", getSeverityBadgeClass(investigation.severity))}>
                                {investigation.severity}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-400">From: {investigation.sender}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              Last updated: {new Date(investigation.lastUpdated).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <Button onClick={() => handleContinueInvestigation(investigation.id)} className="ml-4 bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]">
                          Continue
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <CheckCircle2 className="h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-white">No in-progress investigations</h3>
                    <p className="text-sm text-gray-400 mt-1">All your investigations are complete</p>
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