"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"

export interface Notification {
  id: string;
  orgId: string;
  userId: string;
  type: 'critical_email' | 'pushed_request' | 'assignment' | 'detection' | 'system_update' | 'weekly_report';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  data?: any; // Additional data specific to notification type
}

export function useNotifications() {
  const params = useParams()
  const orgId = params.orgId as string
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)

  // Get userId from localStorage (from JWT token)
  const getUserId = useCallback(() => {
    try {
      const decode = (t: string) => JSON.parse(atob(t.split(".")[1]));
      const idTok = localStorage.getItem("id_token");
      const accTok = localStorage.getItem("access_token");
      const payload = idTok ? decode(idTok) : accTok ? decode(accTok) : {};

      return payload.sub || payload["cognito:username"] || payload.username || "";
    } catch {
      return "";
    }
  }, [])

  const fetchNotifications = useCallback(async (includeRead: boolean = true) => {
    if (!orgId) return
    
    const userId = getUserId()
    if (!userId) return

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        includeRead: includeRead.toString(),
        limit: '100'
      })

      const res = await fetch(`/api/notifications?${params}`, {
        headers: {
          'x-org-id': orgId,
          'x-user-id': userId,
        }
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || `HTTP ${res.status}: Failed to load notifications`)
      }
      
      const data = await res.json()
      setNotifications(data.notifications || [])
      setUnreadCount(data.unreadCount || 0)
    } catch (err) {
      console.error('❌ Error fetching notifications:', err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [orgId, getUserId])

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!orgId) return
    
    const userId = getUserId()
    if (!userId) return

    try {
      const res = await fetch(`/api/notifications/${notificationId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': orgId,
          'x-user-id': userId,
        },
        body: JSON.stringify({ isRead: true })
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Failed to mark notification as read')
      }

      // Update local state
      setNotifications(prev => prev.map(notif => 
        notif.id === notificationId 
          ? { ...notif, isRead: true }
          : notif
      ))
      setUnreadCount(prev => Math.max(0, prev - 1))
      
    } catch (err) {
      console.error('❌ Error marking notification as read:', err)
      throw err
    }
  }, [orgId, getUserId])

  const markAsUnread = useCallback(async (notificationId: string) => {
    if (!orgId) return
    
    const userId = getUserId()
    if (!userId) return

    try {
      const res = await fetch(`/api/notifications/${notificationId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': orgId,
          'x-user-id': userId,
        },
        body: JSON.stringify({ isRead: false })
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Failed to mark notification as unread')
      }

      // Update local state
      setNotifications(prev => prev.map(notif => 
        notif.id === notificationId 
          ? { ...notif, isRead: false }
          : notif
      ))
      setUnreadCount(prev => prev + 1)
      
    } catch (err) {
      console.error('❌ Error marking notification as unread:', err)
      throw err
    }
  }, [orgId, getUserId])

  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!orgId) return
    
    const userId = getUserId()
    if (!userId) return

    try {
      const res = await fetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE',
        headers: {
          'x-org-id': orgId,
          'x-user-id': userId,
        },
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Failed to delete notification')
      }

      // Update local state
      const deletedNotification = notifications.find(n => n.id === notificationId)
      setNotifications(prev => prev.filter(notif => notif.id !== notificationId))
      
      if (deletedNotification && !deletedNotification.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1))
      }
      
    } catch (err) {
      console.error('❌ Error deleting notification:', err)
      throw err
    }
  }, [orgId, getUserId, notifications])

  const deleteSelected = useCallback(async (notificationIds: string[]) => {
    if (!orgId || notificationIds.length === 0) return
    
    const userId = getUserId()
    if (!userId) return

    try {
      const res = await fetch(`/api/notifications?ids=${notificationIds.join(',')}`, {
        method: 'DELETE',
        headers: {
          'x-org-id': orgId,
          'x-user-id': userId,
        },
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Failed to delete notifications')
      }

      // Update local state
      const deletedNotifications = notifications.filter(n => notificationIds.includes(n.id))
      const unreadDeleted = deletedNotifications.filter(n => !n.isRead).length
      
      setNotifications(prev => prev.filter(notif => !notificationIds.includes(notif.id)))
      setUnreadCount(prev => Math.max(0, prev - unreadDeleted))
      
    } catch (err) {
      console.error('❌ Error deleting selected notifications:', err)
      throw err
    }
  }, [orgId, getUserId, notifications])

  const clearAll = useCallback(async () => {
    if (!orgId) return
    
    const userId = getUserId()
    if (!userId) return

    try {
      const res = await fetch('/api/notifications?clearAll=true', {
        method: 'DELETE',
        headers: {
          'x-org-id': orgId,
          'x-user-id': userId,
        },
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Failed to clear all notifications')
      }

      // Update local state
      setNotifications([])
      setUnreadCount(0)
      
    } catch (err) {
      console.error('❌ Error clearing all notifications:', err)
      throw err
    }
  }, [orgId, getUserId])

  const createNotification = useCallback(async (notification: Omit<Notification, 'id' | 'orgId' | 'createdAt' | 'isRead'>) => {
    if (!orgId) return
    
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-org-id': orgId,
        },
        body: JSON.stringify(notification)
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Failed to create notification')
      }

      // Refresh notifications to get the new one
      await fetchNotifications()
      
    } catch (err) {
      console.error('❌ Error creating notification:', err)
      throw err
    }
  }, [orgId, fetchNotifications])

  const refresh = useCallback(() => {
    return fetchNotifications()
  }, [fetchNotifications])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  // Get only unread notifications for activity sidebar
  const unreadNotifications = notifications.filter(n => !n.isRead)

  return {
    notifications,
    unreadNotifications,
    loading,
    error,
    unreadCount,
    refresh,
    markAsRead,
    markAsUnread,
    deleteNotification,
    deleteSelected,
    clearAll,
    createNotification,
  }
}