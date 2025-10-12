"use client"

import { useState } from "react"
import { Bell, Clock, AlertCircle, UserCheck, CheckCircle } from "lucide-react"

interface Notification {
  id: number
  type: "detection" | "assignment" | "system"
  title: string
  message: string
  time: string
  unread: boolean
}

export function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: 1,
      type: "detection",
      title: "New Detection",
      message: "A new suspicious email has been detected.",
      time: "2 minutes ago",
      unread: true,
    },
    {
      id: 2,
      type: "assignment",
      title: "Assignment Update",
      message: "You have been assigned to investigate a detection.",
      time: "1 hour ago",
      unread: true,
    },
    {
      id: 3,
      type: "system",
      title: "System Update",
      message: "EncryptGate system has been updated successfully.",
      time: "3 hours ago",
      unread: false,
    },
  ])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2">
        <Bell className="w-4 h-4 text-gray-400" />
        <h3 className="text-white font-medium text-sm">Notifications</h3>
      </div>

      <div className="space-y-2">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`p-2 rounded-lg transition-colors hover:bg-[#1f1f1f] cursor-pointer ${
              notification.unread ? "bg-[#1f1f1f]" : "bg-transparent"
            }`}
          >
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0 mt-0.5">
                {notification.type === "detection" && <AlertCircle className="w-3 h-3 text-red-400" />}
                {notification.type === "assignment" && <UserCheck className="w-3 h-3 text-gray-400" />}
                {notification.type === "system" && <CheckCircle className="w-3 h-3 text-green-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium">{notification.title}</p>
                <p className="text-gray-400 text-xs mt-0.5 line-clamp-2">{notification.message}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Clock className="w-2.5 h-2.5 text-gray-500" />
                  <span className="text-gray-500 text-xs">{notification.time}</span>
                </div>
              </div>
              {notification.unread && <div className="w-1.5 h-1.5 bg-white rounded-full flex-shrink-0 mt-1"></div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
