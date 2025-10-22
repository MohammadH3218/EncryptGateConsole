"use client"

import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

interface InteractiveCardProps {
  children: React.ReactNode
  className?: string
}

export function InteractiveCard({ children, className }: InteractiveCardProps) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <motion.div
      whileHover={
        prefersReducedMotion
          ? undefined
          : {
              scale: 1.01,
              transition: { duration: 0.12, ease: "easeOut" },
            }
      }
      className={cn("card p-4 transition-transform duration-150", className)}
    >
      {children}
    </motion.div>
  )
}
