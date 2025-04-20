"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import type { DetectionTrend } from "@/types/dashboard"

interface SeverityBarChartProps {
  data: DetectionTrend[]
}

export function SeverityBarChart({ data }: SeverityBarChartProps) {
  return (
    <Card className="col-span-2 transition-all duration-300 ease-in-out hover:scale-105 hover:bg-accent hover:shadow-lg group">
      <CardHeader>
        <CardTitle className="group-hover:font-bold">Detection Trends</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/20" />
              <XAxis
                dataKey="date"
                className="text-xs group-hover:font-medium"
                tickFormatter={(value) => new Date(value).toLocaleDateString()}
              />
              <YAxis className="text-xs group-hover:font-medium" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "transparent",
                  border: "none",
                  boxShadow: "none",
                }}
                itemStyle={{
                  color: "hsl(var(--foreground))",
                  fontSize: "12px",
                }}
                labelStyle={{
                  color: "hsl(var(--muted-foreground))",
                  fontSize: "12px",
                  marginBottom: "4px",
                }}
              />
              <Bar dataKey="critical" name="Critical" fill="#ef4444" />
              <Bar dataKey="high" name="High" fill="#f97316" />
              <Bar dataKey="medium" name="Medium" fill="#eab308" />
              <Bar dataKey="low" name="Low" fill="#22c55e" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
