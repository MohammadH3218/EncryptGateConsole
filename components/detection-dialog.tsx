"use client"

import type React from "react"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { cn } from "@/lib/utils"

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

interface DetectionDialogProps {
  detection: Detection | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onAssign: (id: number, assignedTo: string[], action: "assign" | "unassign") => void
}

interface TeamMember {
  id: string
  name: string
  email: string
  preferredUsername: string
}

export function DetectionDialog({ detection, open, onOpenChange, onAssign }: DetectionDialogProps) {
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])
  const [openCombobox, setOpenCombobox] = useState(false)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loadingTeamMembers, setLoadingTeamMembers] = useState(false)
  const router = useRouter()
  const params = useParams()

  // Load Security Team Users from API
  useEffect(() => {
    const loadTeamMembers = async () => {
      if (!params.orgId) return
      
      setLoadingTeamMembers(true)
      try {
        const response = await fetch('/api/company-settings/users', {
          headers: {
            'x-org-id': params.orgId as string
          }
        })
        
        if (response.ok) {
          const data = await response.json()
          const users = (data.users || []).map((user: any) => ({
            id: user.email,
            name: user.name || user.email,
            email: user.email,
            preferredUsername: user.name || user.email.split('@')[0]
          }))
          setTeamMembers(users)
          console.log('✅ Loaded team members for assignment dialog:', users.length)
        } else {
          console.warn('Failed to load team members:', response.statusText)
        }
      } catch (error) {
        console.error('Failed to load team members:', error)
      } finally {
        setLoadingTeamMembers(false)
      }
    }

    if (open) {
      loadTeamMembers()
    }
  }, [open, params.orgId])

  if (!detection) return null

  const handleAssign = (action: "assign" | "unassign") => {
    if (action === "assign" && selectedAssignees.length > 0) {
      onAssign(detection.id, selectedAssignees, "assign")
    } else if (action === "unassign" && Array.isArray(detection.assignedTo) && detection.assignedTo.length > 0) {
      onAssign(detection.id, [], "unassign")
    }
    onOpenChange(false)
  }

  const handleInvestigateClick = () => {
    const isAdmin = window.location.pathname.includes("/admin")
    const baseRoute = isAdmin ? "/admin" : "/employee"
    router.push(`${baseRoute}/investigate/${detection.id}`)
    onOpenChange(false)
  }

  const toggleAssignee = (assignee: string) => {
    setSelectedAssignees((current) =>
      current.includes(assignee) ? current.filter((a) => a !== assignee) : [...current, assignee],
    )
  }

  const removeAssignee = (assigneeToRemove: string, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedAssignees((current) => current.filter((assignee) => assignee !== assigneeToRemove))
  }

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{detection.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium">ID:</span>
            <span className="col-span-3">{detection.uniqueId}</span>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium">Severity:</span>
            <span className="col-span-3">
              <Badge className={cn("w-16", getSeverityBadgeClass(detection.severity))}>{detection.severity}</Badge>
            </span>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium">Status:</span>
            <span className="col-span-3">{detection.status}</span>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium">Assigned To:</span>
            <span className="col-span-3">
              {Array.isArray(detection.assignedTo) && detection.assignedTo.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {detection.assignedTo.map((assignee) => (
                    <Badge key={assignee} variant="secondary">
                      {assignee}
                    </Badge>
                  ))}
                </div>
              ) : (
                "Unassigned"
              )}
            </span>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium">Sent By:</span>
            <span className="col-span-3">{detection.sentBy}</span>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium">Timestamp:</span>
            <span className="col-span-3">{detection.timestamp}</span>
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <span className="text-sm font-medium">Assign To:</span>
            <div className="col-span-3 space-y-2">
              <Popover
                open={openCombobox}
                onOpenChange={(open) => {
                  // Prevent event propagation issues
                  setOpenCombobox(open)
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openCombobox}
                    className="w-full justify-between h-9"
                    disabled={loadingTeamMembers || teamMembers.length === 0}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setOpenCombobox(!openCombobox)
                    }}
                  >
                    {loadingTeamMembers 
                      ? "Loading..." 
                      : teamMembers.length === 0 
                        ? "No team members found"
                        : "Select team member"
                    }
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] p-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Command onClick={(e) => e.stopPropagation()}>
                    <CommandInput placeholder="Search team members..." onClick={(e) => e.stopPropagation()} />
                    <CommandList>
                      <CommandEmpty>
                        {loadingTeamMembers ? "Loading team members..." : "No team member found."}
                      </CommandEmpty>
                      <CommandGroup>
                        {teamMembers.map((member) => (
                          <CommandItem
                            key={member.id}
                            onSelect={(e) => {
                              toggleAssignee(member.preferredUsername)
                              e.stopPropagation()
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedAssignees.includes(member.preferredUsername) ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <div>
                              <div className="font-medium">{member.preferredUsername}</div>
                              <div className="text-xs text-muted-foreground">{member.email}</div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedAssignees.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedAssignees.map((assignee) => (
                    <Badge key={assignee} variant="secondary" className="gap-1">
                      {assignee}
                      <button
                        className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        onClick={(event) => removeAssignee(assignee, event)}
                      >
                        <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {Array.isArray(detection.assignedTo) && detection.assignedTo.length > 0 && (
            <Button variant="destructive" onClick={() => handleAssign("unassign")}>
              Unassign
            </Button>
          )}
          <Button onClick={() => handleAssign("assign")} disabled={selectedAssignees.length === 0}>
            Assign
          </Button>
          <Button onClick={handleInvestigateClick}>Investigate</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
