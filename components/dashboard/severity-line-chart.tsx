"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import type { DetectionTrend } from "@/types/dashboard"
import { TimeframeSelector } from "./timeframe-selector"
import { useCallback, useEffect, useRef, useState } from "react"

interface SeverityLineChartProps {
  data: DetectionTrend[]
  timeframe: string
  onTimeframeChange: (value: string) => void
}

// Function to sample data points based on container width
function sampleData(data: DetectionTrend[], containerWidth: number): DetectionTrend[] {
  const minSpaceBetweenPoints = 50
  const maxPoints = Math.floor(containerWidth / minSpaceBetweenPoints)

  if (data.length <= maxPoints) {
    return data
  }

  const samplingRate = Math.ceil(data.length / maxPoints)
  return data.filter((_, index) => index % samplingRate === 0)
}

export function SeverityLineChart({ data, timeframe, onTimeframeChange }: SeverityLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [sampledData, setSampledData] = useState(data)

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth)
      }
    }

    updateWidth()
    window.addEventListener("resize", updateWidth)
    return () => window.removeEventListener("resize", updateWidth)
  }, [])

  useEffect(() => {
    setSampledData(sampleData(data, containerWidth))
  }, [data, containerWidth])

  const formatDate = useCallback(
    (dateStr: string) => {
      const date = new Date(dateStr)

      switch (timeframe) {
        case "today":
          return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        case "week":
          return date.toLocaleDateString([], { weekday: "short" })
        case "month":
          return date.getDate().toString()
        case "year-to-date":
          return date.toLocaleDateString([], { month: "short" })
        case "all-time":
          return date.toLocaleDateString([], { month: "short", year: "2-digit" })
        default:
          return date.toLocaleDateString()
      }
    },
    [timeframe],
  )

  const getTickInterval = useCallback(() => {
    const dataLength = sampledData.length
    if (dataLength <= 6) return 0
    if (dataLength <= 12) return 1
    return Math.floor(dataLength / 6)
  }, [sampledData.length])

  return (
    <Card className="col-span-2 hover:bg-accent hover:shadow-lg group">
      <CardHeader className="flex flex-row items-center justify-between py-6">
        <CardTitle className="text-base">Detection Trends</CardTitle>
        <TimeframeSelector value={timeframe} onChange={onTimeframeChange} />
      </CardHeader>
      <CardContent className="pb-6">
        <div className="h-[320px]" ref={containerRef}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sampledData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/20" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                interval={getTickInterval()}
                className="text-xs group-hover:font-medium"
                angle={timeframe === "all-time" ? -45 : 0}
                textAnchor={timeframe === "all-time" ? "end" : "middle"}
                height={timeframe === "all-time" ? 60 : 30}
              />
              <YAxis
                className="text-xs group-hover:font-medium"
                allowDecimals={false}
                domain={["auto", "auto"]}
                padding={{ top: 20, bottom: 20 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  padding: "8px",
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
                labelFormatter={(label) => formatDate(label)}
              />
              <Legend
                verticalAlign="top"
                height={36}
                wrapperStyle={{
                  fontSize: "12px",
                  paddingTop: "8px",
                }}
              />
              <Line
                type="monotone"
                dataKey="critical"
                name="Critical"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#ef4444" }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="high"
                name="High"
                stroke="#f97316"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#f97316" }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="medium"
                name="Medium"
                stroke="#eab308"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#eab308" }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="low"
                name="Low"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#22c55e" }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
