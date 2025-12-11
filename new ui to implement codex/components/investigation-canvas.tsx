"use client"

import { useState } from "react"
import {
  AlertTriangle,
  Shield,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertCircle,
  Link,
  ChevronDown,
  ChevronUp,
  X,
  Maximize2,
  Minimize2,
  Share2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { GraphVisualization } from "./graph-visualization"

interface InvestigationCanvasProps {
  showGraph: boolean
  onCloseGraph: () => void
  activeQuery: string | null
}

const threatSummary = {
  riskLevel: "high",
  description:
    "This email is highly likely to be a phishing attempt targeting financial credentials. The sender is impersonating Bank of America using a typosquatted domain (bank0famerica.com). The email contains urgency tactics, suspicious URLs, and a malicious PDF attachment.",
  indicators: [
    { type: "url", value: "bank0famerica-verify.suspicious-domain.com", risk: "high" },
    { type: "domain", value: "bank0famerica.com (typosquat)", risk: "high" },
    { type: "attachment", value: "Account_Verification.pdf (malware)", risk: "high" },
    { type: "keyword", value: "Urgency/fear tactics", risk: "medium" },
  ],
}

const securitySignals = [
  { name: "ML Phishing Detection", status: "flagged", confidence: 94 },
  { name: "Signature Engine", status: "flagged", confidence: 87 },
  { name: "DMARC", status: "fail", detail: "No policy" },
  { name: "SPF", status: "fail", detail: "Soft fail" },
  { name: "DKIM", status: "pass", detail: "Valid signature" },
  { name: "Sandbox Analysis", status: "flagged", detail: "Malicious PDF" },
]

const timeline = [
  { event: "Email Received", time: "14:32:18", status: "complete" },
  { event: "Content Parsed", time: "14:32:19", status: "complete" },
  { event: "ML Analysis", time: "14:32:21", status: "complete" },
  { event: "Threat Flagged", time: "14:32:22", status: "complete" },
  { event: "Analyst Review", time: "14:35:00", status: "active" },
  { event: "Resolution", time: "-", status: "pending" },
]

function ThreatOverviewCard() {
  const [expanded, setExpanded] = useState(true)

  return (
    <Card className="glass-card border-border/50 glow-teal">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-danger" />
            <CardTitle className="text-sm font-medium">Threat Overview</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-danger/20 text-danger border-danger/30">High Risk</Badge>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{threatSummary.description}</p>

          {/* Suspicious Indicators */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">Suspicious Indicators</p>
            <div className="grid grid-cols-2 gap-2">
              {threatSummary.indicators.map((indicator, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg text-xs",
                    indicator.risk === "high" ? "bg-danger/10" : "bg-warning/10",
                  )}
                >
                  <Link
                    className={cn("w-3 h-3 shrink-0", indicator.risk === "high" ? "text-danger" : "text-warning")}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-muted-foreground capitalize text-[10px]">{indicator.type}</span>
                    <p className="text-foreground font-mono truncate text-[11px]">{indicator.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Security Signals - merged into this card */}
          <div className="space-y-2 pt-2 border-t border-border/50">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-electric-blue" />
              <p className="text-xs font-medium text-foreground">Security Signals</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {securitySignals.map((signal, index) => (
                <div key={index} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30">
                  {signal.status === "pass" ? (
                    <CheckCircle className="w-3 h-3 text-cyber-green shrink-0" />
                  ) : signal.status === "fail" ? (
                    <XCircle className="w-3 h-3 text-danger shrink-0" />
                  ) : (
                    <AlertCircle className="w-3 h-3 text-warning shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-foreground truncate">{signal.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {signal.confidence ? `${signal.confidence}%` : signal.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

export function InvestigationCanvas({ showGraph, onCloseGraph, activeQuery }: InvestigationCanvasProps) {
  const [graphExpanded, setGraphExpanded] = useState(false)

  if (showGraph) {
    return (
      <div className={cn("p-4 h-full flex flex-col", graphExpanded && "fixed inset-0 z-50 bg-background")}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-teal" />
            <h2 className="font-semibold text-foreground">Relationship Graph</h2>
            {activeQuery && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                Query: {activeQuery}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="gap-2">
              <Share2 className="w-4 h-4" />
              Export
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setGraphExpanded(!graphExpanded)}>
              {graphExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={onCloseGraph}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <Card className="glass-card border-border/50 flex-1 overflow-hidden">
          <GraphVisualization />
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 h-full flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-teal" />
        <h2 className="font-semibold text-foreground">Investigation Canvas</h2>
      </div>

      {/* Threat Overview - compact at top */}
      <ThreatOverviewCard />

      {/* Graph Visualization Area - takes remaining space */}
      <Card className="glass-card border-border/50 flex-1 flex flex-col overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-electric-blue" />
              <CardTitle className="text-sm font-medium">Graph Visualization</CardTitle>
            </div>
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Neo4j Ready
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <TrendingUp className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-sm font-medium mb-1">Graph Canvas</p>
            <p className="text-xs max-w-[300px]">
              Use the AI Assistant to query relationships and visualize connections between senders, recipients, and
              campaigns.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
