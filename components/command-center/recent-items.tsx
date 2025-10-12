"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface Item { label: string; href: string }

export function RecentItems() {
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('recent_paths')
      if (raw) setItems(JSON.parse(raw))
    } catch {}
  }, [])

  if (items.length === 0) return null

  return (
    <Card className="bg-[#0f0f0f] border-[#1f1f1f]">
      <CardHeader>
        <CardTitle className="text-white text-sm">Recent Items</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.slice(0,5).map((it, i) => (
          <a key={i} href={it.href} className="block text-sm text-gray-300 hover:text-white truncate">
            {it.label}
          </a>
        ))}
      </CardContent>
    </Card>
  )
}
