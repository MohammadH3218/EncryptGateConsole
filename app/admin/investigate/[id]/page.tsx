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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  ArrowLeft,
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
  Send,
  Flag,
  FlagOff,
  RefreshCw,
  Activity,
  Target,
  Search,
  Copy,
  History,
  AlertCircle
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
  urls: string[]
  flaggedCategory?: "none" | "ai" | "manual" | "clean"
  flaggedSeverity?: "critical" | "high" | "medium" | "low"
  detectionId?: string
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

interface Investigation {
  investigationId: string
  emailMessageId: string
  detectionId?: string
  investigatorName: string
  status: 'new' | 'in_progress' | 'resolved' | 'closed'
  progress: number
  priority: 'low' | 'medium' | 'high' | 'critical'
  findings: string
  recommendations: string
  notes: string
  timeline: Array<{
    timestamp: string
    action: string
    description: string
    user: string
  }>
  createdAt: string
  updatedAt: string
  assignedAt?: string
  completedAt?: string
}

export default function InvestigationPage() {
  const params = useParams()
  const router = useRouter()
  const emailId = params.id as string
  
  const [emailDetails, setEmailDetails] = useState<EmailDetails | null>(null)
  const [detectionDetails, setDetectionDetails] = useState<DetectionDetails | null>(null)
  const [investigation, setInvestigation] = useState<Investigation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  
  // Form states
  const [notes, setNotes] = useState("")
  const [findings, setFindings] = useState("")
  const [recommendations, setRecommendations] = useState("")
  const [investigationStatus, setInvestigationStatus] = useState<'new' | 'in_progress' | 'resolved' | 'closed'>('new')
  const [progress, setProgress] = useState(0)
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  
  // Action states
  const [saving, setSaving] = useState(false)
  const [flaggingEmail, setFlaggingEmail] = useState(false)
  const [unflaggingEmail, setUnflaggingEmail] = useState(false)

  useEffect(() => {
    loadInvestigationData()
  }, [emailId])

  // Clear success message after some time
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  // Update form states when investigation loads
  useEffect(() => {
    if (investigation) {
      setNotes(investigation.notes)
      setFindings(investigation.findings)
      setRecommendations(investigation.recommendations)
      setInvestigationStatus(investigation.status)
      setProgress(investigation.progress)
      setPriority(investigation.priority)
    }
  }, [investigation])

  const loadInvestigationData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      console.log('🔍 Loading investigation data for emailId:', emailId)
      
      // Load email data
      const emailsResponse = await fetch('/api/email?limit=1000')
      if (!emailsResponse.ok) {
        throw new Error('Failed to fetch emails')
      }
      
      const emailsData = await emailsResponse.json()
      const emails = emailsData.emails || []
      
      const foundEmail = emails.find((email: any) => 
        email.messageId === emailId || email.id === emailId
      )
      
      if (foundEmail) {
        console.log('✅ Found email data:', foundEmail)
        
        const emailDetails: EmailDetails = {
          messageId: foundEmail.messageId || foundEmail.id,
          subject: foundEmail.subject || 'No Subject',
          sender: foundEmail.sender || '',
          recipients: foundEmail.recipients || [],
          timestamp: foundEmail.timestamp || new Date().toISOString(),
          body: foundEmail.body || 'No message content available',
          bodyHtml: foundEmail.bodyHtml,
          status: foundEmail.status || 'received',
          threatLevel: foundEmail.threatLevel || 'none',
          isPhishing: foundEmail.isPhishing || false,
          attachments: foundEmail.attachments || [],
          headers: foundEmail.headers || {},
          direction: foundEmail.direction || 'inbound',
          size: foundEmail.size || 0,
          urls: foundEmail.urls || [],
          flaggedCategory: foundEmail.flaggedCategory || 'none',
          flaggedSeverity: foundEmail.flaggedSeverity,
          detectionId: foundEmail.detectionId
        }
        
        setEmailDetails(emailDetails)
        
        // Load detection details if exists
        if (foundEmail.detectionId) {
          try {
            const detectionResponse = await fetch(`/api/detections/${foundEmail.detectionId}`)
            if (detectionResponse.ok) {
              const detectionData = await detectionResponse.json()
              setDetectionDetails(detectionData)
            }
          } catch (detectionErr) {
            console.warn('⚠️ Could not load detection details:', detectionErr)
          }
        }

        // Load or create investigation
        try {
          const investigationResponse = await fetch(`/api/investigations/${emailId}`)
          if (investigationResponse.ok) {
            const investigationData = await investigationResponse.json()
            setInvestigation(investigationData)
            console.log('✅ Found existing investigation:', investigationData)
          } else {
            // Create new investigation
            console.log('📝 Creating new investigation for email:', emailId)
            const createResponse = await fetch('/api/investigations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                emailMessageId: emailDetails.messageId,
                detectionId: foundEmail.detectionId,
                investigatorName: 'John Doe', // TODO: Get from auth
                priority: 'medium'
              })
            })
            
            if (createResponse.ok) {
              const newInvestigation = await createResponse.json()
              setInvestigation(newInvestigation)
              console.log('✅ Created new investigation:', newInvestigation)
            }
          }
        } catch (invErr) {
          console.warn('⚠️ Could not load/create investigation:', invErr)
        }
        
      } else {
        throw new Error('Email not found')
      }
      
    } catch (err: any) {
      console.error('❌ Failed to load investigation data:', err)
      setError(`Failed to load investigation details: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const saveInvestigation = async () => {
    if (!investigation) return
    
    setSaving(true)
    setError(null)
    
    try {
      console.log('💾 Saving investigation updates...')
      
      const updatePayload = {
        status: investigationStatus,
        progress,
        notes,
        findings,
        recommendations,
        investigatorName: 'John Doe' // TODO: Get from auth
      }
      
      const response = await fetch(`/api/investigations/${investigation.investigationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
      })
      
      if (!response.ok) {
        throw new Error('Failed to save investigation')
      }
      
      const updatedInvestigation = await response.json()
      setInvestigation(updatedInvestigation)
      setSuccessMessage('Investigation saved successfully!')
      
      console.log('✅ Investigation saved:', updatedInvestigation)
      
    } catch (err: any) {
      console.error('❌ Failed to save investigation:', err)
      setError(`Failed to save investigation: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (newStatus: typeof investigationStatus) => {
    setInvestigationStatus(newStatus)
    
    // Auto-update progress based on status
    let newProgress = progress
    if (newStatus === 'in_progress' && progress === 0) {
      newProgress = 25
      setProgress(25)
    } else if (newStatus === 'resolved') {
      newProgress = 100
      setProgress(100)
    }
    
    // Auto-save
    if (investigation) {
      try {
        const response = await fetch(`/api/investigations/${investigation.investigationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: newStatus,
            progress: newProgress,
            investigatorName: 'John Doe'
          })
        })
        
        if (response.ok) {
          const updated = await response.json()
          setInvestigation(updated)
          setSuccessMessage(`Status updated to ${newStatus}`)
        }
      } catch (err) {
        console.error('Failed to update status:', err)
      }
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'new':
        return <AlertCircle className="h-4 w-4 text-red-400" />
      case 'in_progress':
        return <Activity className="h-4 w-4 text-yellow-400" />
      case 'resolved':
        return <CheckCircle className="h-4 w-4 text-green-400" />
      case 'closed':
        return <XCircle className="h-4 w-4 text-gray-400" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'critical':
        return <Badge variant="destructive" className="bg-red-600">Critical</Badge>
      case 'high':
        return <Badge variant="destructive" className="bg-orange-500">High</Badge>
      case 'medium':
        return <Badge variant="secondary" className="bg-yellow-600">Medium</Badge>
      case 'low':
        return <Badge variant="outline" className="border-blue-500 text-blue-400">Low</Badge>
      default:
        return <Badge variant="secondary">{priority}</Badge>
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setSuccessMessage('Copied to clipboard!')
  }

  if (loading) {
    return (
      <AppLayout username="John Doe" notificationsCount={2}>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          <span className="ml-2 text-white">Loading investigation...</span>
        </div>
      </AppLayout>
    )
  }

  if (error || !emailDetails) {
    return (
      <AppLayout username="John Doe" notificationsCount={2}>
        <FadeInSection>
          <Card className="border-red-500/20 bg-[#0f0f0f]">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="h-5 w-5" />
                <p className="text-white">{error || 'Email not found'}</p>
              </div>
              <Button onClick={() => router.back()} className="mt-4 bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]">
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
      <div className="space-y-6">
        {/* Success Message */}
        {successMessage && (
          <Alert className="bg-green-900/20 border-green-500/20">
            <CheckCircle className="h-4 w-4 text-green-400" />
            <AlertTitle className="text-white">Success</AlertTitle>
            <AlertDescription className="text-gray-300">
              {successMessage}
            </AlertDescription>
          </Alert>
        )}

        {/* Error Message */}
        {error && (
          <Alert variant="destructive" className="bg-red-900/20 border-red-500/20">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <AlertTitle className="text-white">Error</AlertTitle>
            <AlertDescription className="text-gray-300">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.back()} className="text-white hover:bg-[#2a2a2a]">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Detections
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">Email Investigation</h1>
              <div className="flex items-center gap-2 mt-2">
                <Badge className={`${riskLevel.color}`}>
                  <RiskIcon className="h-3 w-3 mr-1" />
                  {riskLevel.label}
                </Badge>
                {investigation && getPriorityBadge(investigation.priority)}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={saveInvestigation}
              disabled={saving}
              className="bg-blue-900/20 border-blue-600/30 text-blue-300 hover:bg-blue-900/40"
            >
              {saving ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Investigation
            </Button>
            <Button variant="outline" size="sm" className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]">
              <Share className="h-4 w-4 mr-2" />
              Share
            </Button>
          </div>
        </div>

        {/* Investigation Progress */}
        {investigation && (
          <Card className="bg-[#0f0f0f] border-none text-white">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-white">
                <span className="flex items-center gap-2">
                  {getStatusIcon(investigation.status)}
                  Investigation Progress
                </span>
                <div className="flex gap-2">
                  <Button
                    variant={investigationStatus === 'new' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => updateStatus('new')}
                    className={investigationStatus === 'new' ? 'bg-red-600' : 'bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a]'}
                  >
                    <AlertCircle className="h-4 w-4 mr-2" />
                    New
                  </Button>
                  <Button
                    variant={investigationStatus === 'in_progress' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => updateStatus('in_progress')}
                    className={investigationStatus === 'in_progress' ? 'bg-yellow-600' : 'bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a]'}
                  >
                    <Activity className="h-4 w-4 mr-2" />
                    In Progress
                  </Button>
                  <Button
                    variant={investigationStatus === 'resolved' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => updateStatus('resolved')}
                    className={investigationStatus === 'resolved' ? 'bg-green-600' : 'bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a]'}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Resolved
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">Progress</span>
                    <span className="text-sm text-white">{progress}%</span>
                  </div>
                  <Progress 
                    value={progress} 
                    className="w-full h-2 bg-[#2a2a2a]"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Investigator:</span>
                    <p className="text-white">{investigation.investigatorName}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Created:</span>
                    <p className="text-white">{new Date(investigation.createdAt).toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Last Updated:</span>
                    <p className="text-white">{new Date(investigation.updatedAt).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Investigation Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-6 bg-[#1f1f1f]">
            <TabsTrigger value="overview" className="text-white data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-white">Overview</TabsTrigger>
            <TabsTrigger value="email" className="text-white data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-white">Email Details</TabsTrigger>
            <TabsTrigger value="findings" className="text-white data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-white">Findings</TabsTrigger>
            <TabsTrigger value="notes" className="text-white data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-white">Notes</TabsTrigger>
            <TabsTrigger value="timeline" className="text-white data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-white">Timeline</TabsTrigger>
            <TabsTrigger value="technical" className="text-white data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-white">Technical</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-[#0f0f0f] border-none text-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Mail className="h-5 w-5" />
                    Email Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-400">From</label>
                    <p className="font-mono text-sm text-white break-all">{emailDetails.sender}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-400">To</label>
                    <p className="font-mono text-sm text-white break-all">{emailDetails.recipients.join(', ')}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-400">Subject</label>
                    <p className="font-medium text-white break-words">{emailDetails.subject}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-400">Received</label>
                    <p className="text-sm text-white">{new Date(emailDetails.timestamp).toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>

              {detectionDetails && (
                <Card className="bg-[#0f0f0f] border-none text-white">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-white">
                      <Shield className="h-5 w-5" />
                      Detection Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-400">Detection</label>
                      <p className="font-medium text-white">{detectionDetails.name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-400">Threat Score</label>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-24 h-2 bg-[#2a2a2a] rounded-full">
                          <div 
                            className={`h-2 rounded-full ${
                              detectionDetails.threatScore >= 80 ? 'bg-red-500' :
                              detectionDetails.threatScore >= 60 ? 'bg-orange-500' :
                              detectionDetails.threatScore >= 40 ? 'bg-yellow-500' :
                              'bg-green-500'
                            }`}
                            style={{ width: `${detectionDetails.threatScore}%` }}
                          />
                        </div>
                        <span className="text-sm text-white">{detectionDetails.threatScore}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-400">Confidence</label>
                      <p className="text-sm text-white">{detectionDetails.confidence}%</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Email Details Tab */}
          <TabsContent value="email" className="space-y-4">
            <Card className="bg-[#0f0f0f] border-none text-white">
              <CardHeader>
                <CardTitle className="text-white">Message Content</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#2a2a2a]">
                  {emailDetails.body && emailDetails.body.trim().length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <span>Plain Text Content:</span>
                        <Badge variant="outline" className="border-gray-500/30 text-gray-400">TEXT</Badge>
                        <span className="text-xs">({emailDetails.body.length} chars)</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(emailDetails.body)}
                          className="text-gray-400 hover:text-white p-1 ml-auto"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <pre className="text-sm text-white whitespace-pre-wrap font-mono leading-relaxed">
                        {emailDetails.body}
                      </pre>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                      <p className="text-white font-medium">No Message Content Available</p>
                      <p className="text-sm text-gray-400 mt-2">
                        The email body content could not be extracted or is empty.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* URLs and Attachments */}
            {(emailDetails.urls.length > 0 || emailDetails.attachments.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {emailDetails.urls.length > 0 && (
                  <Card className="bg-[#0f0f0f] border-none text-white">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-white">
                        <Link className="h-5 w-5" />
                        URLs Found ({emailDetails.urls.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {emailDetails.urls.map((url, index) => (
                          <div key={index} className="p-3 bg-[#1a1a1a] rounded-lg border border-[#2a2a2a]">
                            <p className="text-sm text-blue-400 font-mono break-all">{url}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {emailDetails.attachments.length > 0 && (
                  <Card className="bg-[#0f0f0f] border-none text-white">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-white">
                        <FileText className="h-5 w-5" />
                        Attachments ({emailDetails.attachments.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {emailDetails.attachments.map((attachment, index) => (
                          <div key={index} className="p-3 bg-[#1a1a1a] rounded-lg border border-[#2a2a2a]">
                            <p className="text-sm text-white font-mono break-all">{attachment}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* Findings Tab */}
          <TabsContent value="findings" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-[#0f0f0f] border-none text-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Search className="h-5 w-5" />
                    Investigation Findings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Document your investigation findings here..."
                    value={findings}
                    onChange={(e) => setFindings(e.target.value)}
                    className="min-h-[200px] bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder:text-gray-400"
                  />
                </CardContent>
              </Card>

              <Card className="bg-[#0f0f0f] border-none text-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Target className="h-5 w-5" />
                    Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Add your recommendations based on the investigation..."
                    value={recommendations}
                    onChange={(e) => setRecommendations(e.target.value)}
                    className="min-h-[200px] bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder:text-gray-400"
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes" className="space-y-4">
            <Card className="bg-[#0f0f0f] border-none text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <FileText className="h-5 w-5" />
                  Investigation Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Add your investigation notes here..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[300px] bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder:text-gray-400"
                />
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-gray-400">
                    {notes.length} characters
                  </p>
                  <Button onClick={saveInvestigation} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                    {saving ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Notes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="space-y-4">
            <Card className="bg-[#0f0f0f] border-none text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <History className="h-5 w-5" />
                  Investigation Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                {investigation?.timeline && investigation.timeline.length > 0 ? (
                  <div className="space-y-4">
                    {investigation.timeline.map((entry, index) => (
                      <div key={index} className="flex gap-3 pb-4 border-b border-[#2a2a2a] last:border-b-0">
                        <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-white">{entry.description}</p>
                            <span className="text-xs text-gray-400">
                              {new Date(entry.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">by {entry.user}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <History className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-white font-medium">No Timeline Entries</p>
                    <p className="text-sm text-gray-400 mt-2">
                      Timeline will be populated as the investigation progresses.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Technical Tab */}
          <TabsContent value="technical" className="space-y-4">
            <Card className="bg-[#0f0f0f] border-none text-white">
              <CardHeader>
                <CardTitle className="text-white">Email Headers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#2a2a2a] font-mono text-sm space-y-2">
                  {Object.keys(emailDetails.headers).length > 0 ? (
                    Object.entries(emailDetails.headers).map(([key, value]) => (
                      <div key={key} className="border-b border-[#2a2a2a] pb-2 last:border-b-0">
                        <span className="text-blue-400">{key}:</span>{' '}
                        <span className="text-white break-all">{value}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-400">No headers available</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  )
}