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
      console.log("[OrgSelect] starting search", { query: debouncedQuery })
      try {
        const response = await fetch(
          /api/orgs/search?q=,
          {
            headers: {
              "x-skip-rewrite": "1",
            },
            signal: controller.signal,
            cache: "no-store",
          },
        )

        const status = response.status
        let payload: any = null

        try {
          payload = await response.json()
        } catch (jsonError) {
          console.error("[OrgSelect] failed to parse response JSON", jsonError)
          throw jsonError
        }

        console.log("[OrgSelect] response payload", { status, payload })

        if (!response.ok || payload?.error) {
          console.warn("[OrgSelect] search returned error", payload?.error)
          setResults([])
          setErrorMessage("We couldn't complete that search. Try again later.")
        } else {
          const items = Array.isArray(payload.items) ? payload.items : []
          console.log("[OrgSelect] items returned", items.length)
          setResults(items)
          if (!items.length) {
            setErrorMessage("No organizations matched that search.")
          }
        }
      } catch (error) {
        if (controller.signal.aborted) return
        console.error("[OrgSelect] organization search failed", error)
        setErrorMessage("We couldn't complete that search. Try again.")
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
    router.push(/o//login)
  }

  return (
    <div className="min-h-screen bg-app flex items-center justify-center px-6 py-12">
      <Card className="w-full max-w-3xl border border-app-border/80 shadow-[var(--shadow-lg)]">
        <CardHeader>
          <div className="flex flex-col gap-2 text-app-textPrimary">
            <CardTitle className="flex items-center gap-2 text-2xl font-semibold">
              <ShieldCheck className="h-6 w-6 text-app-accent" />
              Sign in to your organization
            </CardTitle>
            <p className="text-sm text-app-textSecondary">
              Search by organization name or the short code you received during onboarding.
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-app-textMuted" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search and type your org here"
              className="pl-9"
            />
          </div>

          <div className="space-y-3">
            {isSearching && (
              <div className="flex items-center gap-2 text-sm text-app-textSecondary">
                <Loader2 className="h-4 w-4 animate-spin text-app-accent" />
                Searching…
              </div>
            )}

            {!isSearching && results.length > 0 && (
              <div className="space-y-2">
                {results.map((org) => (
                  <button
                    key={org.organizationId}
                    onClick={() => handleSelectOrg(org.organizationId)}
                    className="flex w-full items-center justify-between gap-4 rounded-xl border border-app-border/60 bg-app-surface px-4 py-4 text-left transition duration-200 hover:border-app-ring"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-app-textPrimary font-medium">
                        <Building2 className="h-4 w-4 text-app-accent" />
                        <span>{org.name ?? org.organizationId}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-app-textSecondary">
                        <Badge variant="outline" className="border-app-border/80 text-app-textSecondary">
                          {org.orgCode ?? "Code pending"}
                        </Badge>
                        {org.region && (
                          <Badge variant="secondary" className="border-0 bg-app-accent/15 text-app-accent">
                            {org.region}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button>Continue</Button>
                  </button>
                ))}
              </div>
            )}

            {!isSearching && errorMessage && (
              <p className="text-sm text-app-danger">{errorMessage}</p>
            )}
          </div>

          <div className="border-t border-app-border/60 pt-4 text-xs text-app-textSecondary">
            Need to set up a new organization instead?{" "}
            <button
              onClick={() => router.push("/setup-organization")}
              className="text-app-accent hover:text-app-accentHover underline"
            >
              Start EncryptGate setup
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
