"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Lightbulb, MessageSquareText } from "lucide-react"

const prompts = [
  { id: "summarize", label: "Summarize this page", tip: "Creates a short overview" },
  { id: "explain-score", label: "Explain threat score", tip: "Why an item is high risk" },
  { id: "next", label: "Recommend next steps", tip: "Action checklist" },
]

export function CopilotShortcuts() {
  const run = (id: string) => {
    // Placeholder: fire a custom event that your Copilot can listen for
    const ev = new CustomEvent("copilot:prompt", { detail: { id } })
    window.dispatchEvent(ev)
  }

  return (
    <Card className="bg-[#0f0f0f] border-[#1f1f1f]">
      <CardHeader>
        <CardTitle className="text-white text-sm flex items-center gap-2">
          <Lightbulb className="w-4 h-4" /> Copilot Shortcuts
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2">
        {prompts.map(p => (
          <Button key={p.id} className="justify-start bg-[#1f1f1f] hover:bg-[#2a2a2a]" onClick={() => run(p.id)}>
            <MessageSquareText className="w-4 h-4 mr-2" /> {p.label}
          </Button>
        ))}
      </CardContent>
    </Card>
  )
}
