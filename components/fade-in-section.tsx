"use client"

import { motion } from "framer-motion"
import type { ReactNode } from "react"

interface FadeInSectionProps {
  children: ReactNode
  className?: string
}

export function FadeInSection({ children, className }: FadeInSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        ease: [0.25, 0.1, 0.25, 1], // Smooth easing function
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
