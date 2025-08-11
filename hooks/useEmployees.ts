// hooks/useEmployees.ts
"use client"

import { useState, useEffect, useCallback } from "react"

export interface Employee {
  id: string
  name: string
  email: string
  department?: string
  jobTitle?: string
  status: string
  addedAt: string | null
  lastEmailProcessed: string | null
  syncedFromWorkMail?: string | null // When synced from WorkMail
  workMailUserId?: string // WorkMail internal user ID
}

export function useEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/company-settings/employees")
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || "Failed to load employees")
      }
      const data: Employee[] = await res.json()
      setEmployees(data)
    } catch (err) {
      console.error('❌ Error fetching employees:', err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  const addEmployee = useCallback(
    async (employee: { name: string; email: string; department?: string; jobTitle?: string }) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/company-settings/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(employee),
        })
        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.message || "Failed to add employee")
        }
        const newEmp: Employee = await res.json()
        setEmployees((prev) => [...prev, newEmp])
        return newEmp
      } catch (err) {
        console.error(`❌ Error adding employee:`, err)
        setError(err as Error)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const removeEmployee = useCallback(
    async (id: string) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/company-settings/employees/${encodeURIComponent(id)}`,
          { method: "DELETE" }
        )
        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.message || "Failed to remove employee")
        }
        setEmployees((prev) => prev.filter((e) => e.id !== id))
      } catch (err) {
        console.error(`❌ Error removing employee:`, err)
        setError(err as Error)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    fetchEmployees()
  }, [fetchEmployees])

  return {
    employees,
    loading,
    error,
    addEmployee,
    removeEmployee,
    refresh: fetchEmployees,
  }
}