"use client"

import { useState, useEffect, useCallback } from "react"

export interface Employee {
  id: string
  email: string
}

export function useEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/company-settings/employees")
      if (!res.ok) throw new Error("Failed to load employees")
      const data: Employee[] = await res.json()
      setEmployees(data)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  const addEmployee = useCallback(
    async (email: string) => {
      setLoading(true)
      try {
        const res = await fetch("/api/company-settings/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        })
        if (!res.ok) throw new Error("Failed to add employee")
        const newEmp: Employee = await res.json()
        setEmployees((prev) => [...prev, newEmp])
        return newEmp
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const removeEmployee = useCallback(
    async (id: string) => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/company-settings/employees/${encodeURIComponent(id)}`,
          { method: "DELETE" }
        )
        if (!res.ok) throw new Error("Failed to remove employee")
        setEmployees((prev) => prev.filter((e) => e.id !== id))
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
