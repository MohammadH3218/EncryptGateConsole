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
    <Card className="bg-[#0f0f0f] border-none text-white hover:bg-[#1f1f1f] transition-all duration-300">
      <CardHeader>
        <CardTitle className="text-white">Auto-Blocked Emails</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-white mb-2">{total}</div>
        <p className="text-sm text-gray-400 mb-4">Total blocked</p>

        <div className="space-y-2">
          {data.slice(0, 3).map((email, index) => (
            <div key={index} className="bg-transparent hover:bg-[#1f1f1f] rounded-lg p-2 transition-all duration-300">
              <p className="text-sm font-medium text-white truncate">{email.sender}</p>
              <p className="text-xs text-gray-400">{email.reason}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}