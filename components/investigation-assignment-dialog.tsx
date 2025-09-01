"use client"

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { AlertTriangle, Users, Clock, Shield } from "lucide-react"
import { ConflictWarning } from '@/lib/user-profile-service'

interface InvestigationAssignmentDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  detection: {
    id: string
    emailSubject?: string
    sender: string
    severity: string
  }
  warnings: ConflictWarning[]
  assignedUsers: string[]
  currentUser: {
    name: string
    email: string
  }
}

export function InvestigationAssignmentDialog({
  isOpen,
  onClose,
  onConfirm,
  detection,
  warnings,
  assignedUsers,
  currentUser
}: InvestigationAssignmentDialogProps) {
  const [isConfirming, setIsConfirming] = useState(false)

  const handleConfirm = async () => {
    setIsConfirming(true)
    await onConfirm()
    setIsConfirming(false)
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

  const hasConflicts = warnings.length > 0

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-[#0f0f0f] border-[#1f1f1f] text-white">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-400" />
            Investigation Assignment
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {hasConflicts ? 
              "There are conflicts with this assignment. Review the details below." :
              "You are about to start investigating this email detection."
            }
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
              </div>
              <Badge className={getSeverityColor(detection.severity)}>
                {detection.severity}
              </Badge>
            </div>
          </div>

          {/* Conflict Warnings */}
          {hasConflicts && (
            <Alert className="bg-yellow-900/20 border-yellow-500/20">
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              <AlertTitle className="text-yellow-400">Assignment Conflicts Detected</AlertTitle>
              <AlertDescription className="text-yellow-200 mt-2">
                {warnings.map((warning, index) => (
                  <div key={index} className="mb-2 last:mb-0">
                    <p className="text-sm">{warning.message}</p>
                    {warning.users.length > 0 && (
                      <div className="flex items-center gap-2 mt-1">
                        <Users className="h-3 w-3" />
                        <span className="text-xs">
                          Current investigators: {warning.users.join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </AlertDescription>
            </Alert>
          )}

          {/* Current Assignment Status */}
          {assignedUsers.length > 0 && (
            <div className="p-3 rounded-lg bg-[#1f1f1f] border border-[#2a2a2a]">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-400">Currently Assigned To:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {assignedUsers.map((user, index) => (
                  <div key={index} className="flex items-center gap-2 bg-[#2a2a2a] px-2 py-1 rounded">
                    <Avatar className="w-5 h-5">
                      <AvatarFallback className="bg-[#1f1f1f] text-white text-xs">
                        {user.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-white">{user}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Your Assignment */}
          <div className="p-3 rounded-lg bg-blue-900/20 border border-blue-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Avatar className="w-6 h-6">
                <AvatarFallback className="bg-blue-600 text-white text-xs">
                  {currentUser.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-blue-200">You ({currentUser.name})</span>
            </div>
            <p className="text-xs text-blue-300">
              {hasConflicts ? 
                "You will be added as an additional investigator for this email." :
                "You will be assigned as the primary investigator for this email."
              }
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={onClose}
            className="bg-[#1f1f1f] border-[#1f1f1f] text-white hover:bg-[#2a2a2a] hover:border-[#2a2a2a]"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={isConfirming}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isConfirming ? (
              <>
                <Clock className="mr-2 h-4 w-4 animate-spin" />
                Assigning...
              </>
            ) : (
              hasConflicts ? "Proceed Anyway" : "Start Investigation"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}