"use client"

import useSWR from "swr"

export interface PoolUser {
  username: string
  name:     string
  email:    string
}

export function usePoolUsers() {
  const { data, error } = useSWR<PoolUser[]>(
    "/api/company-settings/users/pool",
    // annotate url to avoid implicit any
    (url: string) => fetch(url).then((r) => r.json())
  )

  return {
    poolUsers: data ?? [],
    loading:   !error && !data,
    error,
  }
}
