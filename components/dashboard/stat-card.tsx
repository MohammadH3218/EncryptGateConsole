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
    <Card className="rounded-3xl border border-white/10 bg-black/40 text-white transition-all duration-300 hover:border-blue-400/40 hover:shadow-[0_0_35px_rgba(37,99,235,0.15)]">
      <CardContent className="p-6 lg:p-7">
        <div className="text-center">
          {icon && <div className="flex justify-center mb-3 text-white/70">{icon}</div>}

          <h3 className="text-white/70 text-sm font-medium mb-2 uppercase tracking-wider">{title}</h3>

          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="text-3xl font-bold text-white">{value.toLocaleString()}</div>

            {previousValue && (
              <div
                className={`text-sm font-medium px-2 py-1 rounded ${
                  isPositive
                    ? "text-green-400 bg-green-400/10"
                    : isNegative
                      ? "text-red-400 bg-red-400/10"
                      : "text-white/60"
                }`}
              >
                {isPositive ? "+" : ""}
                {percentageChange.toFixed(0)}%
              </div>
            )}
          </div>

          <p className="text-white/60 text-sm">{description}</p>

          {previousValue && (
            <p className="text-white/40 text-xs mt-1">Previous week: {previousValue.toLocaleString()}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
