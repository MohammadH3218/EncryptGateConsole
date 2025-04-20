"use client"

import { useState, useMemo, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Check, ChevronDown, Filter } from "lucide-react"
import { cn } from "@/lib/utils"
import { EmailDialog } from "./email-dialog"
import { FlagDialog } from "./flag-dialog"
import { useDetections } from "../contexts/DetectionsContext"
import { useToast } from "@/components/ui/use-toast"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Email {
  id: number
  uniqueId: string
  subject: string
  sentTo: string
  sentBy: string
  timestamp: string
  body: string
}

interface EmailsListProps {
  searchQuery: string
  employeeFilter: string | null
}

// Sample data to avoid empty state issues
const sampleEmails: Email[] = [
  {
    id: 1,
    uniqueId: "EM-001",
    subject: "Quarterly Report",
    sentTo: "john.doe@company.com",
    sentBy: "manager@company.com",
    timestamp: "2024-01-15T10:30:00Z",
    body: "Please find attached the quarterly report for Q4 2023.",
  },
  {
    id: 2,
    uniqueId: "EM-002",
    subject: "Meeting Reminder",
    sentTo: "john.doe@company.com",
    sentBy: "calendar@company.com",
    timestamp: "2024-01-16T09:15:00Z",
    body: "Reminder: Team meeting today at 2 PM in Conference Room A.",
  },
  {
    id: 3,
    uniqueId: "EM-003",
    subject: "Password Reset",
    sentTo: "john.doe@company.com",
    sentBy: "security@company.com",
    timestamp: "2024-01-17T14:45:00Z",
    body: "Your password has been reset. If you did not request this change, please contact IT immediately.",
  },
]

