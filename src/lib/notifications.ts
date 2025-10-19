import { prisma } from './prisma'

export type NotificationType = 
  | 'NEW_CONTACT_CREATED'
  | 'NEW_EMAIL_PROCESSED'
  | 'TASK_COMPLETED'
  | 'TASK_FAILED'
  | 'CALENDAR_EVENT_CREATED'
  | 'HUBSPOT_TOKEN_EXPIRED'
  | 'GOOGLE_TOKEN_EXPIRED'
  | 'PROACTIVE_ACTION'
  | 'ERROR'

export type NotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'

export class NotificationService {
  /**
   * Create a new notification for the user
   */
  static async create(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    severity: NotificationSeverity = 'INFO',
    metadata?: any
  ) {
    try {
      return await prisma.notification.create({
        data: {
          userId,
          type,
          title,
          message,
          severity,
          metadata: metadata || {}
        }
      })
    } catch (error) {
      console.error('Error creating notification:', error)
      // Don't throw - notifications are non-critical
      return null
    }
  }

  /**
   * Get unread notifications for a user
   */
  static async getUnread(userId: string, limit: number = 20) {
    return await prisma.notification.findMany({
      where: {
        userId,
        isRead: false
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit
    })
  }

  /**
   * Get all notifications for a user
   */
  static async getAll(userId: string, limit: number = 50) {
    return await prisma.notification.findMany({
      where: {
        userId
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit
    })
  }

  /**
   * Mark notifications as read
   */
  static async markAsRead(notificationIds: string[]) {
    return await prisma.notification.updateMany({
      where: {
        id: { in: notificationIds }
      },
      data: {
        isRead: true
      }
    })
  }

  /**
   * Mark all notifications as read for a user
   */
  static async markAllAsRead(userId: string) {
    return await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false
      },
      data: {
        isRead: true
      }
    })
  }

  /**
   * Delete old read notifications (cleanup)
   */
  static async deleteOld(userId: string, daysOld: number = 30) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)

    return await prisma.notification.deleteMany({
      where: {
        userId,
        isRead: true,
        createdAt: {
          lt: cutoffDate
        }
      }
    })
  }
}

