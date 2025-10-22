"use client"

import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

interface KebabItem {
  label: string
  onClick: () => void
}

interface KebabProps {
  items: KebabItem[]
  className?: string
}

export function Kebab({ items, className }: KebabProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          "pressable rounded-md p-2 text-white/80 transition-colors",
          "hover:bg-white/5 focus-visible:outline-none focus-ring",
          className,
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align="end"
        sideOffset={6}
        className="z-50 min-w-[160px] rounded-xl border border-app-border bg-app-panel p-1 shadow-card will-change-transform"
      >
        {items.map((item, index) => (
          <DropdownMenu.Item
            key={index}
            onSelect={item.onClick}
            className="cursor-pointer rounded-md px-3 py-2 text-sm text-white/90 outline-none transition-colors hover:bg-white/5 focus:bg-white/5"
          >
            {item.label}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}
