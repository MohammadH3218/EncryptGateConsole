"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Building2, Search, ShieldCheck } from "lucide-react"

interface OrgSearchResult {
  organizationId: string
  name?: string
  region?: string
  orgCode?: string
}

const SEARCH_DELAY_MS = 250

export default function OrgSelectPage() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<OrgSearchResult[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const debouncedQuery = useMemo(() => query.trim(), [query])

  useEffect(() => {
    if (!debouncedQuery) {
      setResults([])
      setErrorMessage(null)
      return
    }

    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      setIsSearching(true)
      setErrorMessage(null)
      try {
        const response = await fetch(
          `/api/orgs/search?q=${encodeURIComponent(debouncedQuery)}`,
          {
            headers: {
              "x-skip-rewrite": "1",
            },
            signal: controller.signal,
            cache: "no-store",
          },
        )

        if (!response.ok) {
          throw new Error("Search failed")
        }

        const payload = await response.json()
        setResults(Array.isArray(payload.items) ? payload.items : [])
        if (!payload.items?.length) {
          setErrorMessage("No organizations matched that search.")
        }
      } catch (error) {
        if (controller.signal.aborted) return
        console.error("Organization search failed:", error)
        setErrorMessage("We couldn’t complete that search. Try again.")
      } finally {
        setIsSearching(false)
      }
    }, SEARCH_DELAY_MS)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [debouncedQuery])

  const handleSelectOrg = (orgId: string) => {
    router.push(`/o/${orgId}/login`)
  }

  return (
    <div className="min-h-screen bg-[#171717] flex items-center justify-center px-6 py-12">
      <Card className="w-full max-w-3xl bg-[#0f0f0f] border-[#1f1f1f] shadow-2xl">
        <CardHeader>
          <div className="flex flex-col gap-2 text-white">
            <CardTitle className="text-2xl font-semibold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-blue-400" />
              Sign in to your organization
            </CardTitle>
            <p className="text-sm text-gray-400">
              Search by organization name or the short code you received during
              onboarding.
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Example: Interactive Coventry or ORG-12345"
              className="bg-[#1a1a1a] border-[#2a2a2a] text-white pl-9"
            />
          </div>

          <div className="space-y-3">
            {isSearching && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                Searching…
              </div>
            )}

            {!isSearching && results.length > 0 && (
              <div className="space-y-2">
                {results.map((org) => (
                  <button
                    key={org.organizationId}
                    onClick={() => handleSelectOrg(org.organizationId)}
                    className="w-full text-left bg-[#161616] border border-transparent hover:border-[#2f2f2f] transition rounded-lg px-4 py-4 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-white font-medium">
                        <Building2 className="h-4 w-4 text-blue-300" />
                        <span>{org.name ?? org.organizationId}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500">
                        <Badge variant="outline" className="border-[#2f2f2f] bg-transparent text-gray-400">
                          {org.orgCode ?? "Code pending"}
                        </Badge>
                        {org.region && (
                          <Badge variant="secondary" className="bg-blue-500/10 text-blue-300 border-0">
                            {org.region}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button variant="secondary" className="bg-blue-600 hover:bg-blue-700 text-white">
                      Continue
                    </Button>
                  </button>
                ))}
              </div>
            )}

            {!isSearching && errorMessage && (
              <p className="text-sm text-red-400">{errorMessage}</p>
            )}
          </div>

          <div className="text-xs text-gray-500 border-t border-[#1f1f1f] pt-4">
            Need to set up a new organization instead?{" "}
            <button
              onClick={() => router.push("/setup-organization")}
              className="text-blue-400 hover:text-blue-300 underline"
            >
              Start EncryptGate setup
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
