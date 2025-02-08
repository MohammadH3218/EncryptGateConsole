"use client"

import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { useSearchParams } from "next/navigation"
import axios from "axios"
import { API_URL } from "@/utils/api"
import type { Employee } from "@/types/employee"
import { toast } from "react-hot-toast"
import { FaCheckCircle, FaTimesCircle } from "react-icons/fa"

export default function EmployeeInvestigatePage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const employeeId = searchParams.get("id")
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAllowing, setIsAllowing] = useState(false)
  const [isBlocking, setIsBlocking] = useState(false)

  useEffect(() => {
    const fetchEmployee = async () => {
      try {
        const response = await axios.get(`${API_URL}/employees/${employeeId}`)
        setEmployee(response.data)
      } catch (error) {
        console.error("Error fetching employee:", error)
        toast.error("Failed to fetch employee details.")
      } finally {
        setIsLoading(false)
      }
    }

    if (employeeId) {
      fetchEmployee()
    }
  }, [employeeId])

  const handleAllowSender = async () => {
    setIsAllowing(true)
    try {
      await axios.post(`${API_URL}/employees/${employeeId}/allow`)
      toast.success("Sender allowed successfully!")
      router.push("/employee/allow-block-list")
    } catch (error) {
      console.error("Error allowing sender:", error)
      toast.error("Failed to allow sender.")
    } finally {
      setIsAllowing(false)
    }
  }

  const handleBlockSender = async () => {
    setIsBlocking(true)
    try {
      await axios.post(`${API_URL}/employees/${employeeId}/block`)
      toast.success("Sender blocked successfully!")
      router.push("/employee/allow-block-list")
    } catch (error) {
      console.error("Error blocking sender:", error)
      toast.error("Failed to block sender.")
    } finally {
      setIsBlocking(false)
    }
  }

  if (isLoading) {
    return <div>Loading...</div>
  }

  if (!employee) {
    return <div>Employee not found.</div>
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Investigate Employee</h1>
      <div className="mb-4">
        <p>
          <span className="font-bold">ID:</span> {employee.id}
        </p>
        <p>
          <span className="font-bold">Name:</span> {employee.name}
        </p>
        <p>
          <span className="font-bold">Email:</span> {employee.email}
        </p>
        <p>
          <span className="font-bold">Status:</span>{" "}
          {employee.isAllowed ? (
            <span className="text-green-500">
              <FaCheckCircle /> Allowed
            </span>
          ) : (
            <span className="text-red-500">
              <FaTimesCircle /> Blocked
            </span>
          )}
        </p>
      </div>
      <div className="flex space-x-4">
        <button
          onClick={handleAllowSender}
          disabled={isAllowing}
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
        >
          {isAllowing ? "Allowing..." : "Allow Sender"}
        </button>
        <button
          onClick={handleBlockSender}
          disabled={isBlocking}
          className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
        >
          {isBlocking ? "Blocking..." : "Block Sender"}
        </button>
      </div>
    </div>
  )
}

