"use client"

import { useMemo, useState } from "react"
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Link,
  Maximize2,
  Minimize2,
  Shield,
  TrendingUp,
  X,
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

type SignalStatus = "pass" | "flagged" | "info"

interface SecuritySignal {
  name: string
  status: SignalStatus
  detail: string
}

interface GraphNode {
  id: string
  label: string
  type: "sender" | "recipient" | "attachment"
  risk: "high" | "medium" | "low"
  x: number
  y: number
}

interface GraphEdge {
  from: string
  to: string
  label?: string
}

function getRiskFromSeverity(priority?: string, severity?: string): "high" | "medium" | "low" {
  const value = (severity || priority || "").toLowerCase()
  if (value.includes("critical") || value.includes("high")) return "high"
  if (value.includes("medium")) return "medium"
  return "low"
}

function ThreatOverview({ email, investigation }: { email: EmailDetails; investigation?: InvestigationSummary | null }) {
  const [expanded, setExpanded] = useState(true)
  const senderDomain = useMemo(() => email.sender?.split("@")[1] || "", [email.sender])
  const risk = getRiskFromSeverity(investigation?.priority, email.flaggedSeverity)

  const description =
    investigation?.description ||
    `Analysis for "${email.subject || "No subject"}" from ${email.sender || "unknown sender"}.` +
      (email.urls?.length ? ` ${email.urls.length} URL${email.urls.length > 1 ? "s" : ""} detected.` : "") +
      (email.attachments?.length ? ` ${email.attachments.length} attachment${email.attachments.length > 1 ? "s" : ""} found.` : "")

  const indicators = useMemo(() => {
    const items: Array<{ type: string; value: string; risk: "high" | "medium" | "low" }> = []
    if (email.urls?.length) {
      items.push({ type: "URL", value: email.urls[0], risk })
    }
    if (senderDomain) {
      items.push({ type: "Domain", value: senderDomain, risk })
    }
    if (email.attachments?.length) {
      items.push({
        type: "Attachment",
        value: email.attachments[0].filename,
        risk,
      })
    }
    if (email.flaggedCategory) {
      items.push({
        type: "Flag",
        value: email.flaggedCategory + (email.flaggedSeverity ? ` (${email.flaggedSeverity})` : ""),
        risk,
      })
    }
    if (items.length === 0) {
      items.push({ type: "Indicator", value: "No indicators provided", risk: "low" })
    }
    return items
  }, [
    email.attachments?.length,
    email.attachments?.[0]?.filename,
    email.flaggedCategory,
    email.flaggedSeverity,
    email.urls?.[0],
    risk,
    senderDomain,
  ])

  const securitySignals: SecuritySignal[] = useMemo(() => {
    const signals: SecuritySignal[] = [
      {
        name: "Investigation Status",
        status: investigation?.status ? "flagged" : "info",
        detail: investigation?.status || "Not created",
      },
      {
        name: "Priority",
        status: investigation?.priority ? "flagged" : "info",
        detail: investigation?.priority || "Unset",
      },
      {
        name: "Flagged Category",
        status: email.flaggedCategory && email.flaggedCategory !== "none" ? "flagged" : "pass",
        detail: email.flaggedCategory || "None",
      },
      {
        name: "Severity",
        status: email.flaggedSeverity ? "flagged" : "info",
        detail: email.flaggedSeverity || "Not provided",
      },
      {
        name: "Direction",
        status: "info",
        detail: email.direction || "unknown",
      },
      {
        name: "URLs",
        status: email.urls?.length ? "info" : "pass",
        detail: `${email.urls?.length || 0} URL${email.urls && email.urls.length !== 1 ? "s" : ""}`,
      },
      {
        name: "Attachments",
        status: email.attachments?.length ? "info" : "pass",
        detail: `${email.attachments?.length || 0} attachment${email.attachments && email.attachments.length !== 1 ? "s" : ""}`,
      },
    ]
    if (email.threatLevel) {
      signals.push({
        name: "Threat Level",
        status: "flagged",
        detail: email.threatLevel,
      })
    }
    return signals
  }, [email.attachments?.length, email.direction, email.flaggedCategory, email.flaggedSeverity, email.threatLevel, email.urls?.length, investigation?.priority, investigation?.status])

  return (
    <Card className="glass-card border-border/50 glow-teal">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-danger" />
            <CardTitle className="text-sm font-medium">Threat Overview</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-danger/20 text-danger border-danger/30 capitalize">{risk} risk</Badge>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setExpanded((prev) => !prev)}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>

          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">Suspicious Indicators</p>
            <div className="grid grid-cols-2 gap-2">
              {indicators.map((indicator, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg text-xs",
                    indicator.risk === "high" ? "bg-danger/10" : indicator.risk === "medium" ? "bg-warning/10" : "bg-secondary/30",
                  )}
                >
                  <Link
                    className={cn(
                      "w-3 h-3 shrink-0",
                      indicator.risk === "high"
                        ? "text-danger"
                        : indicator.risk === "medium"
                        ? "text-warning"
                        : "text-muted-foreground",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-muted-foreground capitalize text-[10px]">{indicator.type}</span>
                    <p className="text-foreground font-mono truncate text-[11px]">{indicator.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

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
                  ) : signal.status === "flagged" ? (
                    <AlertCircle className="w-3 h-3 text-warning shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-foreground truncate">{signal.name}</p>
                    <p className="text-[10px] text-muted-foreground">{signal.detail}</p>
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

function RelationshipGraph({ sender, recipients, severity }: { sender?: string; recipients: string[]; severity?: string }) {
  if (!sender && recipients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
        <p>No graph data available for this email yet.</p>
        <p className="text-xs text-muted-foreground/80">Ask the assistant to analyze relationships to populate the graph.</p>
      </div>
    )
  }

  const risk = getRiskFromSeverity(undefined, severity)
  const centerX = 400
  const centerY = 220
  const radius = 180

  const nodes: GraphNode[] = []
  if (sender) {
    nodes.push({
      id: "sender",
      label: sender,
      type: "sender",
      risk,
      x: centerX,
      y: centerY,
    })
  }

  const edges: GraphEdge[] = []
  const total = Math.max(recipients.length, 1)
  recipients.forEach((recipient, index) => {
    const angle = (index / total) * Math.PI * 2
    const x = centerX + radius * Math.cos(angle)
    const y = centerY + radius * Math.sin(angle)
    const nodeId = `recipient-${index}`
    nodes.push({
      id: nodeId,
      label: recipient,
      type: "recipient",
      risk: "low",
      x,
      y,
    })
    if (sender) {
      edges.push({ from: "sender", to: nodeId, label: "sent to" })
    }
  })

  const getRiskColor = (value: "high" | "medium" | "low") => {
    if (value === "high") return "#ef4444"
    if (value === "medium") return "#f59e0b"
    return "#22c55e"
  }

  const getNodeIcon = (type: GraphNode["type"]) => {
    if (type === "sender") return "S"
    if (type === "attachment") return "A"
    return "R"
  }

  return (
    <svg className="w-full h-full" viewBox="0 0 800 450">
      {edges.map((edge, index) => {
        const fromNode = nodes.find((n) => n.id === edge.from)
        const toNode = nodes.find((n) => n.id === edge.to)
        if (!fromNode || !toNode) return null
        const midX = (fromNode.x + toNode.x) / 2
        const midY = (fromNode.y + toNode.y) / 2
        return (
          <g key={index}>
            <line
              x1={fromNode.x}
              y1={fromNode.y}
              x2={toNode.x}
              y2={toNode.y}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth={2}
              className="transition-all duration-300"
            />
            <text
              x={midX}
              y={midY - 8}
              fill="rgba(255,255,255,0.4)"
              fontSize={8}
              textAnchor="middle"
              className="font-mono"
            >
              {edge.label}
            </text>
          </g>
        )
      })}

      {nodes.map((node) => (
        <g key={node.id} className="transition-transform duration-300">
          <circle cx={node.x} cy={node.y} r={30} fill="rgba(15,23,42,0.9)" stroke={getRiskColor(node.risk)} strokeWidth={3} />
          <text x={node.x} y={node.y + 5} fill={getRiskColor(node.risk)} fontSize={14} fontWeight="bold" textAnchor="middle">
            {getNodeIcon(node.type)}
          </text>
          <text
            x={node.x}
            y={node.y + 42}
            fill="rgba(255,255,255,0.8)"
            fontSize={9}
            textAnchor="middle"
            className="font-mono"
          >
            {node.label.length > 30 ? `${node.label.slice(0, 30)}...` : node.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

export function InvestigationCanvas({ email, investigation, showGraph, onCloseGraph, activeQuery }: InvestigationCanvasProps) {
  const [graphExpanded, setGraphExpanded] = useState(false)
  const recipients = email.recipients || []

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
            <Button variant="ghost" size="sm" onClick={() => setGraphExpanded((prev) => !prev)}>
              {graphExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={onCloseGraph}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <Card className="glass-card border-border/50 flex-1 overflow-hidden">
          <RelationshipGraph sender={email.sender} recipients={recipients} severity={email.flaggedSeverity || investigation?.priority} />
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

      <ThreatOverview email={email} investigation={investigation} />

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
          <div className="text-center text-muted-foreground max-w-[360px]">
            <TrendingUp className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-sm font-medium mb-1">Graph Canvas</p>
            <p className="text-xs">
              Ask the Investigation Assistant for relationship or campaign analysis to populate this graph. Sender and recipient
              relationships will appear when data is available.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
