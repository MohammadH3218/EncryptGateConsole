"use client"

import { ChevronRight, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export function TopNavigation() {
  return (
    <header className="h-14 glass border-b border-border/50 flex items-center justify-between px-4 sticky top-0 z-50">
      {/* Left - Logo & Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <span className="hover:text-foreground cursor-pointer transition-smooth">Investigations</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-foreground">Suspicious Phishing Attempt #4892</span>
      </div>

      {/* Center - Status Tags */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="bg-cyber-green/10 text-cyber-green border-cyber-green/30">
          Active
        </Badge>
        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
          Medium Priority
        </Badge>
        <Badge variant="outline" className="bg-electric-blue/10 text-electric-blue border-electric-blue/30">
          Inbound
        </Badge>
      </div>

      {/* Right - Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="bg-gradient-to-r from-teal to-electric-blue text-primary-foreground gap-2 hover:opacity-90"
        >
          <Send className="w-4 h-4" />
          Submit Investigation
        </Button>
      </div>
    </header>
  )
}
