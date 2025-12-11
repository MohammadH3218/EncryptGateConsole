"use client"

import { ChevronRight, Send, Shield } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface TopNavigationProps {
  subject?: string
  status?: string
  priority?: string
  direction?: string
  onSubmit?: () => void
}

function getPriorityClasses(priority?: string) {
  if (!priority) return "bg-secondary/40 text-foreground"
  const value = priority.toLowerCase()
  if (value === "critical" || value === "high") {
    return "bg-danger/20 text-danger border-danger/40"
  }
  if (value === "medium") {
    return "bg-warning/10 text-warning border-warning/40"
  }
  return "bg-cyber-green/10 text-cyber-green border-cyber-green/30"
}

export function TopNavigation({ subject, status, priority, direction, onSubmit }: TopNavigationProps) {
  return (
    <header className="h-14 glass border-b border-border/50 flex items-center justify-between px-4 sticky top-0 z-50">
      <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
        <Shield className="w-4 h-4 text-electric-blue" />
        <span className="hover:text-foreground cursor-pointer transition-smooth">Investigations</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-foreground truncate">{subject || "Investigation"}</span>
      </div>

      <div className="flex items-center gap-2">
        {status && (
          <Badge variant="outline" className="bg-cyber-green/10 text-cyber-green border-cyber-green/30">
            {status}
          </Badge>
        )}
        {priority && (
          <Badge variant="outline" className={cn(getPriorityClasses(priority), "capitalize")}>
            {priority} priority
          </Badge>
        )}
        {direction && (
          <Badge variant="outline" className="bg-electric-blue/10 text-electric-blue border-electric-blue/30 capitalize">
            {direction}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="bg-gradient-to-r from-teal to-electric-blue text-primary-foreground gap-2 hover:opacity-90"
          onClick={onSubmit}
        >
          <Send className="w-4 h-4" />
          Submit Investigation
        </Button>
      </div>
    </header>
  )
}
