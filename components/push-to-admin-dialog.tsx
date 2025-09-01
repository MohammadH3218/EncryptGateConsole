"use client"

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, ArrowUp, Shield } from "lucide-react"

interface PushToAdminDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (reason: string, category: string) => Promise<void>
  detection: {
    id: string
    emailSubject?: string
    sender: string
    severity: string
  }
  currentUser: {
    name: string
    email: string
  }
}

export function PushToAdminDialog({
  isOpen,
  onClose,
  onConfirm,
  detection,
  currentUser
}: PushToAdminDialogProps) {
  const [reason, setReason] = useState("")
  const [category, setCategory] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<{reason?: string, category?: string}>({})

  const handleSubmit = async () => {
    const newErrors: {reason?: string, category?: string} = {}
    
    if (!reason.trim()) {
      newErrors.reason = "Please provide a reason for escalation"
    }
    
    if (!category) {
      newErrors.category = "Please select an escalation category"
    }

    setErrors(newErrors)
    
    if (Object.keys(newErrors).length > 0) {
      return
    }

    setIsSubmitting(true)
    try {
      await onConfirm(reason, category)
      setReason("")
      setCategory("")
      setErrors({})
    } catch (error) {
      console.error("Failed to push to admin:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'bg-red-600 text-white'
      case 'high':
        return 'bg-orange-500 text-white'
      case 'medium':
        return 'bg-yellow-500 text-white'
      case 'low':
        return 'bg-green-500 text-white'
      default:
        return 'bg-gray-500 text-white'
    }
  }

  const escalationCategories = [
    { value: "complexity", label: "Complex Investigation Required" },
    { value: "resources", label: "Need Additional Resources" },
    { value: "expertise", label: "Requires Specialized Expertise" },
    { value: "policy", label: "Policy Decision Needed" },
    { value: "legal", label: "Legal/Compliance Concern" },
    { value: "urgent", label: "Urgent Administrative Action" },
    { value: "other", label: "Other (specify in reason)" }
  ]

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-[#0f0f0f] border-[#1f1f1f] text-white">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <ArrowUp className="h-5 w-5 text-orange-400" />
            Escalate to Admin
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            This will escalate the investigation to administrators for review and additional action.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Detection Details */}
          <div className="p-3 rounded-lg bg-[#1f1f1f] border border-[#2a2a2a]">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h4 className="font-medium text-white truncate">
                  {detection.emailSubject || "Email Investigation"}
                </h4>
                <p className="text-sm text-gray-400 truncate">From: {detection.sender}</p>
                <p className="text-xs text-gray-500 mt-1">Escalated by: {currentUser.name}</p>
              </div>
              <Badge className={getSeverityColor(detection.severity)}>
                {detection.severity}
              </Badge>
            </div>
          </div>

          {/* Category Selection */}
          <div className="space-y-2">
            <Label htmlFor="category" className="text-white">
              Escalation Category <span className="text-red-400">*</span>
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] focus:bg-[#2a2a2a] focus:border-[#2a2a2a]">
                <SelectValue placeholder="Select escalation reason" />
              </SelectTrigger>
              <SelectContent className="bg-[#1f1f1f] border-[#1f1f1f] text-white">
                {escalationCategories.map((cat) => (
                  <SelectItem 
                    key={cat.value} 
                    value={cat.value}
                    className="hover:bg-[#2a2a2a] focus:bg-[#2a2a2a]"
                  >
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && (
              <p className="text-sm text-red-400">{errors.category}</p>
            )}
          </div>

          {/* Reason Text Area */}
          <div className="space-y-2">
            <Label htmlFor="reason" className="text-white">
              Detailed Reason <span className="text-red-400">*</span>
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this investigation needs admin attention. Include any specific challenges, concerns, or actions needed..."
              className="min-h-[100px] bg-[#1f1f1f] border-[#1f1f1f] text-white placeholder:text-gray-400 focus:bg-[#2a2a2a] focus:border-[#2a2a2a] resize-none"
              maxLength={500}
            />
            <div className="flex justify-between">
              {errors.reason && (
                <p className="text-sm text-red-400">{errors.reason}</p>
              )}
              <p className="text-xs text-gray-500 ml-auto">
                {reason.length}/500 characters
              </p>
            </div>
          </div>

          {/* Warning Notice */}
          <div className="p-3 rounded-lg bg-orange-900/20 border border-orange-500/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-400 mt-0.5" />
              <div>
                <p className="text-sm text-orange-200 font-medium">Admin Escalation Notice</p>
                <p className="text-xs text-orange-300 mt-1">
                  This investigation will be removed from your active list and transferred to administrators. 
                  You'll be notified of any decisions or actions taken.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={onClose}
            disabled={isSubmitting}
            className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {isSubmitting ? (
              <>
                <Shield className="mr-2 h-4 w-4 animate-spin" />
                Escalating...
              </>
            ) : (
              <>
                <ArrowUp className="mr-2 h-4 w-4" />
                Escalate to Admin
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}