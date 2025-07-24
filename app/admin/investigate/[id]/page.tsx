"use client"

// Replace the entire component with this implementation that keeps the original UI
// but replaces the Team Activity sidebar with the Security Copilot

import { useParams, useRouter } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { FadeInSection } from "@/components/fade-in-section"
import {
  AlertTriangle,
  FileText,
  LinkIcon,
  Shield,
  Mail,
  Check,
  X,
  ArrowRight,
  ExternalLink,
  Bot,
  Send,
} from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import {
  getInvestigation,
  saveInvestigationState,
  removeInvestigation,
  type InvestigationState,
} from "@/lib/investigation-service"
import { AppSidebar } from "@/components/sidebar/app-sidebar"

// Mock data structure
const mockEmailData = {
  basic: {
    sender: "suspicious.sender@malicious-domain.com",
    recipient: "employee@company.com",
    subject: "Urgent: Account Security Update Required",
    timeReceived: "2024-01-31T15:42:00Z",
    body: "Your account security needs immediate attention. Click here to verify...",
  },
  metadata: {
    senderIP: "192.168.1.1",
    location: "Unknown Location (Suspicious)",
    mailServer: "mail.suspicious-server.com",
    messageId: "<abc123@malicious-domain.com>",
    headers: {
      received: "from mail.suspicious-server.com",
      contentType: "multipart/mixed",
      xMailer: "Suspicious Mailer 1.0",
    },
  },
  threat: {
    riskScore: 85,
    category: "Phishing",
    authentication: {
      spf: "Fail",
      dkim: "Fail",
      dmarc: "Fail",
    },
  },
  content: {
    links: [
      { url: "http://malicious-site.com/login", status: "Flagged" },
      { url: "http://legitimate-looking.com", status: "Unknown" },
    ],
    attachments: [
      {
        name: "invoice.pdf",
        size: "250KB",
        type: "application/pdf",
        scanResult: "Suspicious",
      },
    ],
    keywords: ["urgent", "security", "immediate", "verify"],
  },
  reputation: {
    emailScore: 15,
    domainScore: 20,
    previousIncidents: 5,
    knownCampaigns: ["PhishingCampaign2024", "MalwareSpread2023"],
  },
  security: {
    tlsEncryption: false,
    digitalSignature: "Not signed",
    antivirusScan: "Failed",
  },
  actions: {
    history: [
      { action: "Flagged", timestamp: "2024-01-31T15:43:00Z", user: "System" },
      { action: "Quarantined", timestamp: "2024-01-31T15:43:01Z", user: "System" },
    ],
    notes: [],
  },
  patterns: {
    frequency: "High",
    similarIncidents: 12,
    volumeTrend: "Increasing",
  },
  compliance: {
    gdprStatus: "Reviewed",
    ccpaStatus: "Pending",
    auditLog: [
      { action: "Created", timestamp: "2024-01-31T15:42:00Z", user: "System" },
      { action: "Updated", timestamp: "2024-01-31T15:43:00Z", user: "System" },
    ],
  },
  emailChain: [
    {
      timestamp: "2024-01-31T15:42:00Z",
      direction: "Inbound",
      content: "Initial suspicious email",
    },
  ],
}

