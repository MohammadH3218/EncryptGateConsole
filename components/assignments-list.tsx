"use client"

import { useState, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { DetectionDialog } from "./detection-dialog"

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

interface AssignmentsListProps {
  searchQuery: string
  assignments: Detection[]
}

export function AssignmentsList({ searchQuery, assignments }: AssignmentsListProps) {
  const [selectedDetection, setSelectedDetection] = useState<Detection | null>(null)
  const [filters, setFilters] = useState({
    severity: "All",
    status: "All",
    timeRange: "All",
  })
  const [openPopover, setOpenPopover] = useState({
    severity: false,
    status: false,
    timeRange: false,
  })

  const filteredAssignments = useMemo(() => {
    return assignments.filter((assignment) => {
      const matchesSearch =
        assignment.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        assignment.status.toLowerCase().includes(searchQuery.toLowerCase()) ||
        assignment.sentBy.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesSeverity = filters.severity === "All" || assignment.severity === filters.severity
      const matchesStatus = filters.status === "All" || assignment.status === filters.status
      const matchesTimeRange = filters.timeRange === "All"

      return matchesSearch && matchesSeverity && matchesStatus && matchesTimeRange
    })
  }, [searchQuery, assignments, filters])

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

  const getSeverityBadgeClass = (severity: string) => {
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
            {filteredAssignments.map((assignment) => (
              <TableRow
                key={assignment.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setSelectedDetection(assignment)}
              >
                <TableCell>{assignment.uniqueId}</TableCell>
                <TableCell>
                  <Badge className={cn("w-20", getSeverityBadgeClass(assignment.severity))}>
                    {assignment.severity}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{assignment.name}</TableCell>
                <TableCell>{assignment.status}</TableCell>
                <TableCell>{assignment.sentBy}</TableCell>
                <TableCell className="text-right">{assignment.timestamp}</TableCell>
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
        onAssign={() => {}} // This is a no-op since we don't want to allow reassignment in the assignments view
      />
    </>
  )
}
