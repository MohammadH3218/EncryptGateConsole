"use client"

import { useState, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { SenderDialog } from "./sender-dialog"

interface BlockedSender {
  id: number
  email: string
  reason: string
  blockedBy: string
  timestamp: string
}

interface BlockedSendersListProps {
  searchQuery: string
  blockedSenders: BlockedSender[]
}

export function BlockedSendersList({ searchQuery, blockedSenders }: BlockedSendersListProps) {
  const [selectedSender, setSelectedSender] = useState<BlockedSender | null>(null)
  const [filters, setFilters] = useState({
    blockedBy: "All",
    timeRange: "All",
  })
  const [openPopover, setOpenPopover] = useState({
    blockedBy: false,
    timeRange: false,
  })

  const filteredSenders = useMemo(() => {
    return blockedSenders.filter((sender) => {
      const matchesSearch =
        sender.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sender.blockedBy.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesBlockedBy = filters.blockedBy === "All" || sender.blockedBy === filters.blockedBy
      const matchesTimeRange = filters.timeRange === "All"

      return matchesSearch && matchesBlockedBy && matchesTimeRange
    })
  }, [searchQuery, blockedSenders, filters])

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
          className="h-8 w-[200px] justify-between"
        >
          {filters[filterType]}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align={align}>
        <Command>
          <CommandInput placeholder={`Search ${filterType}`} />
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

  return (
    <>
      <Card className="border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead className="w-[200px]">
                <div className="flex items-center space-x-2">
                  <span>Blocked By</span>
                  {renderFilterPopover("blockedBy", ["All", ...new Set(blockedSenders.map((s) => s.blockedBy))])}
                </div>
              </TableHead>
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
            {filteredSenders.map((sender) => (
              <TableRow
                key={sender.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setSelectedSender(sender)}
              >
                <TableCell>{sender.email}</TableCell>
                <TableCell>{sender.blockedBy}</TableCell>
                <TableCell className="text-right">{sender.timestamp}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <SenderDialog
        sender={selectedSender}
        open={selectedSender !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedSender(null)
        }}
        type="blocked"
      />
    </>
  )
}
