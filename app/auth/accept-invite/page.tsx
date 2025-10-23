"use client"

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Shield, CheckCircle, XCircle } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

interface Invitation {
  id: string
  email: string
  name: string
  roleIds: string[]
  invitedBy: string
  invitedAt: string
  expiresAt: string
}

function AcceptInviteContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  
  const [formData, setFormData] = useState({
    name: '',
    password: '',
    confirmPassword: ''
  })

  const token = searchParams.get('token')

  useEffect(() => {
    if (token) {
      validateInvitation()
    } else {
      setError('No invitation token provided')
      setLoading(false)
    }
  }, [token])

  const validateInvitation = async () => {
    try {
      const response = await fetch(`/api/auth/accept-invite?token=${token}`)
      if (response.ok) {
        const data = await response.json()
        setInvitation(data.invitation)
        setFormData(prev => ({
          ...prev,
          name: data.invitation.name || ''
        }))
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Invalid invitation')
      }
    } catch (err) {
      setError('Failed to validate invitation')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (formData.password !== formData.confirmPassword) {
      toast({
        title: 'Password Mismatch',
        description: 'Passwords do not match',
        variant: 'destructive'
      })
      return
    }

    if (formData.password.length < 8) {
      toast({
        title: 'Password Too Short',
        description: 'Password must be at least 8 characters long',
        variant: 'destructive'
      })
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          name: formData.name,
          password: formData.password
        })
      })

      if (response.ok) {
        setSuccess(true)
        toast({
          title: 'Account Created!',
          description: 'Your account has been created successfully. You can now sign in.'
        })
        
        // Redirect to login after 3 seconds
        setTimeout(() => {
          router.push('/login')
        }, 3000)
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to create account')
      }
    } catch (err) {
      setError('Failed to create account')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center">
        <Card className="w-full max-w-md bg-app-surface border-app-border">
          <CardContent className="pt-6 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
            <span className="ml-2 text-app-textPrimary">Validating invitation...</span>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center">
        <Card className="w-full max-w-md bg-app-surface border-app-border">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
              <XCircle className="h-6 w-6 text-red-500" />
            </div>
            <CardTitle className="text-app-textPrimary">Invitation Invalid</CardTitle>
            <CardDescription className="text-app-textSecondary">
              {error}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => router.push('/login')} 
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center">
        <Card className="w-full max-w-md bg-app-surface border-app-border">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
            <CardTitle className="text-app-textPrimary">Account Created!</CardTitle>
            <CardDescription className="text-app-textSecondary">
              Welcome to EncryptGate Security Console. You'll be redirected to the login page shortly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => router.push('/login')} 
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              Go to Login Now
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-[#0f0f0f] border-[#2a2a2a]">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center mb-4">
            <Shield className="h-6 w-6 text-blue-500" />
          </div>
          <CardTitle className="text-white">Join EncryptGate</CardTitle>
          <CardDescription className="text-gray-400">
            You've been invited by {invitation?.invitedBy || 'an administrator'} to join the security team
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {invitation && (
            <div className="mb-6 p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <div className="text-sm text-app-textSecondary">
                <div><strong>Email:</strong> {invitation.email}</div>
                <div><strong>Invited by:</strong> {invitation.invitedBy}</div>
                <div><strong>Expires:</strong> {new Date(invitation.expiresAt).toLocaleDateString()}</div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-app-textPrimary">Full Name</Label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter your full name"
                required
                className="bg-app-elevated border-app-border text-app-textPrimary placeholder:text-app-textMuted focus:bg-app-overlay focus:border-app-accent"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-app-textPrimary">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                placeholder="Choose a strong password"
                required
                minLength={8}
                className="bg-app-elevated border-app-border text-app-textPrimary placeholder:text-app-textMuted focus:bg-app-overlay focus:border-app-accent"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-white">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                placeholder="Confirm your password"
                required
                minLength={8}
                className="bg-app-elevated border-app-border text-app-textPrimary placeholder:text-app-textMuted focus:bg-app-overlay focus:border-app-accent"
              />
            </div>

            {error && (
              <Alert variant="destructive" className="bg-red-900/20 border-red-500/20">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button 
              type="submit" 
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating Account...
                </>
              ) : (
                'Create Account & Join Team'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense 
      fallback={
        <div className="min-h-screen bg-app flex items-center justify-center">
          <Card className="w-full max-w-md bg-app-surface border-app-border">
            <CardContent className="pt-6 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
              <span className="ml-2 text-app-textPrimary">Loading...</span>
            </CardContent>
          </Card>
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  )
}