"use client"

import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { DashboardHeader } from "@/components/dashboard-header"
import { FadeInSection } from "@/components/fade-in-section"
import { AlertTriangle, FileText, LinkIcon, Shield, Mail, Check, X, ArrowRight, ExternalLink } from "lucide-react"
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
import { useToast } from "@/components/ui/use-toast"
import { useDetections } from "@/contexts/DetectionsContext"

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
  const router = useRouter()
  const { toast } = useToast()
  const { removeDetection, pushDetection, blockSender, allowSender } = useDetections()

  const handleSignOut = () => {
    console.log("User signed out")
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

    allowSender(emailData.basic.sender, actionReason, "John Doe")
    toast({
      title: "Sender Allowed",
      description: `${emailData.basic.sender} has been added to the allow list.`,
    })
    removeDetection(Number(params.id))
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

    blockSender(emailData.basic.sender, actionReason, "John Doe")
    toast({
      title: "Sender Blocked",
      description: `${emailData.basic.sender} has been added to the block list.`,
    })
    removeDetection(Number(params.id))
    setIsBlockDialogOpen(false)
    setActionReason("")
    router.push("/admin/allow-block-list")
  }

  const handlePushConfirm = () => {
    if (params.id) {
      pushDetection(Number(params.id), "John Doe") // Replace "John Doe" with the actual user name
      toast({
        title: "Investigation Pushed",
        description: "The investigation has been moved to Pushed Requests.",
      })
      router.push("/admin/pushed-requests") // Update the route to include /admin prefix
    }
  }

  const handleSandboxOpen = (attachmentName: string) => {
    setSelectedAttachment(attachmentName)
    setIsSandboxDialogOpen(true)
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

    // Simulate AI analysis
    setTimeout(() => {
      setLinkAnalysis(
        `Analysis of ${url}:\n\n` +
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

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader username="John Doe" onSignOut={handleSignOut} />
      <main className="p-4">
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
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
                    </div>
                  </TabsContent>

                  <TabsContent value="technical" className="mt-6">
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
                                  <Button variant="ghost" size="sm" onClick={() => handleSandboxOpen(attachment.name)}>
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
      </main>

      {/* Push Dialog */}
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

      {/* Allow Sender Dialog */}
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

      {/* Block Sender Dialog */}
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

