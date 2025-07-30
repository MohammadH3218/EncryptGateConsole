// hooks/useEmployees.ts
"use client"

import { useState, useEffect, useCallback } from "react"

export interface Employee {
  id: string
  name: string
  email: string
  status: string
  addedAt: string | null
  lastEmailProcessed: string | null
}

export function useEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      console.log('📋 Fetching monitored employees...')
      const res = await fetch("/api/company-settings/employees")
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || "Failed to load employees")
      }
      const data: Employee[] = await res.json()
      console.log(`✅ Fetched ${data.length} monitored employees`)
      setEmployees(data)
    } catch (err) {
      console.error('❌ Error fetching employees:', err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  const addEmployee = useCallback(
    async (employee: { name: string; email: string }) => {
      setLoading(true)
      setError(null)
      try {
        console.log(`👤 Adding employee to monitoring: ${employee.email}`)
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
        console.log(`✅ Employee added to monitoring: ${employee.email}`)
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
        console.log(`🗑️ Removing employee from monitoring: ${id}`)
        const res = await fetch(
          `/api/company-settings/employees/${encodeURIComponent(id)}`,
          { method: "DELETE" }
        )
        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.message || "Failed to remove employee")
        }
        setEmployees((prev) => prev.filter((e) => e.id !== id))
        console.log(`✅ Employee removed from monitoring: ${id}`)
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