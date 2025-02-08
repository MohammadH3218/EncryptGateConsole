import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import type { Detection } from "@/types/detection"
import { cn } from "@/lib/utils"

interface DetectionDialogProps {
  detection: Detection | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onAssign: (id: number, assignedTo: string[], action: "assign" | "unassign") => void
}

const teamMembers = ["Alice Johnson", "Bob Smith", "Charlie Brown", "Diana Prince"]

export function DetectionDialog({ detection, open, onOpenChange, onAssign }: DetectionDialogProps) {
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])
  const [openCombobox, setOpenCombobox] = useState(false)
  const router = useRouter()

  if (!detection) return null

  const handleAssign = (action: "assign" | "unassign") => {
    if (action === "assign" && selectedAssignees.length > 0) {
      onAssign(detection.id, selectedAssignees, "assign")
    } else if (action === "unassign" && detection.assignedTo.length > 0) {
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

  const removeAssignee = (assigneeToRemove: string) => {
    setSelectedAssignees((current) => current.filter((assignee) => assignee !== assigneeToRemove))
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
              <Badge
                variant={
                  detection.severity === "Critical"
                    ? "destructive"
                    : detection.severity === "High"
                      ? "orange"
                      : detection.severity === "Medium"
                        ? "yellow"
                        : detection.severity === "Low"
                          ? "green"
                          : detection.severity === "Flagged"
                            ? "flagged"
                            : "default"
                }
                className="w-16"
              >
                {detection.severity}
              </Badge>
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
                <div className="flex flex-wrap gap-2">
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

