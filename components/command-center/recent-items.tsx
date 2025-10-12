"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Clock } from "lucide-react"

interface RecentItem {
  path: string
  label: string
  timestamp: number
}

export function RecentItems() {
  const [items, setItems] = useState<RecentItem[]>([])

  useEffect(() => {
    const stored = localStorage.getItem("recent_paths")
    if (stored) {
      try {
        setItems(JSON.parse(stored).slice(0, 5))
      } catch (error) {
        console.log("[v0] Failed to parse recent items:", error)
      }
    }
  }, [])

  if (items.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2">
        <Clock className="w-4 h-4 text-gray-400" />
        <h3 className="text-white font-medium text-sm">Recent</h3>
      </div>

      <div className="space-y-1">
        {items.map((item, index) => (
          <Link
            key={index}
            href={item.path}
            className="block p-2 rounded-lg text-xs text-gray-300 hover:text-white hover:bg-[#1f1f1f] transition-colors truncate"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
