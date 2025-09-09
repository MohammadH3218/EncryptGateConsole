"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface FlagDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (assignedTo: string[]) => void
}

interface TeamMember {
  id: string
  name: string
  email: string
  preferredUsername: string
}

export function FlagDialog({ open, onOpenChange, onConfirm }: FlagDialogProps) {
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])
  const [openCombobox, setOpenCombobox] = useState(false)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loadingTeamMembers, setLoadingTeamMembers] = useState(false)
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
        } else {
          console.warn('Failed to load team members for flag dialog:', response.statusText)
        }
      } catch (error) {
        console.error('Failed to load team members for flag dialog:', error)
      } finally {
        setLoadingTeamMembers(false)
      }
    }

    if (open) {
      loadTeamMembers()
    }
  }, [open, params.orgId])

  const handleConfirm = () => {
    onConfirm(selectedAssignees)
    setSelectedAssignees([])
  }

  const toggleAssignee = (assignee: string) => {
    setSelectedAssignees((current) =>
      current.includes(assignee) ? current.filter((a) => a !== assignee) : [...current, assignee],
    )
  }

  const removeAssignee = (assigneeToRemove: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedAssignees((current) => current.filter((assignee) => assignee !== assigneeToRemove))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Flag Email</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Assign To</p>
            <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openCombobox}
                  className="w-full justify-between h-9"
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpenCombobox(!openCombobox)
                  }}
                >
                  Select
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] p-0"
                onClick={(e) => e.stopPropagation()}
              >
                <Command>
                  <CommandInput placeholder="Search team members..." />
                  <CommandList>
                    <CommandEmpty>
                      {loadingTeamMembers ? "Loading team members..." : "No team member found."}
                    </CommandEmpty>
                    <CommandGroup>
                      {teamMembers.map((member) => (
                        <CommandItem
                          key={member.id}
                          onSelect={() => toggleAssignee(member.preferredUsername)}
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
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedAssignees.map((assignee) => (
                  <Badge key={assignee} variant="secondary" className="gap-1">
                    {assignee}
                    <button
                      className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      onClick={(e) => removeAssignee(assignee, e)}
                    >
                      <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleConfirm}>Confirm</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
