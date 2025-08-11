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

interface AllowedSender {
  id: number
  email: string
  reason: string
  allowedBy: string
  timestamp: string
}

interface AllowedSendersListProps {
  searchQuery: string
  allowedSenders: AllowedSender[]
}

export function AllowedSendersList({ searchQuery, allowedSenders }: AllowedSendersListProps) {
  const [selectedSender, setSelectedSender] = useState<AllowedSender | null>(null)
  const [filters, setFilters] = useState({
    allowedBy: "All",
    timeRange: "All",
  })
  const [openPopover, setOpenPopover] = useState({
    allowedBy: false,
    timeRange: false,
  })

  const filteredSenders = useMemo(() => {
    return allowedSenders.filter((sender) => {
      const matchesSearch =
        sender.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sender.allowedBy.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesAllowedBy = filters.allowedBy === "All" || sender.allowedBy === filters.allowedBy
      const matchesTimeRange = filters.timeRange === "All"

      return matchesSearch && matchesAllowedBy && matchesTimeRange
    })
  }, [searchQuery, allowedSenders, filters])

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
          className="h-8 w-[200px] justify-between bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
        >
          {filters[filterType]}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0 bg-[#1f1f1f] border-[#1f1f1f]" align={align}>
        <Command className="bg-[#1f1f1f]">
          <CommandInput placeholder={`Search ${filterType}`} className="bg-[#1f1f1f] text-white border-[#1f1f1f]" />
          <CommandList className="bg-[#1f1f1f]">
            <CommandEmpty className="text-white">No option found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem key={option} value={option} onSelect={() => handleFilterChange(filterType, option)} className="text-white hover:bg-[#2a2a2a] focus:bg-[#2a2a2a] focus:text-white">
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
      <Card className="border-none bg-[#0f0f0f] shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-[#1f1f1f] border-[#1f1f1f]">
              <TableHead className="text-white">Email</TableHead>
              <TableHead className="w-[200px] text-white">
                <div className="flex items-center space-x-2">
                  <span>Allowed By</span>
                  {renderFilterPopover("allowedBy", ["All", ...new Set(allowedSenders.map((s) => s.allowedBy))])}
                </div>
              </TableHead>
              <TableHead className="text-right w-[200px] text-white">
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
                className="cursor-pointer hover:bg-[#1f1f1f] border-[#1f1f1f]"
                onClick={() => setSelectedSender(sender)}
              >
                <TableCell className="text-white">{sender.email}</TableCell>
                <TableCell className="text-white">{sender.allowedBy}</TableCell>
                <TableCell className="text-right text-white">{sender.timestamp}</TableCell>
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
        type="allowed"
      />
    </>
  )
}
