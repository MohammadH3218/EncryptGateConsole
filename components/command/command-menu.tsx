"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

function useOrgIdFromPathname(pathname: string) {
  const segments = pathname.split("/").filter(Boolean)
  if (segments[0] === "o" && segments[1]) {
    return segments[1]
  }
  return null
}

export function CommandMenu() {
  const router = useRouter()
  const pathname = usePathname()
  const orgId = useOrgIdFromPathname(pathname)

  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const go = React.useCallback(
    (path: string) => {
      setOpen(false)
      const destination =
        orgId && path.startsWith("/")
          ? `/o/${orgId}${path === "/" ? "" : path}`
          : path
      router.push(destination)
    },
    [router, orgId],
  )

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages or actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go("/admin/dashboard")}>
            Dashboard
          </CommandItem>
          <CommandItem onSelect={() => go("/admin/all-emails")}>
            All Emails
          </CommandItem>
          <CommandItem onSelect={() => go("/admin/detections")}>
            Detections
          </CommandItem>
          <CommandItem onSelect={() => go("/admin/assignments")}>
            Assignments
          </CommandItem>
          <CommandItem onSelect={() => go("/admin/user-settings/profile")}>
            Profile Settings
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Quick actions">
          <CommandItem onSelect={() => go("/admin/all-emails?filter=unread")}>
            Filter unread emails
          </CommandItem>
          <CommandItem
            onSelect={() => go("/admin/detections?severity=critical")}
          >
            Show critical detections
          </CommandItem>
          <CommandItem onSelect={() => go("/admin/detections?status=new")}>
            Show new detections
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
