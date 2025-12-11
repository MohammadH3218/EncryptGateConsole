"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const nodes = [
  { id: "sender", label: "security-alert@bank0famerica.com", type: "sender", risk: "high", x: 400, y: 200 },
  { id: "recipient1", label: "john.doe@company.com", type: "recipient", risk: "low", x: 200, y: 350 },
  { id: "recipient2", label: "finance@company.com", type: "recipient", risk: "low", x: 600, y: 350 },
  { id: "cluster1", label: "Phishing Campaign #127", type: "cluster", risk: "high", x: 400, y: 80 },
  { id: "related1", label: "hr@company.com", type: "recipient", risk: "medium", x: 100, y: 200 },
  { id: "related2", label: "ceo@company.com", type: "recipient", risk: "medium", x: 700, y: 200 },
]

const edges = [
  { from: "sender", to: "recipient1", label: "SENT_TO" },
  { from: "sender", to: "recipient2", label: "SENT_TO" },
  { from: "cluster1", to: "sender", label: "PART_OF" },
  { from: "sender", to: "related1", label: "PREVIOUSLY_SENT" },
  { from: "sender", to: "related2", label: "PREVIOUSLY_SENT" },
]

export function GraphVisualization() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [layout, setLayout] = useState<"force" | "radial" | "tree">("force")
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "high":
        return "#ef4444"
      case "medium":
        return "#f59e0b"
      case "low":
        return "#22c55e"
      default:
        return "#6b7280"
    }
  }

  const getNodeIcon = (type: string) => {
    switch (type) {
      case "sender":
        return "M"
      case "recipient":
        return "R"
      case "cluster":
        return "C"
      default:
        return "?"
    }
  }

  return (
    <div className="w-full h-full min-h-[500px] relative">
      {/* Layout Controls */}
      <div className="absolute top-4 right-4 flex gap-2 z-10">
        {(["force", "radial", "tree"] as const).map((l) => (
          <Button
            key={l}
            variant={layout === l ? "default" : "outline"}
            size="sm"
            onClick={() => setLayout(l)}
            className={cn("text-xs capitalize", layout === l && "bg-teal text-primary-foreground")}
          >
            {l}
          </Button>
        ))}
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 glass p-3 rounded-lg z-10">
        <p className="text-xs font-medium text-foreground mb-2">Legend</p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-danger" />
            <span className="text-xs text-muted-foreground">High Risk</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-warning" />
            <span className="text-xs text-muted-foreground">Medium Risk</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-cyber-green" />
            <span className="text-xs text-muted-foreground">Low Risk</span>
          </div>
        </div>
      </div>

      {/* Query Log */}
      <div className="absolute top-4 left-4 glass p-3 rounded-lg z-10 max-w-[200px]">
        <p className="text-xs font-medium text-foreground mb-2">Query Log</p>
        <div className="space-y-1 text-[10px] text-muted-foreground font-mono">
          <p>MATCH (s:Sender)-[:SENT]-{">"}(r:Recipient)</p>
          <p>WHERE s.email = "security-alert@..."</p>
          <p>RETURN s, r</p>
        </div>
      </div>

      <svg ref={svgRef} className="w-full h-full" viewBox="0 0 800 450">
        {/* Edges */}
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

        {/* Nodes */}
        {nodes.map((node) => (
          <g
            key={node.id}
            className="cursor-pointer transition-transform duration-300"
            onMouseEnter={() => setHoveredNode(node.id)}
            onMouseLeave={() => setHoveredNode(null)}
            style={{
              transform: hoveredNode === node.id ? "scale(1.1)" : "scale(1)",
              transformOrigin: `${node.x}px ${node.y}px`,
            }}
          >
            {/* Glow effect */}
            <circle
              cx={node.x}
              cy={node.y}
              r={hoveredNode === node.id ? 35 : 28}
              fill={getRiskColor(node.risk)}
              opacity={0.2}
              className="transition-all duration-300"
            />

            {/* Node circle */}
            <circle
              cx={node.x}
              cy={node.y}
              r={24}
              fill={`rgba(20, 25, 35, 0.9)`}
              stroke={getRiskColor(node.risk)}
              strokeWidth={3}
              className="transition-all duration-300"
            />

            {/* Node icon */}
            <text
              x={node.x}
              y={node.y + 5}
              fill={getRiskColor(node.risk)}
              fontSize={14}
              fontWeight="bold"
              textAnchor="middle"
            >
              {getNodeIcon(node.type)}
            </text>

            {/* Label */}
            <text
              x={node.x}
              y={node.y + 42}
              fill="rgba(255,255,255,0.8)"
              fontSize={9}
              textAnchor="middle"
              className="font-mono"
            >
              {node.label.length > 25 ? node.label.slice(0, 25) + "..." : node.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
