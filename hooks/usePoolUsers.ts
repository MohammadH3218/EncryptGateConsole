"use client"

import useSWR from "swr"

export interface PoolUser {
  username: string
  name: string
  email: string
}

// Add error handling to the fetcher
const fetcher = async (url: string) => {
  console.log('Fetching from:', url)
  try {
    const response = await fetch(url)
    console.log('Response status:', response.status)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('API Error:', response.status, errorText)
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }
    
    const data = await response.json()
    console.log('Fetched data:', data)
    return data
  } catch (error) {
    console.error('Fetch error:', error)
    throw error
  }
}

export function usePoolUsers() {
  const { data, error, isLoading } = useSWR<PoolUser[]>(
    "/api/company-settings/users/pool",
    fetcher,
    {
      onError: (error) => {
        console.error('SWR Error:', error)
      },
      onSuccess: (data) => {
        console.log('SWR Success:', data)
      }
    }
  )

  console.log('usePoolUsers state:', { data, error, isLoading })

  return {
    poolUsers: data ?? [],
    loading: isLoading,
    error,
  }
}