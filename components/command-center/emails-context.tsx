"use client"

import { useState, useEffect } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"

interface SavedSearch {
  label: string
  query: string
}

export function EmailsContext() {
  const router = useRouter()
  const [searches, setSearches] = useState<SavedSearch[]>([
    { label: "Flagged Emails", query: "flagged:true" },
    { label: "High Priority", query: "priority:high" },
    { label: "Unread", query: "status:unread" },
  ])

  useEffect(() => {
    const stored = localStorage.getItem("saved_email_searches")
    if (stored) {
      try {
        setSearches(JSON.parse(stored))
      } catch (error) {
        console.log("[v0] Failed to parse saved searches:", error)
      }
    }
  }, [])

  const handleSearch = (query: string) => {
    router.push(`/emails?search=${encodeURIComponent(query)}`)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2">
        <Search className="w-4 h-4 text-green-400" />
        <h3 className="text-white font-medium text-sm">Saved Searches</h3>
      </div>

      <div className="space-y-1">
        {searches.map((search, index) => (
          <Button
            key={index}
            size="sm"
            variant="ghost"
            onClick={() => handleSearch(search.query)}
            className="h-7 w-full justify-start text-xs text-gray-300 hover:text-white hover:bg-[#1f1f1f]"
          >
            {search.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
