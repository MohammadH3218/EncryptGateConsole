"use client"

import { useState, useEffect } from "react"
import { Clock } from "lucide-react"
import { useParams } from "next/navigation"

interface TimelineEvent {
  label: string
  timestamp: string
}

export function Timeline() {
  const params = useParams()
  const [events, setEvents] = useState<TimelineEvent[]>([])

  useEffect(() => {
    const fetchTimeline = async () => {
      try {
        const response = await fetch(`/api/investigations/${params.id}`)
        if (response.ok) {
          const data = await response.json()
          setEvents([
            { label: "Created", timestamp: data.created || "N/A" },
            { label: "Last Updated", timestamp: data.lastUpdated || "N/A" },
            ...(data.escalated ? [{ label: "Escalated", timestamp: data.escalated }] : []),
          ])
        }
      } catch (error) {
        console.log("[v0] Failed to fetch timeline:", error)
        // Graceful fallback
        setEvents([
          { label: "Created", timestamp: "N/A" },
          { label: "Last Updated", timestamp: "N/A" },
        ])
      }
    }

    if (params.id) {
      fetchTimeline()
    }
  }, [params.id])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2">
        <Clock className="w-4 h-4 text-blue-400" />
        <h3 className="text-white font-medium text-sm">Timeline</h3>
      </div>

      <div className="space-y-2">
        {events.map((event, index) => (
          <div key={index} className="p-2 rounded-lg bg-[#1f1f1f]">
            <p className="text-gray-400 text-xs">{event.label}</p>
            <p className="text-white text-xs mt-0.5">{event.timestamp}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
