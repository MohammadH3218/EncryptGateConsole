"use client"

import { CommandCenter } from "@/components/command-center/command-center"

export function RightRail() {
  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      <div className="mb-4 px-1 text-sm font-semibold uppercase tracking-wide text-white/70">
        Command Center
      </div>
      <CommandCenter />
    </div>
  )
}
