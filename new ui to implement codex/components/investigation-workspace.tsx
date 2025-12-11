"use client"

import { useState } from "react"
import { TopNavigation } from "./top-navigation"
import { EmailSummaryPanel } from "./email-summary-panel"
import { InvestigationCanvas } from "./investigation-canvas"
import { AIAssistantPanel } from "./ai-assistant-panel"

export function InvestigationWorkspace() {
  const [showGraph, setShowGraph] = useState(false)
  const [activeQuery, setActiveQuery] = useState<string | null>(null)

  const handleAssistantQuery = (query: string) => {
    const graphTriggers = ["sender", "recipient", "emails", "campaign", "graph", "relationship"]
    const shouldShowGraph = graphTriggers.some((trigger) => query.toLowerCase().includes(trigger))

    if (shouldShowGraph) {
      setShowGraph(true)
      setActiveQuery(query)
    }
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <TopNavigation />

      <div className="flex-1 h-0 flex">
        {/* Left Column - Email Summary Panel (25%) - reduced width */}
        <div className="w-[25%] min-w-[300px] border-r border-border/50 overflow-y-auto">
          <EmailSummaryPanel />
        </div>

        {/* Center Column - Investigation Canvas (55%) - increased width */}
        <div className="flex-1 overflow-hidden">
          <InvestigationCanvas
            showGraph={showGraph}
            onCloseGraph={() => setShowGraph(false)}
            activeQuery={activeQuery}
          />
        </div>

        {/* Right Column - AI Assistant (20%) */}
        <div className="w-[20%] min-w-[280px] border-l border-border/50 overflow-hidden">
          <AIAssistantPanel onQuery={handleAssistantQuery} />
        </div>
      </div>
    </div>
  )
}
