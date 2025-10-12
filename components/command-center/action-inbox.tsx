"use client"

import { useState, useEffect } from "react"
import { Inbox, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PushedRequest {
  id: string
  title: string
  description: string
  severity: "critical" | "high" | "medium" | "low"
  timestamp: string
}

export function ActionInbox() {
  const [requests, setRequests] = useState<PushedRequest[]>([])
  const [isAnimating, setIsAnimating] = useState(false)

  // Poll for pushed requests every 10 seconds
  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const response = await fetch("/api/admin/pushed-requests")
        if (response.ok) {
          const data = await response.json()
          if (data.length > 0) {
            setRequests(data)
            setIsAnimating(true)
            setTimeout(() => setIsAnimating(false), 300)
          }
        }
      } catch (error) {
        console.log("[v0] Failed to fetch pushed requests:", error)
      }
    }

    fetchRequests()
    const interval = setInterval(fetchRequests, 10000)
    return () => clearInterval(interval)
  }, [])

  const handleAction = async (id: string, action: "accept" | "deny") => {
    try {
      await fetch("/api/admin/pushed-requests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      })
      setRequests((prev) => prev.filter((req) => req.id !== id))
    } catch (error) {
      console.log("[v0] Failed to handle action:", error)
    }
  }

  // Auto-dismiss after 7 seconds
  useEffect(() => {
    if (requests.length > 0) {
      const timer = setTimeout(() => {
        setRequests([])
      }, 7000)
      return () => clearTimeout(timer)
    }
  }, [requests])

  if (requests.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2">
        <Inbox className="w-4 h-4 text-orange-400" />
        <h3 className="text-white font-medium text-sm">Action Inbox</h3>
      </div>

      <div className="space-y-2">
        {requests.map((request) => (
          <div
            key={request.id}
            className={`p-2 rounded-lg bg-[#1f1f1f] border border-orange-500/20 transition-all ${
              isAnimating ? "animate-in fade-in slide-in-from-right-2" : ""
            }`}
          >
            <div className="space-y-2">
              <div>
                <p className="text-white text-xs font-medium">{request.title}</p>
                <p className="text-gray-400 text-xs mt-0.5 line-clamp-2">{request.description}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleAction(request.id, "accept")}
                  className="h-6 text-xs bg-green-600 hover:bg-green-700 text-white flex-1"
                >
                  <Check className="w-3 h-3 mr-1" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction(request.id, "deny")}
                  className="h-6 text-xs border-red-500/20 text-red-400 hover:bg-red-500/10 flex-1"
                >
                  <X className="w-3 h-3 mr-1" />
                  Deny
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
