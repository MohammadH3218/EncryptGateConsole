"use client"

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Mail, User, Clock, Paperclip, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmailData {
  messageId: string
  subject: string
  sender: string
  recipients: string[]
  timestamp: string
  body?: string
  htmlBody?: string
  headers?: Record<string, string>
  attachments?: { filename: string; size?: number }[]
  flagged?: boolean
  malicious?: boolean
}

interface EmailPreviewDialogProps {
  emailId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onInvestigate?: (emailId: string) => void
}

export function EmailPreviewDialog({
  emailId,
  open,
  onOpenChange,
  onInvestigate
}: EmailPreviewDialogProps) {
  const [email, setEmail] = useState<EmailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && emailId) {
      loadEmail(emailId)
    } else {
      setEmail(null)
      setError(null)
    }
  }, [open, emailId])

  async function loadEmail(id: string) {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/email/${encodeURIComponent(id)}`)

      if (!response.ok) {
        throw new Error(`Failed to load email: ${response.statusText}`)
      }

      const data = await response.json()
      setEmail(data)
    } catch (err: any) {
      console.error('Failed to load email:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-neutral-900 border-neutral-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-neutral-100">
            <Mail className="w-5 h-5 text-blue-500" />
            Email Preview
          </DialogTitle>
          <DialogDescription className="text-neutral-400">
            {emailId ? `Message ID: ${emailId}` : 'No email selected'}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-4">
            <p className="text-red-300 text-sm">Error: {error}</p>
          </div>
        )}

        {!loading && !error && email && (
          <div className="space-y-4">
            {/* Header Info */}
            <div className="bg-neutral-800/50 rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-neutral-100">
                      {email.subject || '(No subject)'}
                    </h3>
                    {email.flagged && (
                      <Badge variant="outline" className="border-yellow-500 text-yellow-500">
                        Flagged
                      </Badge>
                    )}
                    {email.malicious && (
                      <Badge variant="outline" className="border-red-500 text-red-500">
                        Malicious
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-neutral-400">
                    <div className="flex items-center gap-1.5">
                      <User className="w-4 h-4" />
                      <span className="font-mono">{email.sender}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      <span>{new Date(email.timestamp).toLocaleString()}</span>
                    </div>
                    {email.attachments && email.attachments.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Paperclip className="w-4 h-4" />
                        <span>{email.attachments.length} attachment(s)</span>
                      </div>
                    )}
                  </div>

                  <div className="text-sm text-neutral-400">
                    <strong>To:</strong> {email.recipients?.join(', ') || 'N/A'}
                  </div>
                </div>

                {onInvestigate && (
                  <Button
                    size="sm"
                    onClick={() => {
                      onInvestigate(email.messageId)
                      onOpenChange(false)
                    }}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <ExternalLink className="w-4 h-4 mr-1.5" />
                    Open Investigation
                  </Button>
                )}
              </div>
            </div>

            {/* Content Tabs */}
            <Tabs defaultValue="body" className="w-full">
              <TabsList className="bg-neutral-800">
                <TabsTrigger value="body">Email Body</TabsTrigger>
                <TabsTrigger value="html">HTML</TabsTrigger>
                <TabsTrigger value="headers">Headers</TabsTrigger>
                {email.attachments && email.attachments.length > 0 && (
                  <TabsTrigger value="attachments">
                    Attachments ({email.attachments.length})
                  </TabsTrigger>
                )}
              </TabsList>

              <ScrollArea className="h-[400px] mt-4">
                <TabsContent value="body" className="mt-0">
                  <div className="bg-neutral-800/30 rounded-lg p-4">
                    <pre className="text-sm text-neutral-300 whitespace-pre-wrap font-mono">
                      {email.body || 'No text content available'}
                    </pre>
                  </div>
                </TabsContent>

                <TabsContent value="html" className="mt-0">
                  <div className="bg-neutral-800/30 rounded-lg p-4">
                    {email.htmlBody ? (
                      <div
                        className="text-sm"
                        dangerouslySetInnerHTML={{ __html: email.htmlBody }}
                      />
                    ) : (
                      <p className="text-neutral-400 text-sm">No HTML content available</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="headers" className="mt-0">
                  <div className="bg-neutral-800/30 rounded-lg p-4">
                    {email.headers ? (
                      <pre className="text-xs text-neutral-300 whitespace-pre-wrap font-mono">
                        {JSON.stringify(email.headers, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-neutral-400 text-sm">No headers available</p>
                    )}
                  </div>
                </TabsContent>

                {email.attachments && email.attachments.length > 0 && (
                  <TabsContent value="attachments" className="mt-0">
                    <div className="bg-neutral-800/30 rounded-lg p-4 space-y-2">
                      {email.attachments.map((att, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-neutral-900 rounded border border-neutral-700"
                        >
                          <div className="flex items-center gap-3">
                            <Paperclip className="w-4 h-4 text-neutral-400" />
                            <div>
                              <p className="text-sm font-medium text-neutral-200">
                                {att.filename}
                              </p>
                              {att.size && (
                                <p className="text-xs text-neutral-500">
                                  {(att.size / 1024).toFixed(2)} KB
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                )}
              </ScrollArea>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
