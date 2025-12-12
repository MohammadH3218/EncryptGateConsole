"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle,
  Shield,
  AlertCircle,
  TrendingUp,
  Link,
  FileText,
  ChevronDown,
  ChevronUp,
  Eye,
  Brain,
  Bug,
  Activity,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { EmailDetails, InvestigationSummary } from "./types"

interface InvestigationCanvasProps {
  email: EmailDetails
  investigation?: InvestigationSummary | null
  showGraph: boolean
  onCloseGraph: () => void
  activeQuery: string | null
}

function ThreatScoreGauge({ score, confidence }: { score?: number; confidence?: number }) {
  const displayScore = score || 0
  const displayConfidence = confidence || 0

  const scoreColor = displayScore >= 70 ? "text-red-500" : displayScore >= 45 ? "text-orange-500" : "text-yellow-500"
  const scoreLabel = displayScore >= 70 ? "High Risk" : displayScore >= 45 ? "Medium Risk" : "Low Risk"

  return (
    <div className="flex items-center gap-6">
      <div className="relative w-28 h-28">
        <svg className="transform -rotate-90 w-28 h-28">
          <circle
            cx="56"
            cy="56"
            r="48"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            className="text-border/30"
          />
          <circle
            cx="56"
            cy="56"
            r="48"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            strokeDasharray={`${(displayScore / 100) * 301.6} 301.6`}
            className={scoreColor}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-3xl font-bold", scoreColor)}>{displayScore}</span>
          <span className="text-xs text-muted-foreground">threat score</span>
        </div>
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <Shield className={cn("w-5 h-5", scoreColor)} />
          <span className={cn("font-semibold text-lg", scoreColor)}>{scoreLabel}</span>
        </div>
        <div className="text-sm text-muted-foreground mb-1">
          Confidence: <span className="text-foreground font-medium">{displayConfidence}%</span>
        </div>
        <div className="text-sm text-muted-foreground">
          Multi-agent AI analysis
        </div>
      </div>
    </div>
  )
}

