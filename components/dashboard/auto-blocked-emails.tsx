import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface AutoBlockedEmail {
  sender: string
  reason: string
  timestamp: string
}

interface AutoBlockedEmailsProps {
  data: AutoBlockedEmail[]
  total: number
}

export function AutoBlockedEmails({ data, total }: AutoBlockedEmailsProps) {
  return (
    <Card className="card text-white transition-all duration-300">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-white">Auto-Blocked Emails</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-2 text-2xl font-bold text-white">{total}</div>
        <p className="mb-4 text-sm text-white/60">Total blocked</p>

        <div className="space-y-2">
          {data.slice(0, 3).map((email, index) => (
            <div
              key={index}
              className="rounded-2xl border border-white/5 bg-white/5 px-3 py-2 transition duration-200 hover:border-blue-400/40"
            >
              <p className="truncate text-sm font-medium text-white">{email.sender}</p>
              <p className="text-xs text-white/60">{email.reason}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
