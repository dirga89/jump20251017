import { ProactiveAgent } from './proactive-agent'
import { prisma } from './prisma'
import { GmailService } from './gmail'
import { CalendarService } from './calendar'

/**
 * Background polling service that automatically checks for new emails and calendar events
 * and processes them based on ongoing instructions
 */
export class BackgroundPoller {
  private static instance: BackgroundPoller
  private pollingInterval: NodeJS.Timeout | null = null
  private isPolling = false
  private isPollRunning = false // Track if a poll is currently running
  private pollIntervalMs = 5 * 60 * 1000 // 5 minutes

  private constructor() {}

  static getInstance(): BackgroundPoller {
    if (!BackgroundPoller.instance) {
      BackgroundPoller.instance = new BackgroundPoller()
    }
    return BackgroundPoller.instance
  }

  /**
   * Start polling for all users with ongoing instructions
   */
  start() {
    if (this.isPolling) {
      console.log('⚠️  Background poller already running')
      return
    }

    this.isPolling = true
    console.log('🚀 Background poller started - checking every 5 minutes')

    // Run immediately on start
    this.pollAllUsers()

    // Then run every 5 minutes
    this.pollingInterval = setInterval(() => {
      this.pollAllUsers()
    }, this.pollIntervalMs)
  }

  /**
   * Stop polling
   */
  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
    this.isPolling = false
    console.log('🛑 Background poller stopped')
  }

  /**
   * Poll all users who have active ongoing instructions
   */
  private async pollAllUsers() {
    // Prevent overlapping polls
    if (this.isPollRunning) {
      console.log('⏭️  Poll already running, skipping...')
      return
    }

    this.isPollRunning = true
    try {
      // Get all users with active ongoing instructions
      const users = await prisma.user.findMany({
        where: {
          ongoingInstructions: {
            some: {
              isActive: true
            }
          }
        },
        include: {
          ongoingInstructions: {
            where: { isActive: true }
          },
          accounts: true
        }
      })

      console.log(`🔍 Polling for ${users.length} users with ongoing instructions`)

      for (const user of users) {
        await this.pollUserEmails(user)
        await this.pollUserCalendarEvents(user)
      }
    } catch (error) {
      console.error('Background polling error:', error)
    } finally {
      this.isPollRunning = false
    }
  }

  /**
   * Poll emails for a specific user
   */
  private async pollUserEmails(user: any) {
    try {
      // Check if user has NEW_EMAIL instructions
      const hasEmailInstructions = user.ongoingInstructions.some(
        (i: any) => i.triggerType === 'NEW_EMAIL'
      )

      if (!hasEmailInstructions) {
        return
      }

      // Get Google access token
      const googleAccount = user.accounts.find((acc: any) => acc.provider === 'google')
      if (!googleAccount?.access_token) {
        return
      }

      // Get the last processed email timestamp
      const lastProcessed = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          emails: {
            orderBy: { date: 'desc' },
            take: 1,
            select: { date: true }
          }
        }
      })

      const sinceDate = lastProcessed?.emails[0]?.date || new Date(Date.now() - 24 * 60 * 60 * 1000)

      console.log(`🔍 Checking emails since: ${sinceDate.toISOString()} for ${user.email}`)

      // Fetch new emails from Gmail (pass refresh token for automatic token refresh)
      const gmailService = new GmailService(googleAccount.access_token, googleAccount.refresh_token)
      const newEmails = await gmailService.getNewEmailsSince(sinceDate)

      console.log(`📧 Gmail returned ${newEmails.length} emails for ${user.email}`)

      if (newEmails.length === 0) {
        console.log(`📭 No new emails for ${user.email}`)
        return
      }

      console.log(`📬 Processing ${newEmails.length} new emails for ${user.email}`)

      // Process each new email with proactive agent
      const proactiveAgent = new ProactiveAgent()

      for (const email of newEmails) {
        try {
          // Check if email already exists in database
          const existingEmail = await prisma.email.findFirst({
            where: {
              userId: user.id,
              gmailId: email.id
            }
          })

          if (existingEmail) {
            console.log(`⏭️  Skipping existing email: ${email.subject}`)
            continue
          }

          console.log(`📥 New email detected: "${email.subject}" from ${email.from}`)

          // Save email to database first
          await prisma.email.create({
            data: {
              userId: user.id,
              gmailId: email.id,
              threadId: '',
              subject: email.subject,
              sender: email.from,
              recipient: user.email || '',
              body: email.body || '',
              date: email.date,
              labels: [],
              isRead: false
            }
          })

          // Process with proactive agent
          console.log(`🤖 Processing email with proactive agent...`)
          await proactiveAgent.processNewEmail(user.id, {
            from: email.from,
            subject: email.subject,
            body: email.body || email.snippet || '',
            messageId: email.id
          })

          console.log(`✅ Processed email: ${email.subject}`)
        } catch (error) {
          console.error(`❌ Error processing email ${email.subject}:`, error)
        }
      }
    } catch (error) {
      console.error(`Error polling emails for ${user.email}:`, error)
    }
  }

  /**
   * Poll calendar events for a specific user
   */
  private async pollUserCalendarEvents(user: any) {
    try {
      // Check if user has NEW_CALENDAR_EVENT instructions
      const hasCalendarInstructions = user.ongoingInstructions.some(
        (i: any) => i.triggerType === 'NEW_CALENDAR_EVENT'
      )

      if (!hasCalendarInstructions) {
        return
      }

      // Get Google access token
      const googleAccount = user.accounts.find((acc: any) => acc.provider === 'google')
      if (!googleAccount?.access_token) {
        return
      }

      // Get the last processed calendar event timestamp
      const lastProcessed = await prisma.calendarEvent.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      })

      const sinceDate = lastProcessed?.createdAt || new Date(Date.now() - 24 * 60 * 60 * 1000)

      console.log(`📅 Checking calendar events since: ${sinceDate.toISOString()} for ${user.email}`)

      // Fetch new calendar events
      const calendarService = new CalendarService(googleAccount.access_token, googleAccount.refresh_token)
      const newEvents = await calendarService.syncCalendarEvents(user.id, 7) // Check last 7 days

      console.log(`📆 Synced ${newEvents.count} calendar events for ${user.email}`)

      // Note: The proactive processing happens inside syncCalendarEvents through triggerProactiveInstructions
      // So we don't need to manually process here - it's automatic!
      
    } catch (error) {
      console.error(`Error polling calendar events for ${user.email}:`, error)
    }
  }
}

// Export singleton instance
export const backgroundPoller = BackgroundPoller.getInstance()

