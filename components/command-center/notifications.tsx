"use client"

import { useState, useEffect } from "react"
import { Bell, Clock, AlertCircle, UserCheck, CheckCircle } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

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

  // Fetch real notifications from API
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const response = await fetch("/api/notifications")
        if (response.ok) {
          const data = await response.json()
          if (data.notifications && Array.isArray(data.notifications)) {
            setNotifications(data.notifications)
          }
        }
      } catch (error) {
        console.log("[Notifications] Failed to fetch notifications:", error)
        // Keep mock data on error
      }
    }

    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000) // Poll every 30 seconds
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2 text-white/70">
        <Bell className="w-4 h-4" />
        <h3 className="text-xs font-semibold uppercase tracking-wide">Notifications</h3>
      </div>

      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {notifications.map((notification, index) => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              className={`rounded-xl border border-app-border/60 bg-app-surface/60 px-3 py-2 transition-all duration-200 hover:bg-white/5 hover:border-app-border hover:shadow-md ${
                notification.unread ? "ring-1 ring-app-ring/40" : ""
              }`}
            >
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0 mt-0.5">
                {notification.type === "detection" && <AlertCircle className="w-3 h-3 text-red-400" />}
                {notification.type === "assignment" && <UserCheck className="w-3 h-3 text-gray-400" />}
                {notification.type === "system" && <CheckCircle className="w-3 h-3 text-green-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white/90">{notification.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-white/60">{notification.message}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Clock className="w-2.5 h-2.5 text-white/40" />
                  <span className="text-xs text-white/40">{notification.time}</span>
                </div>
              </div>
              {notification.unread && <div className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400 animate-pulse" />}
            </div>
          </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
