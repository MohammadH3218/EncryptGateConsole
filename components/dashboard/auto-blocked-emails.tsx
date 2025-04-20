"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useCountAnimation } from "@/hooks/use-count-animation"
import { motion } from "framer-motion"

interface AutoBlockedEmailData {
  sender: string
  reason: string
  timestamp: string
}

interface AutoBlockedEmailsProps {
  data: AutoBlockedEmailData[]
  total: number
}

export function AutoBlockedEmails({ data, total }: AutoBlockedEmailsProps) {
  const animatedTotal = useCountAnimation(total)

  return (
    <Card className="h-full bg-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">Auto-Blocked Emails</CardTitle>
      </CardHeader>
      <CardContent>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative"
        >
          <div className="text-3xl font-bold">{animatedTotal.toLocaleString()}</div>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-primary to-transparent w-full origin-left"
          />
        </motion.div>
        <p className="text-sm text-muted-foreground mt-2">Total blocked</p>
      </CardContent>
    </Card>
  )
}