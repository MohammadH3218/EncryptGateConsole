"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Sender {
  id: number
  email: string
  reason: string
  blockedBy?: string
  allowedBy?: string
  timestamp: string
}

interface SenderDialogProps {
  sender: Sender | null
  open: boolean
  onOpenChange: (open: boolean) => void
  type: "blocked" | "allowed"
}

export function SenderDialog({ sender, open, onOpenChange, type }: SenderDialogProps) {
  if (!sender) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{type === "blocked" ? "Blocked Sender" : "Allowed Sender"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium">Email:</span>
            <span className="col-span-3">{sender.email}</span>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium">{type === "blocked" ? "Blocked By:" : "Allowed By:"}</span>
            <span className="col-span-3">{type === "blocked" ? sender.blockedBy : sender.allowedBy}</span>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium">Timestamp:</span>
            <span className="col-span-3">{sender.timestamp}</span>
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <span className="text-sm font-medium">Reason:</span>
            <ScrollArea className="h-[100px] col-span-3 rounded-md border p-4">
              <p className="text-sm">{sender.reason}</p>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
