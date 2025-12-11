export interface InvestigationSummary {
  investigationId: string
  emailMessageId: string
  status: string
  priority: string
  severity?: string
  description?: string
  createdAt: string
}

export interface EmailDetails {
  messageId: string
  subject: string
  sender: string
  recipients: string[]
  timestamp: string
  body: string
  htmlBody?: string
  headers?: Record<string, string>
  attachments?: Array<{ filename: string; size?: number }>
  direction?: string
  status?: string
  size?: number
  cc?: string[]
  urls?: string[]
  flaggedCategory?: string
  flaggedSeverity?: string
  investigationStatus?: string
  threatLevel?: string
}
