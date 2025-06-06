"use client"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { AlertTriangle, CheckCircle2, Clock, Shield, BellRing } from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface TeamMember {
  id: string
  name: string
  role: string
  status: "online" | "away" | "offline" | "busy"
  avatar: string
  activity?: {
    type: "detection" | "email" | "monitoring"
    description: string
    time: string
  }
}

const teamMembers: TeamMember[] = [
  {
    id: "1",
    name: "Alice Johnson",
    role: "Security Admin",
    status: "online",
    avatar: "/placeholder.svg?height=40&width=40",
    activity: {
      type: "detection",
      description: "Investigating phishing attempt",
      time: "10m",
    },
  },
  {
    id: "2",
    name: "Bob Smith",
    role: "IT Specialist",
    status: "online",
    avatar: "/placeholder.svg?height=40&width=40",
    activity: {
      type: "email",
      description: "Reviewing flagged emails",
      time: "15m",
    },
  },
  {
    id: "3",
    name: "Charlie Brown",
    role: "Security Analyst",
    status: "busy",
    avatar: "/placeholder.svg?height=40&width=40",
    activity: {
      type: "detection",
      description: "Analyzing malware sample",
      time: "30m",
    },
  },
  {
    id: "4",
    name: "Diana Prince",
    role: "Team Lead",
    status: "away",
    avatar: "/placeholder.svg?height=40&width=40",
  },
  {
    id: "5",
    name: "Evan Williams",
    role: "IT Support",
    status: "offline",
    avatar: "/placeholder.svg?height=40&width=40",
  },
  {
    id: "6",
    name: "Frank Castle",
    role: "Security Engineer",
    status: "online",
    avatar: "/placeholder.svg?height=40&width=40",
    activity: {
      type: "monitoring",
      description: "Monitoring network traffic",
      time: "45m",
    },
  },
]

interface TeamActivitySidebarProps {
  className?: string
  isCollapsed: boolean
  onToggle: () => void
  notificationsCount?: number
}

export function TeamActivitySidebar({
  className,
  isCollapsed,
  onToggle,
  notificationsCount = 0,
}: TeamActivitySidebarProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
        return "bg-green-500"
      case "away":
        return "bg-yellow-500"
      case "busy":
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "detection":
        return <AlertTriangle className="h-4 w-4 text-red-500" />
      case "email":
        return <CheckCircle2 className="h-4 w-4 text-blue-500" />
      case "monitoring":
        return <Shield className="h-4 w-4 text-green-500" />
      default:
        return <Clock className="h-4 w-4 text-gray-500" />
    }
  }

  // Filter online and busy members first
  const sortedMembers = [...teamMembers].sort((a, b) => {
    if ((a.status === "online" || a.status === "busy") && b.status !== "online" && b.status !== "busy") return -1
    if ((b.status === "online" || b.status === "busy") && a.status !== "online" && a.status !== "busy") return 1
    return 0
  })

  if (isCollapsed) {
    return null
  }

  return (
    <TooltipProvider>
      <div className={cn("w-64 border-l bg-background", className)}>
        <div className="flex h-14 items-center justify-between border-b px-4">
          <h2 className="text-lg font-semibold">Team Activity</h2>
          <Button variant="ghost" size="icon" className="relative">
            <BellRing className="h-5 w-5" />
            {notificationsCount > 0 && (
              <Badge
                variant="destructive"
                className="h-4 w-4 absolute -top-1 -right-1 flex items-center justify-center text-[10px] p-0"
              >
                {notificationsCount > 99 ? "99+" : notificationsCount}
              </Badge>
            )}
          </Button>
        </div>

        {notificationsCount > 0 && (
          <div className="p-4 border-b">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">NOTIFICATIONS</h3>
            <div className="space-y-3">
              <div className="bg-accent/50 p-3 rounded-md">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">New Detection</p>
                    <p className="text-xs text-muted-foreground">A new suspicious email has been detected.</p>
                    <p className="text-xs text-muted-foreground mt-1">2 minutes ago</p>
                  </div>
                </div>
              </div>
              {notificationsCount > 1 && (
                <div className="bg-accent/50 p-3 rounded-md">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Assignment Update</p>
                      <p className="text-xs text-muted-foreground">
                        You have been assigned to investigate a detection.
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">1 hour ago</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <ScrollArea className="h-[calc(100vh-3.5rem-1px)]">
          <div className="p-4">
            <div className="mb-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">ACTIVE NOW</h3>
              {sortedMembers
                .filter((member) => member.status === "online" || member.status === "busy")
                .map((member) => (
                  <Popover key={member.id}>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-3 py-2 cursor-pointer hover:bg-accent rounded-md px-2 w-full text-left">
                        <div className="relative">
                          <Avatar>
                            <AvatarImage src={member.avatar} alt={member.name} />
                            <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span
                            className={cn(
                              "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background",
                              getStatusColor(member.status),
                            )}
                          />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{member.name}</p>
                        </div>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="left" align="start" className="w-72">
                      <div className="flex items-start gap-3">
                        <Avatar>
                          <AvatarImage src={member.avatar} alt={member.name} />
                          <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="space-y-1">
                          <p className="font-medium">{member.name}</p>
                          <p className="text-sm text-muted-foreground">{member.role}</p>
                          <div className="flex items-center gap-1 text-xs">
                            <span className={cn("h-2 w-2 rounded-full", getStatusColor(member.status))}></span>
                            <span className="capitalize">{member.status}</span>
                          </div>
                        </div>
                      </div>
                      {member.activity && (
                        <div className="mt-3">
                          <p className="text-sm font-medium mb-1">Current Activity</p>
                          <div className="flex items-center gap-2 rounded-md bg-muted p-2 text-sm">
                            {getActivityIcon(member.activity.type)}
                            <span>{member.activity.description}</span>
                            <span className="ml-auto text-xs text-muted-foreground">{member.activity.time}</span>
                          </div>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                ))}
            </div>

            <Separator className="my-2" />

            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">TEAM MEMBERS</h3>
              {sortedMembers
                .filter((member) => member.status !== "online" && member.status !== "busy")
                .map((member) => (
                  <Popover key={member.id}>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-3 py-2 cursor-pointer hover:bg-accent rounded-md px-2 w-full text-left">
                        <div className="relative">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={member.avatar} alt={member.name} />
                            <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span
                            className={cn(
                              "absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-background",
                              getStatusColor(member.status),
                            )}
                          />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{member.name}</p>
                        </div>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="left" align="start" className="w-72">
                      <div className="flex items-start gap-3">
                        <Avatar>
                          <AvatarImage src={member.avatar} alt={member.name} />
                          <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="space-y-1">
                          <p className="font-medium">{member.name}</p>
                          <p className="text-sm text-muted-foreground">{member.role}</p>
                          <div className="flex items-center gap-1 text-xs">
                            <span className={cn("h-2 w-2 rounded-full", getStatusColor(member.status))}></span>
                            <span className="capitalize">{member.status}</span>
                          </div>
                        </div>
                      </div>
                      {member.activity && (
                        <div className="mt-3">
                          <p className="text-sm font-medium mb-1">Current Activity</p>
                          <div className="flex items-center gap-2 rounded-md bg-muted p-2 text-sm">
                            {getActivityIcon(member.activity.type)}
                            <span>{member.activity.description}</span>
                            <span className="ml-auto text-xs text-muted-foreground">{member.activity.time}</span>
                          </div>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                ))}
            </div>
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  )
}
