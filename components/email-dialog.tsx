"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Email {
  id: number
  uniqueId: string
  subject: string
  sentTo: string
  sentBy: string
  timestamp: string
  body: string
}

interface EmailDialogProps {
  email: Email | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onFlagClick: () => void
}

export function EmailDialog({ email, open, onOpenChange, onFlagClick }: EmailDialogProps) {
  if (!email) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{email.subject}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium">ID:</span>
            <span className="col-span-3">{email.uniqueId}</span>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium">From:</span>
            <span className="col-span-3">{email.sentBy}</span>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium">To:</span>
            <span className="col-span-3">{email.sentTo}</span>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium">Date:</span>
            <span className="col-span-3">{email.timestamp}</span>
          </div>
          <ScrollArea className="h-[200px] w-full rounded-md border p-4">
            <pre className="text-sm whitespace-pre-wrap">{email.body}</pre>
          </ScrollArea>
        </div>
        <div className="flex justify-end">
          <Button onClick={onFlagClick}>Flag</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
