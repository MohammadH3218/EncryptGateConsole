"use client"

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Role } from '@/types/roles'
import { useToast } from '@/components/ui/use-toast'
import { Mail, Loader2 } from 'lucide-react'

interface InviteUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roles: Role[]
  onInviteSent?: () => void
}

export function InviteUserDialog({ 
  open, 
  onOpenChange, 
  roles, 
  onInviteSent 
}: InviteUserDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    roleIds: [] as string[]
  })

  const handleRoleToggle = (roleId: string) => {
    setFormData(prev => ({
      ...prev,
      roleIds: prev.roleIds.includes(roleId)
        ? prev.roleIds.filter(id => id !== roleId)
        : [...prev.roleIds, roleId]
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.email || formData.roleIds.length === 0) {
      toast({
        title: 'Missing Information',
        description: 'Please provide an email and select at least one role',
        variant: 'destructive'
      })
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          invitedBy: 'Security Administrator' // This should come from current user context
        })
      })

      if (response.ok) {
        toast({
          title: 'Invitation Sent!',
          description: `An invitation has been sent to ${formData.email}`,
        })
        
        // Reset form
        setFormData({
          email: '',
          name: '',
          roleIds: []
        })
        
        onOpenChange(false)
        onInviteSent?.()
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to send invitation')
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send invitation',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const sortedRoles = [...roles].sort((a, b) => b.priority - a.priority)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-[#0f0f0f] border-[#2a2a2a] text-white">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-400" />
            <DialogTitle className="text-white">Invite New User</DialogTitle>
          </div>
          <DialogDescription className="text-gray-400">
            Send an invitation to join your security team. They'll receive an email with setup instructions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-white">Email Address *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="user@company.com"
              required
              className="bg-[#1f1f1f] border-[#2a2a2a] text-white placeholder:text-gray-400 focus:bg-[#2a2a2a] focus:border-blue-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name" className="text-white">Full Name (Optional)</Label>
            <Input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="John Doe"
              className="bg-[#1f1f1f] border-[#2a2a2a] text-white placeholder:text-gray-400 focus:bg-[#2a2a2a] focus:border-blue-500"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-white">Select Roles *</Label>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {sortedRoles.map((role) => (
                <div key={role.id} className="flex items-start space-x-3">
                  <Checkbox
                    id={role.id}
                    checked={formData.roleIds.includes(role.id)}
                    onCheckedChange={() => handleRoleToggle(role.id)}
                    className="mt-1"
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label
                      htmlFor={role.id}
                      className="text-sm font-medium leading-none cursor-pointer"
                      style={{ color: role.color }}
                    >
                      {role.name}
                      {role.priority >= 900 && ' 👑'}
                    </label>
                    <p className="text-xs text-gray-400">{role.description}</p>
                    <div className="flex gap-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
                        Priority: {role.priority}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-700 text-blue-300">
                        {role.permissions.length} permissions
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {formData.roleIds.length === 0 && (
            <Alert className="bg-yellow-900/20 border-yellow-500/20">
              <AlertDescription className="text-yellow-300">
                Please select at least one role for the user
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="bg-[#1f1f1f] border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !formData.email || formData.roleIds.length === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Sending...
                </>
              ) : (
                'Send Invitation'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}