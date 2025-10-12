"use client"

import { useState, useEffect } from "react"
import { LinkIcon, Copy, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useParams } from "next/navigation"

interface IOC {
  type: "url" | "domain" | "ip"
  value: string
}

export function IocsPanel() {
  const params = useParams()
  const [iocs, setIocs] = useState<IOC[]>([])

  useEffect(() => {
    const fetchIOCs = async () => {
      try {
        const response = await fetch(`/api/email/${params.id}`)
        if (response.ok) {
          const data = await response.json()
          // Extract URLs/domains from email body
          const urlRegex = /(https?:\/\/[^\s]+)/g
          const urls = data.body?.match(urlRegex) || []
          setIocs(urls.map((url: string) => ({ type: "url" as const, value: url })))
        }
      } catch (error) {
        console.log("[v0] Failed to fetch IOCs:", error)
      }
    }

    if (params.id) {
      fetchIOCs()
    }
  }, [params.id])

  const copyToClipboard = (value: string) => {
    navigator.clipboard.writeText(value)
  }

  if (iocs.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2">
        <LinkIcon className="w-4 h-4 text-red-400" />
        <h3 className="text-white font-medium text-sm">IOCs</h3>
      </div>

      <div className="space-y-2">
        {iocs.map((ioc, index) => (
          <div key={index} className="p-2 rounded-lg bg-[#1f1f1f] space-y-1">
            <p className="text-gray-400 text-xs uppercase">{ioc.type}</p>
            <p className="text-white text-xs break-all">{ioc.value}</p>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copyToClipboard(ioc.value)}
                className="h-6 text-xs text-gray-400 hover:text-white"
              >
                <Copy className="w-3 h-3 mr-1" />
                Copy
              </Button>
              <a
                href={`https://www.virustotal.com/gui/search/${encodeURIComponent(ioc.value)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="sm" variant="ghost" className="h-6 text-xs text-gray-400 hover:text-white">
                  <ExternalLink className="w-3 h-3 mr-1" />
                  VT
                </Button>
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
