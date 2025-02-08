"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDetections } from "@/contexts/DetectionsContext"

interface FlagDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (assignedTo: string[]) => void
}

// Example team members - in a real app this would come from your backend
const teamMembers = ["Alice Johnson", "Bob Smith", "Charlie Brown", "Diana Prince"]

export function FlagDialog({ open, onOpenChange, onConfirm }: FlagDialogProps) {
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])
  const [openCombobox, setOpenCombobox] = useState(false)
  const { addNotification } = useDetections()

  const handleConfirm = () => {
    onConfirm(selectedAssignees)
    if (selectedAssignees.length > 0) {
      addNotification(`Email assigned to ${selectedAssignees.join(", ")}`)
    }
    setSelectedAssignees([])
  }

  const toggleAssignee = (assignee: string) => {
    setSelectedAssignees((current) =>
      current.includes(assignee) ? current.filter((a) => a !== assignee) : [...current, assignee],
    )
  }

  const removeAssignee = (assigneeToRemove: string) => {
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
                  className="w-full justify-between"
                >
                  Select team members
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Search team members..." />
                  <CommandList>
                    <CommandEmpty>No team member found.</CommandEmpty>
                    <CommandGroup>
                      {teamMembers.map((member) => (
                        <CommandItem key={member} onSelect={() => toggleAssignee(member)}>
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedAssignees.includes(member) ? "opacity-100" : "opacity-0",
                            )}
                          />
                          {member}
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
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          removeAssignee(assignee)
                        }
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                      onClick={() => removeAssignee(assignee)}
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

