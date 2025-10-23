"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

interface ChartDataPoint {
  day: string
  value: number
}

interface InteractiveLineChartProps {
  title: string
  data: ChartDataPoint[]
  color?: string
}

export function InteractiveLineChart({ title, data, color = "#3B82F6" }: InteractiveLineChartProps) {
  return (
    <Card className="transition duration-200 hover:border-app-border hover:shadow-[var(--shadow-md)]">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-app-textPrimary">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2C2C2C" opacity={0.4} />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#B0B0B0", fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#B0B0B0", fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1E1E1E",
                  border: "1px solid #2C2C2C",
                  borderRadius: "12px",
                  color: "#E0E0E0",
                  boxShadow: "var(--shadow-md)",
                }}
                labelStyle={{ color: "#B0B0B0" }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={{ fill: color, strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: color, strokeWidth: 2, fill: "#ffffff" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
