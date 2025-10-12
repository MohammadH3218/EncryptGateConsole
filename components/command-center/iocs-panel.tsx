"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Copy } from "lucide-react"

interface EmailResp {
  id: string
  messageId: string
  body?: string
  bodyHtml?: string
  headers?: Record<string,string>
}

const urlRegex = /https?:\/\/[^\s"'<>]+/gi
const domainRegex = /([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}/gi

export function IocsPanel() {
  const pathname = usePathname()
  const [email, setEmail] = useState<EmailResp | null>(null)

  // extract org and id from org-scoped investigate path
  const { orgId, invId } = useMemo(() => {
    const parts = (pathname || '').split('/')
    return { orgId: parts[2] || '', invId: parts[parts.length-1] || '' }
  }, [pathname])

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const id = decodeURIComponent(invId)
        const res = await fetch(`/api/email/${encodeURIComponent(id)}`, { cache: 'no-store' })
        if (!active) return
        if (res.ok) {
          const data = await res.json()
          setEmail(data)
        } else {
          setEmail(null)
        }
      } catch {
        setEmail(null)
      }
    }
    if (invId) load()
    return () => { active = false }
  }, [invId])

  const text = (email?.bodyHtml || email?.body || '')
  const urls = useMemo(() => (text.match(urlRegex) || []).slice(0, 10), [text])
  const domains = useMemo(() => (text.match(domainRegex) || []).slice(0, 10), [text])

  const copy = (val: string) => navigator.clipboard.writeText(val).catch(()=>{})

  if (!invId) return null

  return (
    <Card className="bg-[#0f0f0f] border-[#1f1f1f]">
      <CardHeader>
        <CardTitle className="text-white text-sm">Indicators of Compromise</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {urls.length === 0 && domains.length === 0 ? (
          <p className="text-xs text-gray-500">No IOCs found yet.</p>
        ) : (
          <>
            {urls.length > 0 && (
              <div>
                <div className="text-xs text-gray-400 mb-1">URLs</div>
                <div className="flex flex-wrap gap-2">
                  {urls.map((u, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <a href={u} target="_blank" rel="noreferrer" className="text-xs text-blue-300 hover:text-blue-200 truncate max-w-[12rem]">
                        {u}
                      </a>
                      <Button variant="outline" size="icon" className="h-6 w-6 bg-[#1a1a1a] border-[#2a2a2a]" onClick={() => copy(u)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {domains.length > 0 && (
              <div>
                <div className="text-xs text-gray-400 mb-1 mt-1">Domains</div>
                <div className="flex flex-wrap gap-2">
                  {domains.map((d, i) => (
                    <Badge key={i} variant="outline" className="border-gray-500 text-gray-300">
                      <a className="hover:underline" href={`https://www.virustotal.com/gui/domain/${d}`} target="_blank" rel="noreferrer">{d}</a>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
