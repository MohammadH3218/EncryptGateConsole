import { cn } from "@/lib/utils"

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      role="presentation"
      className={cn(
        "relative overflow-hidden rounded-md bg-white/5",
        "animate-shimmer",
        className,
      )}
      style={{
        backgroundImage: "linear-gradient(90deg, transparent, rgba(255,255,255,.06), transparent)",
        backgroundSize: "200% 100%",
      }}
    />
  )
}