export function EmailsList({ searchQuery, employeeFilter }: EmailsListProps) {
  const [emails, setEmails] = useState<Email[]>(sampleEmails)
  const [filters, setFilters] = useState({
    sentTo: "All",
    sentBy: "All",
    subject: "",
    startDate: "",
    endDate: "",
    startTime: "",
    endTime: "",
  })
  const [openPopover, setOpenPopover] = useState({
    sentTo: false,
    sentBy: false,
    filters: false,
  })
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [isFlagDialogOpen, setIsFlagDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { detections, addDetection } = useDetections()
  const { toast } = useToast()

  const uniqueSentTo = useMemo(() => ["All", ...new Set(emails.map((email) => email.sentTo))], [emails])
  const uniqueSentBy = useMemo(() => ["All", ...new Set(emails.map((email) => email.sentBy))], [emails])

  const filteredEmails = useMemo(() => {
    return emails
      .filter((email) => {
        const matchesSearch =
          email.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
          email.sentTo.toLowerCase().includes(searchQuery.toLowerCase()) ||
          email.sentBy.toLowerCase().includes(searchQuery.toLowerCase())

        const matchesSentTo = filters.sentTo === "All" || email.sentTo === filters.sentTo
        const matchesSentBy = filters.sentBy === "All" || email.sentBy === filters.sentBy
        const matchesSubject =
          filters.subject === "" || email.subject.toLowerCase().includes(filters.subject.toLowerCase())

        const emailDate = new Date(email.timestamp)
        const matchesDate =
          (!filters.startDate || emailDate >= new Date(filters.startDate)) &&
          (!filters.endDate || emailDate <= new Date(filters.endDate))

        const emailTime = email.timestamp.split("T")[1].split("Z")[0]
        const matchesTime =
          (!filters.startTime || emailTime >= filters.startTime) && (!filters.endTime || emailTime <= filters.endTime)

        const matchesEmployeeFilter =
          !employeeFilter || email.sentTo === employeeFilter || email.sentBy === employeeFilter

        return (
          matchesSearch &&
          matchesSentTo &&
          matchesSentBy &&
          matchesSubject &&
          matchesDate &&
          matchesTime &&
          matchesEmployeeFilter
        )
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [searchQuery, emails, filters, employeeFilter])

  const handleFilterChange = (filterType: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [filterType]: value }))
    if (filterType === "sentTo" || filterType === "sentBy") {
      setOpenPopover((prev) => ({ ...prev, [filterType]: false }))
    }
  }

  const handleEmailClick = (email: Email) => {
    setSelectedEmail(email)
  }

  const handleFlagClick = useCallback(() => {
    if (selectedEmail) {
      const isAlreadyDetection = detections.some(
        (detection) =>
          detection.name === selectedEmail.subject &&
          detection.sentBy === selectedEmail.sentBy &&
          detection.timestamp === selectedEmail.timestamp,
      )

      if (isAlreadyDetection) {
        toast({
          title: "Already Flagged",
          description: "This email is already in the detections list.",
          variant: "destructive",
        })
      } else {
        setIsFlagDialogOpen(true)
      }
    }
  }, [selectedEmail, detections, toast])

  const handleFlagConfirm = async (assignedTo: string[]) => {
    if (selectedEmail) {
      const newDetection = {
        severity: "Flagged",
        name: selectedEmail.subject,
        status: "New",
        assignedTo: assignedTo.length > 0 ? assignedTo : "Unassigned",
        sentBy: selectedEmail.sentBy,
        timestamp: selectedEmail.timestamp,
        description: selectedEmail.body,
        indicators: ["Manually flagged from All Emails"],
        recommendations: ["Review email content"],
      }
      await addDetection(newDetection)
      toast({
        title: "Email Flagged",
        description:
          assignedTo.length > 0 ? "Email has been flagged and assigned." : "Email has been flagged without assignment.",
      })
      setIsFlagDialogOpen(false)
      setSelectedEmail(null)
    }
  }

  const renderFilterPopover = (
    filterType: "sentTo" | "sentBy",
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

  if (isLoading) {
    return <div>Loading emails...</div>
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">{employeeFilter ? `Emails for ${employeeFilter}` : "All Emails"}</h2>
        <Popover
          open={openPopover.filters}
          onOpenChange={(open) => setOpenPopover((prev) => ({ ...prev, filters: open }))}
        >
          <PopoverTrigger asChild>
            <Button variant="outline">
              <Filter className="mr-2 h-4 w-4" />
              Filters
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="grid gap-4">
              <div className="space-y-2">
                <h4 className="font-medium leading-none">Filters</h4>
                <p className="text-sm text-muted-foreground">Narrow down the email list using these filters.</p>
              </div>
              <div className="grid gap-2">
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    value={filters.subject}
                    onChange={(e) => handleFilterChange("subject", e.target.value)}
                    className="col-span-2 h-8"
                  />
                </div>
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="sentTo">Sent To</Label>
                  <div className="col-span-2">{renderFilterPopover("sentTo", uniqueSentTo)}</div>
                </div>
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="sentBy">Sent By</Label>
                  <div className="col-span-2">{renderFilterPopover("sentBy", uniqueSentBy)}</div>
                </div>
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => handleFilterChange("startDate", e.target.value)}
                    className="col-span-2 h-8 bg-popover text-popover-foreground"
                  />
                </div>
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => handleFilterChange("endDate", e.target.value)}
                    className="col-span-2 h-8 bg-popover text-popover-foreground"
                  />
                </div>
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="startTime">Start Time</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={filters.startTime}
                    onChange={(e) => handleFilterChange("startTime", e.target.value)}
                    className="col-span-2 h-8 bg-popover text-popover-foreground"
                  />
                </div>
                <div className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor="endTime">End Time</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={filters.endTime}
                    onChange={(e) => handleFilterChange("endTime", e.target.value)}
                    className="col-span-2 h-8 bg-popover text-popover-foreground"
                  />
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <Card className="border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Sent To</TableHead>
              <TableHead>Sent By</TableHead>
              <TableHead className="text-right">Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEmails.length > 0 ? (
              filteredEmails.map((email) => (
                <TableRow
                  key={email.uniqueId}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleEmailClick(email)}
                >
                  <TableCell>{email.uniqueId}</TableCell>
                  <TableCell className="font-medium">{email.subject}</TableCell>
                  <TableCell>{email.sentTo}</TableCell>
                  <TableCell>{email.sentBy}</TableCell>
                  <TableCell className="text-right">{new Date(email.timestamp).toLocaleString()}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-4">
                  No emails found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <EmailDialog
        email={selectedEmail}
        open={selectedEmail !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedEmail(null)
        }}
        onFlagClick={handleFlagClick}
      />

      <FlagDialog
        open={isFlagDialogOpen}
        onOpenChange={(open) => {
          setIsFlagDialogOpen(open)
          if (!open) {
            setSelectedEmail(null)
          }
        }}
        onConfirm={handleFlagConfirm}
      />
    </div>
  )
}
