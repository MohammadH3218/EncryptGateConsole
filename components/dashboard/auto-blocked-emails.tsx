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
    <Card className="transition duration-200 hover:border-app-border hover:shadow-[var(--shadow-md)]">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-app-textPrimary">Auto-Blocked Emails</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-2 text-2xl font-bold text-app-textPrimary">{total}</div>
        <p className="mb-4 text-sm text-app-textSecondary">Total blocked</p>

        <div className="space-y-2">
          {data.slice(0, 3).map((email, index) => (
            <div
              key={index}
              className="rounded-2xl border border-white/5 bg-white/[0.04] px-3 py-2 transition duration-200 hover:border-app-ring/60"
            >
              <p className="truncate text-sm font-medium text-app-textPrimary">{email.sender}</p>
              <p className="text-xs text-app-textSecondary">{email.reason}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
