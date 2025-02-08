import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useCountAnimation } from "@/hooks/use-count-animation"
import { motion } from "framer-motion"

interface CompletedDetection {
  id: string
  name: string
  severity: "Critical" | "High" | "Medium" | "Low"
  completedAt: string
}

interface CompletedDetectionsProps {
  detections: CompletedDetection[]
}

export function CompletedDetections({ detections }: CompletedDetectionsProps) {
  const animatedCount = useCountAnimation(detections.length)

  return (
    <Card className="transition-all duration-300 ease-in-out hover:scale-105 hover:bg-accent hover:shadow-lg h-[180px] bg-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">Completed Detections</CardTitle>
      </CardHeader>
      <CardContent>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative"
        >
          <div className="text-3xl font-bold">{animatedCount.toLocaleString()}</div>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-primary to-transparent w-full origin-left"
          />
        </motion.div>
        <p className="text-sm text-muted-foreground mt-2">Completed today</p>
      </CardContent>
    </Card>
  )
}

