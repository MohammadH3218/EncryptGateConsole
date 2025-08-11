"use client"

import { useState, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableRow, TableHeader } from "@/components/ui/table"
import { DetectionDialog } from "./detection-dialog"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDetections } from "../contexts/DetectionsContext"

interface Detection {
  id: number
  uniqueId: string
  severity: string
  name: string
  status: string
  assignedTo: string[] | string
  sentBy: string
  timestamp: string
  description: string
  indicators: string[]
  recommendations: string[]
}

const initialDetections: Detection[] = []

interface DetectionsListProps {
  searchQuery: string
}

export function DetectionsList({ searchQuery }: DetectionsListProps) {
  const { detections, updateDetection } = useDetections()
  const [selectedDetection, setSelectedDetection] = useState<Detection | null>(null)
  const [filters, setFilters] = useState({
    severity: "All",
    status: "All",
    assignedTo: "All",
    timeRange: "All",
  })
  const [openPopover, setOpenPopover] = useState({
    severity: false,
    status: false,
    assignedTo: false,
    timeRange: false,
  })

  const filteredDetections = useMemo(() => {
    return detections.filter((detection) => {
      const matchesSearch =
        detection.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        detection.status.toLowerCase().includes(searchQuery.toLowerCase()) ||
        detection.assignedTo.toString().toLowerCase().includes(searchQuery.toLowerCase()) ||
        detection.sentBy.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesSeverity = filters.severity === "All" || detection.severity === filters.severity
      const matchesStatus = filters.status === "All" || detection.status === filters.status
      const matchesAssignedTo =
        filters.assignedTo === "All" ||
        (Array.isArray(detection.assignedTo)
          ? detection.assignedTo.includes(filters.assignedTo)
          : detection.assignedTo === filters.assignedTo)

      const matchesTimeRange = filters.timeRange === "All"

      return matchesSearch && matchesSeverity && matchesStatus && matchesAssignedTo && matchesTimeRange
    })
  }, [searchQuery, detections, filters])

  const handleAssign = (id: number, assignedUsers: string[]) => {
    const updatedDetection = detections.find((d) => d.id === id)
    if (updatedDetection) {
      updateDetection(id, { ...updatedDetection, assignedTo: assignedUsers })
    }
  }

  const handleFilterChange = (filterType: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [filterType]: value }))
    setOpenPopover((prev) => ({ ...prev, [filterType]: false }))
  }

  const renderFilterPopover = (
    filterType: keyof typeof filters,
    options: string[],
    align: "start" | "end" = "start",
  ) => (
    <Popover
      open={openPopover[filterType]}
      onOpenChange={(open) => setOpenPopover((prev) => ({ ...prev, [filterType]: open }))}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={openPopover[filterType]}
          className="h-6 w-6 p-0 border-none bg-transparent"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align={align}>
        <Command>
          <CommandInput placeholder={`Search`} />
          <CommandList>
            <CommandEmpty>No option found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem key={option} value={option} onSelect={() => handleFilterChange(filterType, option)}>
                  <Check className={cn("mr-2 h-4 w-4", filters[filterType] === option ? "opacity-100" : "opacity-0")} />
                  {option}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )

  const getSeverityBadgeVariant = (severity: string) => {
    switch (severity) {
      case "Critical":
        return "bg-red-600 text-white hover:bg-red-700"
      case "High":
        return "bg-orange-500 text-white hover:bg-orange-600"
      case "Medium":
        return "bg-yellow-500 text-white hover:bg-yellow-600"
      case "Low":
        return "bg-green-500 text-white hover:bg-green-600"
      case "Flagged":
        return "bg-gray-500 text-white hover:bg-gray-600"
      default:
        return "bg-gray-500 text-white hover:bg-gray-600"
    }
  }

  return (
    <>
      <Card className="border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">
                <div className="flex items-center space-x-2">
                  <span>ID</span>
                </div>
              </TableHead>
              <TableHead className="w-[150px]">
                <div className="flex items-center space-x-2">
                  <span>Severity</span>
                  {renderFilterPopover("severity", ["All", "Critical", "High", "Medium", "Low", "Flagged"])}
                </div>
              </TableHead>
              <TableHead>Subject</TableHead>
              <TableHead className="w-[150px]">
                <div className="flex items-center space-x-2">
                  <span>Status</span>
                  {renderFilterPopover("status", ["All", "New", "In Progress", "Resolved", "Closed"])}
                </div>
              </TableHead>
              <TableHead className="w-[200px]">
                <div className="flex items-center space-x-2">
                  <span>Assigned To</span>
                  {renderFilterPopover("assignedTo", [
                    "All",
                    "Alice Johnson",
                    "Bob Smith",
                    "Charlie Brown",
                    "Diana Prince",
                  ])}
                </div>
              </TableHead>
              <TableHead>Sent by</TableHead>
              <TableHead className="text-right w-[200px]">
                <div className="flex items-center justify-end space-x-2">
                  <span>Timestamp</span>
                  {renderFilterPopover(
                    "timeRange",
                    ["All", "Last 24 hours", "Last 7 days", "Last 30 days", "Last 90 days", "Custom"],
                    "end",
                  )}
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDetections.map((detection) => (
              <TableRow
                key={detection.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setSelectedDetection(detection)}
              >
                <TableCell>{detection.uniqueId}</TableCell>
                <TableCell>
                  <Badge className={cn("w-20", getSeverityBadgeVariant(detection.severity))}>
                    {detection.severity}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{detection.name}</TableCell>
                <TableCell>{detection.status}</TableCell>
                <TableCell>
                  {Array.isArray(detection.assignedTo) && detection.assignedTo.length > 0
                    ? detection.assignedTo.join(", ")
                    : "Unassigned"}
                </TableCell>
                <TableCell>{detection.sentBy}</TableCell>
                <TableCell className="text-right">{detection.timestamp}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <DetectionDialog
        detection={selectedDetection}
        open={selectedDetection !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDetection(null)
        }}
        onAssign={handleAssign}
      />
    </>
  )
}
