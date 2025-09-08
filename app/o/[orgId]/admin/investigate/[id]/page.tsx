"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Mail, User, Clock, Shield } from "lucide-react"

export default function InvestigatePage() {
  const router = useRouter()
  const params = useParams()
  const orgId = params.orgId as string
  const investigationId = params.id as string
  
  const [loading, setLoading] = useState(true)
  const [investigation, setInvestigation] = useState<any>(null)

  useEffect(() => {
    // Simulate loading investigation data
    const loadInvestigation = async () => {
      setLoading(true)
      try {
        // This would normally fetch from your API
        // For now, create mock data based on the ID
        const mockInvestigation = {
          id: investigationId,
          emailSubject: `Investigation ${investigationId}`,
          sender: "suspicious@example.com",
          recipient: "employee@company.com",
          severity: "High",
          status: "In Progress",
          createdAt: new Date().toISOString(),
          description: "Investigating potentially suspicious email activity"
        }
        
        setInvestigation(mockInvestigation)
      } catch (error) {
        console.error("Failed to load investigation:", error)
      } finally {
        setLoading(false)
      }
    }

    loadInvestigation()
  }, [investigationId])

  const handleBackToAssignments = () => {
    router.push(`/o/${orgId}/admin/assignments`)
  }

  const handleBackToDetections = () => {
    router.push(`/o/${orgId}/admin/detections`)
  }

  if (loading) {
    return (
      <AppLayout>
        <FadeInSection>
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Shield className="animate-spin mx-auto h-8 w-8 mb-4 text-white" />
              <p className="text-white">Loading investigation...</p>
            </div>
          </div>
        </FadeInSection>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <FadeInSection>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToAssignments}
                className="text-gray-400 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Assignments
              </Button>
              <div className="h-4 w-px bg-gray-600" />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToDetections}
                className="text-gray-400 hover:text-white"
              >
                Back to Detections
              </Button>
            </div>
            <Badge variant={investigation?.severity === 'High' ? 'destructive' : 'secondary'}>
              {investigation?.severity} Priority
            </Badge>
          </div>

          {/* Investigation Details */}
          <Card className="bg-[#1a1a1a] border-[#2a2a2a]">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Investigation Details
                </CardTitle>
                <Badge variant="outline" className="text-gray-300">
                  ID: {investigationId}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-gray-400">
                    <Mail className="w-4 h-4" />
                    <span className="text-sm">Email Subject</span>
                  </div>
                  <p className="text-white font-medium">{investigation?.emailSubject}</p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-gray-400">
                    <User className="w-4 h-4" />
                    <span className="text-sm">Sender</span>
                  </div>
                  <p className="text-white font-medium">{investigation?.sender}</p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-gray-400">
                    <User className="w-4 h-4" />
                    <span className="text-sm">Recipient</span>
                  </div>
                  <p className="text-white font-medium">{investigation?.recipient}</p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-gray-400">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">Created</span>
                  </div>
                  <p className="text-white font-medium">
                    {investigation?.createdAt ? new Date(investigation.createdAt).toLocaleString() : 'N/A'}
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-gray-400">
                  <Shield className="w-4 h-4" />
                  <span className="text-sm">Description</span>
                </div>
                <p className="text-white">{investigation?.description}</p>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card className="bg-[#1a1a1a] border-[#2a2a2a]">
            <CardHeader>
              <CardTitle className="text-white">Investigation Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button variant="outline" className="bg-[#2a2a2a] border-[#3a3a3a] text-white hover:bg-[#3a3a3a]">
                  Mark as Resolved
                </Button>
                <Button variant="outline" className="bg-[#2a2a2a] border-[#3a3a3a] text-white hover:bg-[#3a3a3a]">
                  Escalate to Admin
                </Button>
                <Button variant="outline" className="bg-[#2a2a2a] border-[#3a3a3a] text-white hover:bg-[#3a3a3a]">
                  Add Notes
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Placeholder for future investigation tools */}
          <Card className="bg-[#1a1a1a] border-[#2a2a2a]">
            <CardHeader>
              <CardTitle className="text-white">Investigation Tools</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-400">
                Investigation tools and analysis features will be available here.
                This is a placeholder page to ensure navigation works correctly.
              </p>
            </CardContent>
          </Card>
        </div>
      </FadeInSection>
    </AppLayout>
  )
}