"use client"

import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

export function CopilotShortcuts() {
  const shortcuts = [
    { id: "summarize", label: "Summarize Email" },
    { id: "analyze-threat", label: "Analyze Threat" },
    { id: "suggest-action", label: "Suggest Action" },
  ]

  const handlePrompt = (id: string) => {
    // Dispatch window event for copilot to handle
    window.dispatchEvent(new CustomEvent("copilot:prompt", { detail: { id } }))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2">
        <Sparkles className="w-4 h-4 text-purple-400" />
        <h3 className="text-white font-medium text-sm">Copilot</h3>
      </div>

      <div className="space-y-1">
        {shortcuts.map((shortcut) => (
          <Button
            key={shortcut.id}
            variant="ghost"
            size="sm"
            onClick={() => handlePrompt(shortcut.id)}
            className="h-7 w-full justify-start text-xs text-gray-300 hover:text-white hover:bg-[#1f1f1f]"
          >
            {shortcut.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
