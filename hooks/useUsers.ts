"use client"

import { useState, useEffect, useCallback } from "react"

export interface User {
  id: string
  name: string
  email: string
  role: string
  status: string
  lastLogin: string | null
}

export function useUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/company-settings/users")
      if (!res.ok) throw new Error("Failed to load users")
      const data: User[] = await res.json()
      setUsers(data)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  const addUser = useCallback(
    async (user: { name: string; email: string; role: string }) => {
      setLoading(true)
      try {
        const res = await fetch("/api/company-settings/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(user),
        })
        if (!res.ok) throw new Error("Failed to add user")
        const newUser: User = await res.json()
        setUsers((prev) => [...prev, newUser])
        return newUser
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const deleteUser = useCallback(
    async (id: string) => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/company-settings/users/${encodeURIComponent(id)}`,
          { method: "DELETE" }
        )
        if (!res.ok) throw new Error("Failed to delete user")
        setUsers((prev) => prev.filter((u) => u.id !== id))
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  return { users, loading, error, addUser, deleteUser, refresh: fetchUsers }
}
