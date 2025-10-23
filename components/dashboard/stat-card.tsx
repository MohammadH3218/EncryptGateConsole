import type React from "react"
import { Card, CardContent } from "@/components/ui/card"

interface StatCardProps {
  title: string
  value: number
  description: string
  previousValue?: number
  icon?: React.ReactNode
}

export function StatCard({ title, value, description, previousValue, icon }: StatCardProps) {
  const percentageChange = previousValue ? ((value - previousValue) / previousValue) * 100 : 0
  const isPositive = percentageChange > 0
  const isNegative = percentageChange < 0

  return (
    <Card className="transition duration-200 hover:border-app-border hover:shadow-[var(--shadow-md)]">
      <CardContent className="p-6 lg:p-7">
        <div className="text-center">
          {icon && <div className="mb-3 flex justify-center text-app-textSecondary">{icon}</div>}

          <h3 className="mb-2 text-sm font-medium uppercase tracking-wider text-app-textSecondary">{title}</h3>

          <div className="mb-2 flex items-center justify-center gap-2">
            <div className="text-3xl font-bold text-app-textPrimary">{value.toLocaleString()}</div>

            {previousValue && (
              <div
                className={
ounded px-2 py-1 text-sm font-medium }
              >
                {isPositive ? "+" : ""}
                {percentageChange.toFixed(0)}%
              </div>
            )}
          </div>

          <p className="text-sm text-app-textSecondary">{description}</p>

          {previousValue && (
            <p className="mt-1 text-xs text-app-textMuted">Previous week: {previousValue.toLocaleString()}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