export default function AdminInvestigatePage() {
  const params = useParams()
  const router = useRouter()
  const [emailData, setEmailData] = useState(mockEmailData)
  const [activeTab, setActiveTab] = useState("overview")
  const [isPushDialogOpen, setIsPushDialogOpen] = useState(false)
  const [isAllowDialogOpen, setIsAllowDialogOpen] = useState(false)
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false)
  const [isSandboxDialogOpen, setIsSandboxDialogOpen] = useState(false)
  const [isLinkAnalysisOpen, setIsLinkAnalysisOpen] = useState(false)
  const [selectedAttachment, setSelectedAttachment] = useState<string>("")
  const [selectedLink, setSelectedLink] = useState<string>("")
  const [actionReason, setActionReason] = useState("")
  const [linkAnalysis, setLinkAnalysis] = useState("")
  const [investigationNotes, setInvestigationNotes] = useState("")
  const [investigationProgress, setInvestigationProgress] = useState(0)
  const { toast } = useToast()

  // Security Copilot integration
  const [isCopilotOpen, setIsCopilotOpen] = useState(true)
  const [copilotDetectionData, setCopilotDetectionData] = useState<any>(null)
  const [copilotEmailData, setCopilotEmailData] = useState<any>(null)

  // Track which tabs have been visited to avoid duplicate progress updates
  const visitedTabsRef = useRef<Set<string>>(new Set(["overview"]))

  // Load investigation state
  useEffect(() => {
    // Load investigation state if it exists
    if (params.id) {
      const investigation = getInvestigation(params.id as string)
      if (investigation) {
        // Restore investigation state
        setInvestigationNotes(investigation.notes || "")
        setInvestigationProgress(investigation.progress)

        // Mark tabs as visited if progress is already high
        if (investigation.progress > 50) {
          visitedTabsRef.current = new Set(["overview", "technical", "threat", "content", "reputation"])
        }
      } else {
        // Create a new investigation state
        const newInvestigation: InvestigationState = {
          id: params.id as string,
          emailId: "email-123", // In a real app, this would be the actual email ID
          emailSubject: emailData.basic.subject,
          sender: emailData.basic.sender,
          timestamp: emailData.basic.timeReceived,
          lastUpdated: new Date().toISOString(),
          notes: "",
          progress: 0,
        }
        saveInvestigationState(newInvestigation)
      }

      // Set detection data for the Security Copilot
      setCopilotDetectionData({
        id: params.id,
        severity: "Critical",
        name: emailData.basic.subject,
        sender: emailData.basic.sender,
      })

      // Set email data for the Security Copilot
      setCopilotEmailData(emailData)
    }
  }, [params.id, emailData])

  // Auto-save investigation state when progress changes
  useEffect(() => {
    const saveTimeout = setTimeout(() => {
      if (params.id) {
        const investigation = getInvestigation(params.id as string)
        if (investigation) {
          saveInvestigationState({
            ...investigation,
            notes: investigationNotes,
            progress: investigationProgress,
          })
        }
      }
    }, 500) // Debounce saving to avoid excessive writes

    return () => clearTimeout(saveTimeout)
  }, [investigationNotes, investigationProgress, params.id])

  const handleSignOut = () => {
    localStorage.removeItem("access_token")
    localStorage.removeItem("user_email")
    router.push("/login")
  }

  const handleAllowSender = () => {
    if (!actionReason.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please provide a reason for allowing this sender.",
      })
      return
    }

    toast({
      title: "Sender Allowed",
      description: `${emailData.basic.sender} has been added to the allow list.`,
    })

    // Remove the investigation since it's complete
    if (params.id) {
      removeInvestigation(params.id as string)
    }

    setIsAllowDialogOpen(false)
    setActionReason("")
    router.push("/admin/allow-block-list")
  }

  const handleBlockSender = () => {
    if (!actionReason.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please provide a reason for blocking this sender.",
      })
      return
    }

    toast({
      title: "Sender Blocked",
      description: `${emailData.basic.sender} has been added to the block list.`,
    })

    // Remove the investigation since it's complete
    if (params.id) {
      removeInvestigation(params.id as string)
    }

    setIsBlockDialogOpen(false)
    setActionReason("")
    router.push("/admin/allow-block-list")
  }

  const handlePushConfirm = () => {
    if (params.id) {
      // Remove the investigation since it's being pushed
      removeInvestigation(params.id as string)

      toast({
        title: "Investigation Pushed",
        description: "The investigation has been moved to Pushed Requests.",
      })
      router.push("/admin/pushed-requests")
    }
  }

  const handleSandboxOpen = (attachmentName: string) => {
    setSelectedAttachment(attachmentName)
    setIsSandboxDialogOpen(true)

    // Update progress when analyzing attachments
    setInvestigationProgress((prev) => Math.min(prev + 15, 100))
  }

  const handleSandboxConfirm = () => {
    toast({
      title: "Opening in Sandbox",
      description: `Opening ${selectedAttachment} in a secure sandbox environment.`,
    })
    setIsSandboxDialogOpen(false)
  }

  const handleLinkAnalysis = async (url: string) => {
    setSelectedLink(url)
    setLinkAnalysis("Analyzing link content...")
    setIsLinkAnalysisOpen(true)

    // Update progress when analyzing links
    setInvestigationProgress((prev) => Math.min(prev + 10, 100))

    // Simulate AI analysis
    setTimeout(() => {
      setLinkAnalysis(
        `Analysis of ${url}:

` +
          "This link appears to be a phishing attempt. It leads to a page that mimics a legitimate login form. " +
          "The domain was registered recently and has been associated with multiple phishing campaigns. " +
          "Recommendation: Do not click this link and block the sender.",
      )
    }, 1500)
  }

  const getAuthenticationBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "pass":
        return <Badge className="bg-green-500">{status}</Badge>
      case "fail":
        return <Badge variant="destructive">{status}</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getLinkStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "safe":
        return <Badge className="bg-green-500">{status}</Badge>
      case "flagged":
        return <Badge variant="destructive">{status}</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  // Update progress when changing tabs - fixed to avoid infinite loops
  const handleTabChange = (value: string) => {
    // First, update the active tab
    setActiveTab(value)

    // Then, check if this is the first time visiting this tab
    if (!visitedTabsRef.current.has(value)) {
      // Mark this tab as visited
      visitedTabsRef.current.add(value)

      // Only update progress if this is a new tab and progress is below threshold
      if (value !== "overview" && investigationProgress < 75) {
        // Calculate new progress value
        const progressIncrement = 15
        const newProgress = Math.min(investigationProgress + progressIncrement, 75)

        // Update progress with the calculated value
        setInvestigationProgress(newProgress)
      }
    }
  }

  // Custom layout for investigation page with Security Copilot in place of Team Activity
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Left sidebar - UPDATED to match the design */}
      <AppSidebar isCollapsed={false} onToggle={() => {}} username="John Doe" onSignOut={handleSignOut} />

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          <FadeInSection>
            <div className="max-w-7xl mx-auto space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <CardTitle className="text-2xl">Investigation Details</CardTitle>
                      <Badge variant="destructive">High Risk</Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="gap-2" onClick={() => setIsAllowDialogOpen(true)}>
                        <Check className="h-4 w-4" />
                        Allow Sender
                      </Button>
                      <Button variant="outline" className="gap-2" onClick={() => setIsBlockDialogOpen(true)}>
                        <X className="h-4 w-4" />
                        Block Sender
                      </Button>
                      <Button variant="default" className="gap-2" onClick={() => setIsPushDialogOpen(true)}>
                        <ArrowRight className="h-4 w-4" />
                        Push
                      </Button>
                    </div>
                  </div>

                  {/* Progress indicator */}
                  <div className="mt-4">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium">Investigation Progress</span>
                      <span className="text-sm font-medium">{investigationProgress}%</span>
                    </div>
                    <Progress value={investigationProgress} className="h-2" />
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="overview" value={activeTab} onValueChange={handleTabChange} className="w-full">
                    <TabsList className="grid grid-cols-5 gap-4 h-auto">
                      <TabsTrigger value="overview" className="gap-2">
                        <Mail className="h-4 w-4" />
                        Overview
                      </TabsTrigger>
                      <TabsTrigger value="technical" className="gap-2">
                        <FileText className="h-4 w-4" />
                        Technical Details
                      </TabsTrigger>
                      <TabsTrigger value="threat" className="gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Threat Assessment
                      </TabsTrigger>
                      <TabsTrigger value="content" className="gap-2">
                        <LinkIcon className="h-4 w-4" />
                        Content Analysis
                      </TabsTrigger>
                      <TabsTrigger value="reputation" className="gap-2">
                        <Shield className="h-4 w-4" />
                        Reputation
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="mt-6">
                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <h3 className="text-lg font-semibold">Email Details</h3>
                          <div className="grid gap-2">
                            <div className="grid grid-cols-3 gap-4">
                              <div className="space-y-1">
                                <p className="text-sm font-medium">From</p>
                                <p className="text-sm text-muted-foreground">{emailData.basic.sender}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-sm font-medium">To</p>
                                <p className="text-sm text-muted-foreground">{emailData.basic.recipient}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-sm font-medium">Received</p>
                                <p className="text-sm text-muted-foreground">
                                  {new Date(emailData.basic.timeReceived).toLocaleString()}
                                </p>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm font-medium">Subject</p>
                              <p className="text-sm text-muted-foreground">{emailData.basic.subject}</p>
                            </div>
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <h3 className="text-lg font-semibold">Message Body</h3>
                          <Card className="p-4">
                            <pre className="whitespace-pre-wrap text-sm">{emailData.basic.body}</pre>
                          </Card>
                        </div>

                        {/* Investigation Notes */}
                        <div className="grid gap-2 mt-4">
                          <h3 className="text-lg font-semibold">Investigation Notes</h3>
                          <Textarea
                            placeholder="Add your investigation notes here..."
                            value={investigationNotes}
                            onChange={(e) => setInvestigationNotes(e.target.value)}
                            className="min-h-[100px]"
                          />
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="technical" className="mt-6">
                      {/* Technical tab content unchanged */}
                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <h3 className="text-lg font-semibold">Metadata</h3>
                          <Card className="p-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <p className="text-sm font-medium">Sender IP</p>
                                <p className="text-sm text-muted-foreground">{emailData.metadata.senderIP}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-sm font-medium">Location</p>
                                <p className="text-sm text-muted-foreground">{emailData.metadata.location}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-sm font-medium">Mail Server</p>
                                <p className="text-sm text-muted-foreground">{emailData.metadata.mailServer}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-sm font-medium">Message ID</p>
                                <p className="text-sm text-muted-foreground">{emailData.metadata.messageId}</p>
                              </div>
                            </div>
                          </Card>
                        </div>
                        <div className="grid gap-2">
                          <h3 className="text-lg font-semibold">Headers</h3>
                          <Card className="p-4">
                            <pre className="text-sm whitespace-pre-wrap">
                              {JSON.stringify(emailData.metadata.headers, null, 2)}
                            </pre>
                          </Card>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="threat" className="mt-6">
                      {/* Threat tab content unchanged */}
                      <div className="grid gap-6">
                        <div className="grid gap-2">
                          <h3 className="text-lg font-semibold">Risk Assessment</h3>
                          <Card className="p-6">
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <div className="flex justify-between">
                                  <p className="text-sm font-medium">Risk Score</p>
                                  <p className="text-sm font-medium">{emailData.threat.riskScore}/100</p>
                                </div>
                                <Progress value={emailData.threat.riskScore} className="h-2" />
                              </div>
                              <div className="space-y-2">
                                <p className="text-sm font-medium">Category</p>
                                <Badge variant="destructive">{emailData.threat.category}</Badge>
                              </div>
                            </div>
                          </Card>
                        </div>
                        <div className="grid gap-2">
                          <h3 className="text-lg font-semibold">Authentication Results</h3>
                          <Card className="p-6">
                            <div className="grid grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <p className="text-sm font-medium">SPF</p>
                                {getAuthenticationBadge(emailData.threat.authentication.spf)}
                              </div>
                              <div className="space-y-2">
                                <p className="text-sm font-medium">DKIM</p>
                                {getAuthenticationBadge(emailData.threat.authentication.dkim)}
                              </div>
                              <div className="space-y-2">
                                <p className="text-sm font-medium">DMARC</p>
                                {getAuthenticationBadge(emailData.threat.authentication.dmarc)}
                              </div>
                            </div>
                          </Card>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="content" className="mt-6">
                      {/* Content tab content unchanged */}
                      <div className="grid gap-6">
                        <div className="grid gap-2">
                          <h3 className="text-lg font-semibold">Suspicious Links</h3>
                          <Card className="p-4">
                            <div className="space-y-4">
                              {emailData.content.links.map((link, index) => (
                                <div key={index} className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <LinkIcon className="h-4 w-4" />
                                    <span className="text-sm">{link.url}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {getLinkStatusBadge(link.status)}
                                    <Button variant="ghost" size="sm" onClick={() => handleLinkAnalysis(link.url)}>
                                      <ExternalLink className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </Card>
                        </div>
                        <div className="grid gap-2">
                          <h3 className="text-lg font-semibold">Attachments</h3>
                          <Card className="p-4">
                            <div className="space-y-4">
                              {emailData.content.attachments.map((attachment, index) => (
                                <div key={index} className="flex items-center justify-between">
                                  <div className="space-y-1">
                                    <p className="text-sm font-medium">{attachment.name}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {attachment.type} • {attachment.size}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="destructive">{attachment.scanResult}</Badge>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleSandboxOpen(attachment.name)}
                                    >
                                      <Shield className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </Card>
                        </div>
                        <div className="grid gap-2">
                          <h3 className="text-lg font-semibold">Detected Keywords</h3>
                          <Card className="p-4">
                            <div className="flex flex-wrap gap-2">
                              {emailData.content.keywords.map((keyword, index) => (
                                <Badge key={index} variant="secondary">
                                  {keyword}
                                </Badge>
                              ))}
                            </div>
                          </Card>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="reputation" className="mt-6">
                      {/* Reputation tab content unchanged */}
                      <div className="grid gap-6">
                        <div className="grid gap-2">
                          <h3 className="text-lg font-semibold">Reputation Scores</h3>
                          <Card className="p-6">
                            <div className="grid grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <p className="text-sm font-medium">Email Reputation</p>
                                <Progress value={emailData.reputation.emailScore} className="h-2" />
                                <p className="text-sm text-muted-foreground">{emailData.reputation.emailScore}/100</p>
                              </div>
                              <div className="space-y-2">
                                <p className="text-sm font-medium">Domain Reputation</p>
                                <Progress value={emailData.reputation.domainScore} className="h-2" />
                                <p className="text-sm text-muted-foreground">{emailData.reputation.domainScore}/100</p>
                              </div>
                            </div>
                          </Card>
                        </div>
                        <div className="grid gap-2">
                          <h3 className="text-lg font-semibold">Known Campaigns</h3>
                          <Card className="p-4">
                            <div className="space-y-2">
                              {emailData.reputation.knownCampaigns.map((campaign, index) => (
                                <div key={index} className="flex items-center gap-2">
                                  <AlertTriangle className="h-4 w-4 text-destructive" />
                                  <span className="text-sm">{campaign}</span>
                                </div>
                              ))}
                            </div>
                          </Card>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          </FadeInSection>
        </div>
      </div>

      {/* Security Copilot in place of Team Activity sidebar */}
      <div className="w-[320px] border-l bg-background">
        <div className="flex h-14 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Security Copilot</h2>
          </div>
          <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
            Active
          </Badge>
        </div>
        <div className="h-[calc(100vh-3.5rem)] flex flex-col">
          <div className="flex-1 overflow-auto p-4">
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-3">
                <p className="text-sm">
                  Hello! I'm your Security Copilot. I can help you investigate this detection by answering questions and
                  providing insights. What would you like to know?
                </p>
                <p className="text-xs text-muted-foreground mt-1">02:14 PM</p>
              </div>

              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">Suggested questions:</p>
                <div className="flex flex-col gap-2">
                  <Button variant="outline" size="sm" className="justify-start h-auto py-2 px-3">
                    What makes this email suspicious?
                  </Button>
                  <Button variant="outline" size="sm" className="justify-start h-auto py-2 px-3">
                    Analyze the sender's reputation
                  </Button>
                  <Button variant="outline" size="sm" className="justify-start h-auto py-2 px-3">
                    What actions should I take?
                  </Button>
                  <Button variant="outline" size="sm" className="justify-start h-auto py-2 px-3">
                    Explain the risk level
                  </Button>
                  <Button variant="outline" size="sm" className="justify-start h-auto py-2 px-3">
                    Show similar past incidents
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div className="p-3 border-t">
            <form className="flex gap-2">
              <Input placeholder="Ask a question..." className="flex-1" />
              <Button type="submit" size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <AlertDialog open={isPushDialogOpen} onOpenChange={setIsPushDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Push Investigation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to push this for further investigation?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePushConfirm}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isAllowDialogOpen} onOpenChange={setIsAllowDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allow Sender</DialogTitle>
            <DialogDescription>Please provide a reason for allowing this sender.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="reason">Reason:</Label>
              <Input
                id="reason"
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Enter reason for allowing sender..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAllowDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAllowSender}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isBlockDialogOpen} onOpenChange={setIsBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block Sender</DialogTitle>
            <DialogDescription>Please provide a reason for blocking this sender.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="reason">Reason:</Label>
              <Input
                id="reason"
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Enter reason for blocking sender..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBlockDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBlockSender}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sandbox Dialog */}
      <AlertDialog open={isSandboxDialogOpen} onOpenChange={setIsSandboxDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Open in Sandbox</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to open {selectedAttachment} in a secure sandbox environment?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSandboxConfirm}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Link Analysis Dialog */}
      <Dialog open={isLinkAnalysisOpen} onOpenChange={setIsLinkAnalysisOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Analysis</DialogTitle>
            <DialogDescription>AI Analysis of: {selectedLink}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 p-4 rounded-md bg-muted">
            <pre className="whitespace-pre-wrap text-sm">{linkAnalysis}</pre>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsLinkAnalysisOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}