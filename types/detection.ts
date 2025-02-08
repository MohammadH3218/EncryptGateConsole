export interface Detection {
  id: number
  uniqueId: string
  severity: string
  name: string
  status: string
  assignedTo: string[] | string
  sentBy: string
  timestamp: string
  description: string
  indicators: string[]
  recommendations: string[]
  pushedBy?: string
}

