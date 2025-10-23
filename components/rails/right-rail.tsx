"use client"

import { CommandCenter } from "@/components/command-center/command-center"

export function RightRail() {
  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      <div className="mb-4 px-1 text-sm font-semibold uppercase tracking-wide text-white/70">
        Command Center
      </div>
      <div className="space-y-4 rounded-3xl border border-white/10 bg-black/30 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <CommandCenter />
      </div>
    </div>
  )
}
