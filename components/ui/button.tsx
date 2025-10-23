import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]",
  {
    variants: {
      variant: {
        default:
          "bg-app-accent text-white shadow-[0_4px_12px_rgba(59,130,246,0.35)] hover:bg-app-accentHover focus-visible:ring-app-accent/60 active:bg-app-accentActive",
        destructive:
          "bg-app-danger text-white hover:bg-[#dc2626] focus-visible:ring-app-danger/60",
        outline:
          "border border-app-border bg-transparent text-app-textPrimary hover:border-app-ring hover:bg-app-ring/10",
        secondary:
          "bg-white/10 text-app-textPrimary hover:bg-white/15",
        ghost:
          "text-app-textSecondary hover:bg-white/10",
        link: "text-app-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-11 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