export function InvestigationCanvas({ email, investigation }: InvestigationCanvasProps) {
  const [showFullAnalysis, setShowFullAnalysis] = useState(true)

  // Extract detection data
  const threatScore = email.threatScore || 0
  const confidence = email.threatConfidence || email.confidence || 0
  const threatLevel = email.threatLevel || "none"
  const isPhishing = email.isPhishing || false
  const isMalware = email.isMalware || false
  const distilbertScore = email.distilbert_score !== undefined ? (email.distilbert_score * 100).toFixed(1) : "N/A"
  const vtScore = email.vt_score !== undefined ? (email.vt_score * 100).toFixed(1) : "N/A"
  const contextScore = email.context_score !== undefined ? (email.context_score * 100).toFixed(1) : "N/A"
  const vtVerdict = email.vt_verdict || "UNKNOWN"

  // Parse indicators and recommendations
  const indicators = useMemo(() => {
    try {
      return typeof email.threatIndicators === 'string'
        ? JSON.parse(email.threatIndicators)
        : email.threatIndicators || []
    } catch {
      return []
    }
  }, [email.threatIndicators])

  const recommendations = useMemo(() => {
    try {
      if (investigation?.recommendations) {
        return typeof investigation.recommendations === 'string'
          ? JSON.parse(investigation.recommendations)
          : investigation.recommendations
      }
      return []
    } catch {
      return []
    }
  }, [investigation?.recommendations])

  const threatReasoning = email.threatReasoning || investigation?.description || "No detailed analysis available."

  // Extract URLs
  const urls = useMemo(() => {
    if (Array.isArray(email.urls)) return email.urls
    if (typeof email.urls === 'string') return email.urls.split(',').map(u => u.trim())
    return []
  }, [email.urls])

  return (
    <div className="h-full overflow-y-auto bg-background p-6 space-y-6">
      {/* Threat Overview */}
      <Card className="glass-card border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-foreground">Threat Overview</CardTitle>
            <Badge className={cn(
              "text-xs",
              threatLevel === "critical" || threatLevel === "high"
                ? "bg-red-500/10 text-red-500 border-red-500/30"
                : threatLevel === "medium"
                ? "bg-orange-500/10 text-orange-500 border-orange-500/30"
                : "bg-green-500/10 text-green-500 border-green-500/30"
            )}>
              {threatLevel.toUpperCase()} RISK
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <ThreatScoreGauge score={threatScore} confidence={confidence} />

          {/* Security Signals */}
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground font-medium">Security Signals</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Phishing Detection</span>
                  {isPhishing ? (
                    <Badge className="bg-red-500/10 text-red-500 border-red-500/30 text-xs">
                      Detected
                    </Badge>
                  ) : (
                    <Badge className="bg-green-500/10 text-green-500 border-green-500/30 text-xs">
                      Clean
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-foreground/70">
                  {isPhishing ? "Phishing attempt identified" : "No phishing indicators"}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Malware Scan</span>
                  {vtVerdict === "MALICIOUS" ? (
                    <Badge className="bg-red-500/10 text-red-500 border-red-500/30 text-xs">
                      MALICIOUS
                    </Badge>
                  ) : vtVerdict === "SUSPICIOUS" ? (
                    <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/30 text-xs">
                      SUSPICIOUS
                    </Badge>
                  ) : (
                    <Badge className="bg-green-500/10 text-green-500 border-green-500/30 text-xs">
                      Clean
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-foreground/70">
                  VirusTotal: {vtVerdict}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">DistilBERT Score</span>
                  <span className="text-sm text-foreground font-medium">{distilbertScore}%</span>
                </div>
                <div className="text-xs text-foreground/70">
                  AI phishing classifier
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Context Score</span>
                  <span className="text-sm text-foreground font-medium">{contextScore}%</span>
                </div>
                <div className="text-xs text-foreground/70">
                  Graph analysis score
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Threat Analysis */}
      <Card className="glass-card border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-foreground/70" />
              <CardTitle className="text-foreground">AI Threat Analysis</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFullAnalysis(!showFullAnalysis)}
              className="text-muted-foreground hover:text-foreground"
            >
              {showFullAnalysis ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </CardHeader>
        {showFullAnalysis && (
          <CardContent>
            <div className="bg-muted/20 border border-border/50 rounded-lg p-4">
              <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                {threatReasoning}
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Threat Indicators */}
      {indicators.length > 0 && (
        <Card className="glass-card border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-foreground/70" />
                <CardTitle className="text-foreground">Threat Indicators</CardTitle>
              </div>
              <Badge variant="outline" className="text-foreground/70 border-border/50">
                {indicators.length} found
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {indicators.map((indicator: string, idx: number) => (
                <li key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-border/50">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <span className="text-sm text-foreground/90">{indicator}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Recommended Actions */}
      {recommendations.length > 0 && (
        <Card className="glass-card border-border/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-foreground/70" />
              <CardTitle className="text-foreground">Recommended Actions</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {recommendations.map((rec: string, idx: number) => (
                <li key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-border/50">
                  <CheckCircle className="w-4 h-4 text-foreground/50 mt-0.5 shrink-0" />
                  <span className="text-sm text-foreground/90">{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* URLs Found */}
      {urls.length > 0 && (
        <Card className="glass-card border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link className="w-5 h-5 text-foreground/70" />
                <CardTitle className="text-foreground">URLs Found</CardTitle>
              </div>
              <Badge variant="outline" className="text-foreground/70 border-border/50">
                {urls.length} URL{urls.length > 1 ? 's' : ''}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {urls.map((url: string, idx: number) => (
                <li key={idx} className="p-3 rounded-lg bg-muted/20 border border-border/50 font-mono text-xs text-foreground/80 break-all">
                  {url}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Message Content */}
      <Card className="glass-card border-border/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-foreground/70" />
            <CardTitle className="text-foreground">Message Content</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/20 border border-border/50 rounded-lg overflow-hidden">
            {email.bodyHtml ? (
              <iframe
                srcDoc={email.bodyHtml}
                className="w-full h-[400px] bg-white"
                title="Email HTML Content"
                sandbox="allow-same-origin"
              />
            ) : (
              <pre className="text-sm text-foreground/80 p-4 overflow-x-auto whitespace-pre-wrap">
                {email.body || "No content"}
              </pre>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
