"use client"

import { Sparkles, Mail, Shield, Lightbulb } from "lucide-react"
import { Button } from "@/components/ui/button"
import { motion } from "framer-motion"

export function CopilotShortcuts() {
  const shortcuts = [
    { id: "summarize", label: "Summarize Email", icon: Mail, prompt: "Provide a summary of the current email investigation" },
    { id: "analyze-threat", label: "Analyze Threat", icon: Shield, prompt: "Analyze the threat level and key indicators" },
    { id: "suggest-action", label: "Suggest Action", icon: Lightbulb, prompt: "What actions should I take for this investigation?" },
  ]

  const handlePrompt = (shortcut: typeof shortcuts[0]) => {
    // Dispatch window event for copilot to handle
    window.dispatchEvent(new CustomEvent("copilot:prompt", { 
      detail: { 
        id: shortcut.id,
        prompt: shortcut.prompt 
      } 
    }))
    
    // Also try to find and focus copilot input
    const copilotInput = document.querySelector('[data-copilot-chat-input]') as HTMLTextAreaElement
    if (copilotInput) {
      copilotInput.value = shortcut.prompt
      copilotInput.focus()
      // Trigger input event to update state
      copilotInput.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2">
        <Sparkles className="w-4 h-4 text-purple-400" />
        <h3 className="text-white font-medium text-sm">Copilot</h3>
      </div>

      <div className="space-y-1">
        {shortcuts.map((shortcut, index) => {
          const Icon = shortcut.icon
          return (
            <motion.div
              key={shortcut.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePrompt(shortcut)}
                className="h-8 w-full justify-start text-xs text-gray-300 hover:text-white hover:bg-[#1f1f1f] transition-all duration-200 hover:translate-x-1"
              >
                <Icon className="w-3.5 h-3.5 mr-2" />
                {shortcut.label}
              </Button>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
