// app/admin/investigate/[id]/page.tsx
"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { FadeInSection } from "@/components/fade-in-section"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { SecurityCopilotEnhanced } from "@/components/security-copilot/security-copilot"
import { 
  ArrowLeft,
  Bot,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Mail,
  Calendar,
  Link,
  FileText,
  Save,
  Share,
  Minimize2,
  Maximize2,
  Send
} from "lucide-react"

interface EmailDetails {
  messageId: string
  subject: string
  sender: string
  recipients: string[]
  timestamp: string
  body: string
  bodyHtml?: string
  status: string
  threatLevel: string
  isPhishing: boolean
  attachments: string[]
  headers: Record<string, string>
  direction: string
  size: number
  urls?: string[]
}

interface DetectionDetails {
  id: string
  name: string
  severity: string
  status: string
  description: string
  indicators: string[]
  recommendations: string[]
  threatScore: number
  confidence: number
}

export default function InvestigationPage() {
  const params = useParams()
  const router = useRouter()
  const emailId = params.id as string
  
  const [emailDetails, setEmailDetails] = useState<EmailDetails | null>(null)
  const [detectionDetails, setDetectionDetails] = useState<DetectionDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState("")
  const [showCopilot, setShowCopilot] = useState(false)
  const [copilotMinimized, setCopilotMinimized] = useState(false)
  const [investigationStatus, setInvestigationStatus] = useState("in_progress")


  useEffect(() => {
    loadInvestigationData()
  }, [emailId])

  const loadInvestigationData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Load email details - for now using mock data since the API might not have real data
      const mockEmailDetails: EmailDetails = {
        messageId: emailId,
        subject: "Urgent: Account Security Update Required",
        sender: "suspicious.sender@malicious-domain.com",
        recipients: ["employee@company.com"],
        timestamp: new Date().toISOString(),
        body: "Your account security needs immediate attention. Click here to verify your credentials and prevent account suspension.",
        bodyHtml: "<p>Your account security needs <strong>immediate attention</strong>. <a href='http://phishing.com/verify'>Click here</a> to verify your credentials and prevent account suspension.</p>",
        status: "analyzed",
        threatLevel: "high",
        isPhishing: true,
        attachments: [],
        headers: {
          "X-Originating-IP": "192.168.1.100",
          "Return-Path": "suspicious.sender@malicious-domain.com",
          "Message-ID": emailId
        },
        direction: "inbound",
        size: 1024,
        urls: ["http://phishing.com/verify", "http://malicious-domain.com/login"]
      }

      const mockDetectionDetails: DetectionDetails = {
        id: "det-001",
        name: "Phishing Attempt Detected",
        severity: "critical",
        status: "new",
        description: "This email exhibits multiple characteristics of a phishing attack, including urgent language, suspicious URLs, and credential harvesting attempts.",
        indicators: [
          "Suspicious sender domain",
          "Urgent/threatening language",
          "URL leads to credential harvesting site",
          "Spoofing legitimate organization",
          "Requests sensitive information"
        ],
        recommendations: [
          "Block sender domain immediately",
          "Notify affected users",
          "Check for similar emails in organization",
          "Update security awareness training",
          "Report to security team"
        ],
        threatScore: 95,
        confidence: 88
      }

      setEmailDetails(mockEmailDetails)
      setDetectionDetails(mockDetectionDetails)
    } catch (err) {
      console.error('Failed to load investigation data:', err)
      setError('Failed to load investigation details')
    } finally {
      setLoading(false)
    }
  }

  const getRiskLevel = (threatLevel: string) => {
    switch (threatLevel) {
      case 'critical':
        return { label: 'Critical Risk', color: 'bg-red-600', icon: AlertTriangle }
      case 'high':
        return { label: 'High Risk', color: 'bg-orange-500', icon: AlertTriangle }
      case 'medium':
        return { label: 'Medium Risk', color: 'bg-yellow-500', icon: AlertTriangle }
      case 'low':
        return { label: 'Low Risk', color: 'bg-blue-500', icon: Shield }
      default:
        return { label: 'No Risk', color: 'bg-green-500', icon: CheckCircle }
    }
  }

  const handleStatusUpdate = async (newStatus: string) => {
    setInvestigationStatus(newStatus)
    // TODO: API call to update status
  }

  const handleSaveNotes = async () => {
    // TODO: API call to save investigation notes
    console.log('Saving notes:', notes)
  }

  const toggleCopilot = () => {
    if (!showCopilot) {
      setShowCopilot(true)
      setCopilotMinimized(false)
    } else if (!copilotMinimized) {
      setCopilotMinimized(true)
    } else {
      setShowCopilot(false)
      setCopilotMinimized(false)
    }
  }

  if (loading) {
    return (
      <AppLayout username="John Doe" notificationsCount={2}>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-2">Loading investigation...</span>
        </div>
      </AppLayout>
    )
  }

  if (error || !emailDetails) {
    return (
      <AppLayout username="John Doe" notificationsCount={2}>
        <FadeInSection>
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <p>{error || 'Email not found'}</p>
              </div>
              <Button onClick={() => router.back()} className="mt-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Back
              </Button>
            </CardContent>
          </Card>
        </FadeInSection>
      </AppLayout>
    )
  }

  const riskLevel = getRiskLevel(emailDetails.threatLevel)
  const RiskIcon = riskLevel.icon

  return (
    <AppLayout username="John Doe" notificationsCount={5}>
      <div className="relative min-h-screen">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Detections
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">Email Investigation</h1>
              <Badge className={`${riskLevel.color} mt-2`}>
                <RiskIcon className="h-3 w-3 mr-1" />
                {riskLevel.label}
              </Badge>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Share className="h-4 w-4 mr-2" />
              Share
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleCopilot}
              className={showCopilot && !copilotMinimized ? 'bg-primary/10' : ''}
            >
              <Bot className="h-4 w-4 mr-2" />
              {!showCopilot ? 'Security Copilot' : copilotMinimized ? 'Expand Copilot' : 'Minimize Copilot'}
            </Button>
          </div>
        </div>


        {/* Investigation Details Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Investigation Progress
              <div className="flex gap-2">
                <Button
                  variant={investigationStatus === 'in_progress' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleStatusUpdate('in_progress')}
                >
                  <Clock className="h-4 w-4 mr-2" />
                  In Progress
                </Button>
                <Button
                  variant={investigationStatus === 'resolved' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleStatusUpdate('resolved')}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Resolved
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: investigationStatus === 'resolved' ? '100%' : '60%' }}
              />
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {investigationStatus === 'resolved' ? 'Investigation completed' : 'Investigation in progress - 60% complete'}
            </p>
          </CardContent>
        </Card>

        {/* Investigation Details Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="technical">Technical Details</TabsTrigger>
            <TabsTrigger value="threat">Threat Assessment</TabsTrigger>
            <TabsTrigger value="content">Content Analysis</TabsTrigger>
            <TabsTrigger value="reputation">Reputation</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Email Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">From</label>
                    <p className="font-mono text-sm">{emailDetails.sender}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">To</label>
                    <p className="font-mono text-sm">{emailDetails.recipients.join(', ')}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Subject</label>
                    <p className="font-medium">{emailDetails.subject}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Received</label>
                    <p className="text-sm">{new Date(emailDetails.timestamp).toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Message Body</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted p-4 rounded-lg">
                    <p className="text-sm whitespace-pre-wrap">{emailDetails.body}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Investigation Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Add your investigation notes here..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[100px]"
                />
                <Button onClick={handleSaveNotes} className="mt-2">
                  <Save className="h-4 w-4 mr-2" />
                  Save Notes
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Technical Details Tab */}
          <TabsContent value="technical" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Email Headers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted p-4 rounded-lg font-mono text-sm space-y-2">
                  {Object.entries(emailDetails.headers).map(([key, value]) => (
                    <div key={key}>
                      <span className="text-blue-600">{key}:</span> {value}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {emailDetails.urls && emailDetails.urls.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Link className="h-5 w-5" />
                    URLs Found
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {emailDetails.urls.map((url, index) => (
                      <div key={index} className="p-3 bg-muted rounded-lg">
                        <p className="font-mono text-sm text-red-600">{url}</p>
                        <Badge variant="destructive" className="mt-1">Suspicious</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Threat Assessment Tab */}
          <TabsContent value="threat" className="space-y-4">
            {detectionDetails && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Threat Indicators</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {detectionDetails.indicators.map((indicator, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                          <span className="text-sm">{indicator}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recommended Actions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {detectionDetails.recommendations.map((recommendation, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-sm">{recommendation}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Content Analysis Tab */}
          <TabsContent value="content" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Content Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Language Analysis</label>
                    <p className="text-sm text-muted-foreground">Urgent and threatening language detected</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Sentiment</label>
                    <Badge variant="destructive">Threatening</Badge>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Phishing Indicators</label>
                    <div className="mt-2 space-y-1">
                      <Badge variant="outline" className="mr-2">Account suspension threat</Badge>
                      <Badge variant="outline" className="mr-2">Urgent action required</Badge>
                      <Badge variant="outline" className="mr-2">Credential request</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reputation Tab */}
          <TabsContent value="reputation" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Sender Reputation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Domain Reputation</label>
                    <Badge variant="destructive" className="ml-2">Malicious</Badge>
                  </div>
                  <div>
                    <label className="text-sm font-medium">IP Reputation</label>
                    <Badge variant="destructive" className="ml-2">Known Bad Actor</Badge>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Historical Activity</label>
                    <p className="text-sm text-muted-foreground">First time sender - no historical data</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Security Copilot - Bottom Corner Overlay */}
        {showCopilot && (
          <div className={`fixed bottom-4 right-4 z-50 bg-background border rounded-lg shadow-xl transition-all duration-300 ${
            copilotMinimized ? 'w-16 h-16' : 'w-96 h-[500px]'
          }`}>
            {copilotMinimized ? (
              <div className="flex items-center justify-center h-full">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCopilotMinimized(false)}
                  title="Expand Security Copilot"
                  className="w-full h-full"
                >
                  <Bot className="h-6 w-6 text-primary" />
                </Button>
              </div>
            ) : (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between p-3 border-b">
                  <h3 className="font-medium flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" />
                    Security Copilot
                  </h3>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCopilotMinimized(true)}
                      title="Minimize"
                    >
                      <Minimize2 className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCopilot(false)}
                      title="Close"
                    >
                      <XCircle className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex-1">
                  <SecurityCopilotEnhanced
                    emailData={emailDetails}
                    detectionData={detectionDetails}
                    messageId={emailDetails.messageId}
                    className="h-full border-0"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}