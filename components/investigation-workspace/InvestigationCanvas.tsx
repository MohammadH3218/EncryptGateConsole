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
  ExternalLink,
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

  const scoreColor = displayScore >= 70 ? "text-red-400" : displayScore >= 45 ? "text-orange-400" : "text-yellow-400"
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
            className="text-white/10"
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
          <span className="text-xs text-gray-400">threat score</span>
        </div>
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <Shield className={cn("w-5 h-5", scoreColor)} />
          <span className={cn("font-semibold text-lg", scoreColor)}>{scoreLabel}</span>
        </div>
        <div className="text-sm text-gray-400 mb-1">
          Confidence: <span className="text-white font-medium">{displayConfidence}%</span>
        </div>
        <div className="text-sm text-gray-400">
          Multi-agent AI analysis
        </div>
      </div>
    </div>
  )
}

export function InvestigationCanvas({ email, investigation }: InvestigationCanvasProps) {
  const [showFullAnalysis, setShowFullAnalysis] = useState(true)

  // Extract detection data
  const distilbertScore = email.distilbert_score !== undefined ? (email.distilbert_score * 100).toFixed(1) : "N/A"
  const vtScore = email.vt_score !== undefined ? (email.vt_score * 100).toFixed(1) : "N/A"
  const contextScore = email.context_score !== undefined ? (email.context_score * 100).toFixed(1) : "N/A"

  // Calculate threat score - check multiple possible field names (same as copilot)
  // Priority: threatScore > final_score > riskScore > distilbert_score
  let calculatedThreatScore = email.threatScore || 
                               (email as any).final_score || 
                               (email as any).riskScore || 
                               0
  if (calculatedThreatScore === 0 && email.distilbert_score !== undefined) {
    // If no threat score but we have distilbert score, use it as fallback
    calculatedThreatScore = Math.round(email.distilbert_score * 100)
  }
  const threatScore = calculatedThreatScore

  const confidence = email.threatConfidence || email.confidence || 0

  // Determine threat level based on actual scores
  let calculatedThreatLevel = email.threatLevel || "none"
  if (calculatedThreatLevel === "none" && threatScore > 0) {
    if (threatScore >= 70) calculatedThreatLevel = "high"
    else if (threatScore >= 45) calculatedThreatLevel = "medium"
    else calculatedThreatLevel = "low"
  }
  const threatLevel = calculatedThreatLevel

  const isPhishing = email.isPhishing || false
  const isMalware = email.isMalware || false
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
    <div className="space-y-4">
      {/* Threat Overview */}
      <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white">Threat Overview</CardTitle>
            <Badge className={cn(
              "text-xs",
              threatLevel === "critical" || threatLevel === "high"
                ? "bg-red-600"
                : threatLevel === "medium"
                ? "bg-amber-600 text-white"
                : "border-green-500 text-green-500"
            )} variant={threatLevel === "critical" || threatLevel === "high" || threatLevel === "medium" ? "destructive" : "outline"}>
              {threatLevel.toUpperCase()} RISK
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <ThreatScoreGauge score={threatScore} confidence={confidence} />

          {/* Security Signals */}
          <div className="space-y-3">
            <p className="text-xs text-gray-400 font-medium">Security Signals</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Phishing Detection</span>
                  {isPhishing ? (
                    <Badge variant="destructive" className="bg-red-600 text-xs">
                      Detected
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-green-500 text-green-500 text-xs">
                      Clean
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-gray-300">
                  {isPhishing ? "Phishing attempt identified" : "No phishing indicators"}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Malware Scan</span>
                  {vtVerdict === "MALICIOUS" ? (
                    <Badge variant="destructive" className="bg-red-600 text-xs">
                      MALICIOUS
                    </Badge>
                  ) : vtVerdict === "SUSPICIOUS" ? (
                    <Badge variant="destructive" className="bg-amber-600 text-white text-xs">
                      SUSPICIOUS
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-green-500 text-green-500 text-xs">
                      Clean
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-gray-300">
                  VirusTotal: {vtVerdict}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">DistilBERT Score</span>
                  <span className="text-sm text-white font-medium">{distilbertScore}%</span>
                </div>
                <div className="text-xs text-gray-300">
                  AI phishing classifier
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Context Score</span>
                  <span className="text-sm text-white font-medium">{contextScore}%</span>
                </div>
                <div className="text-xs text-gray-300">
                  Graph analysis score
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Threat Analysis */}
      <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-gray-400" />
              <CardTitle className="text-white">AI Threat Analysis</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFullAnalysis(!showFullAnalysis)}
              className="text-gray-400 hover:text-white hover:bg-[#2a2a2a]"
            >
              {showFullAnalysis ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </CardHeader>
        {showFullAnalysis && (
          <CardContent>
            <div className="bg-[#1f1f1f] border border-white/10 rounded-lg p-4">
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                {threatReasoning}
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Threat Indicators */}
      {indicators.length > 0 && (
        <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-gray-400" />
                <CardTitle className="text-white">Threat Indicators</CardTitle>
              </div>
              <Badge variant="outline" className="text-gray-400 border-white/10">
                {indicators.length} found
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {indicators.map((indicator: string, idx: number) => (
                <li key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-[#1f1f1f] border border-white/10">
                  <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <span className="text-sm text-gray-300">{indicator}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Recommended Actions */}
      {recommendations.length > 0 && (
        <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-gray-400" />
              <CardTitle className="text-white">Recommended Actions</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {recommendations.map((rec: string, idx: number) => (
                <li key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-[#1f1f1f] border border-white/10">
                  <CheckCircle className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <span className="text-sm text-gray-300">{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* URLs Found */}
      {urls.length > 0 && (
        <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link className="w-5 h-5 text-gray-400" />
                <CardTitle className="text-white">URLs Found</CardTitle>
              </div>
              <Badge variant="outline" className="text-gray-400 border-white/10">
                {urls.length} URL{urls.length > 1 ? 's' : ''}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {urls.map((url: string, idx: number) => (
                <li key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#1f1f1f] border border-white/10">
                  <span className="font-mono text-xs text-gray-300 break-all flex-1">{url}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs bg-blue-600/10 border-blue-500/30 text-blue-400 hover:bg-blue-600/20 hover:border-blue-500/50 shrink-0"
                  >
                    <ExternalLink className="w-3 h-3 mr-1.5" />
                    Open in Playground
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Message Content */}
      <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-400" />
            <CardTitle className="text-white">Message Content</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-[#1f1f1f] border border-white/10 rounded-lg overflow-hidden">
            {email.bodyHtml ? (
              <iframe
                srcDoc={email.bodyHtml}
                className="w-full h-[400px] bg-white"
                title="Email HTML Content"
                sandbox="allow-same-origin"
              />
            ) : (
              <pre className="text-sm text-gray-300 p-4 overflow-x-auto whitespace-pre-wrap">
                {email.body || "No content"}
              </pre>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
