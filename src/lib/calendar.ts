import { google } from 'googleapis'
import { prisma } from './prisma'

export class CalendarService {
  private oauth2Client: any
  private calendar: any

  constructor(accessToken: string, refreshToken?: string) {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL + '/api/auth/callback/google'
    )

    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    })

    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client })
  }

  async syncCalendarEvents(userId: string, daysAhead: number = 30) {
    try {
      const now = new Date()
      const future = new Date()
      future.setDate(now.getDate() + daysAhead)

      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: future.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 100
      })

      const events = response.data.items || []
      
      for (const event of events) {
        await this.syncEvent(userId, event)
      }

      return { success: true, count: events.length }
    } catch (error) {
      console.error('Calendar sync error:', error)
      throw error
    }
  }

  private async syncEvent(userId: string, googleEvent: any) {
    try {
      const startTime = new Date(googleEvent.start?.dateTime || googleEvent.start?.date)
      const endTime = new Date(googleEvent.end?.dateTime || googleEvent.end?.date)
      
      const attendees = googleEvent.attendees?.map((a: any) => a.email) || []

      // Check if this is a new event or update
      const existingEvent = await prisma.calendarEvent.findUnique({
        where: { googleId: googleEvent.id }
      })

      const isNewEvent = !existingEvent

      // Check if this is a new event or update
      const existingEvent = await prisma.calendarEvent.findUnique({
        where: { googleId: googleEvent.id }
      })

      const isNewEvent = !existingEvent

      await prisma.calendarEvent.upsert({
        where: { googleId: googleEvent.id },
        update: {
          title: googleEvent.summary || 'No Title',
          description: googleEvent.description,
          startTime,
          endTime,
          attendees,
          location: googleEvent.location,
          status: googleEvent.status
        },
        create: {
          userId,
          googleId: googleEvent.id,
          title: googleEvent.summary || 'No Title',
          description: googleEvent.description,
          startTime,
          endTime,
          attendees,
          location: googleEvent.location,
          status: googleEvent.status
        }
      })

      // If this is a new event, trigger proactive instruction execution
      if (isNewEvent) {
        console.log(`🆕 New calendar event detected: ${googleEvent.summary}`)
        await this.triggerProactiveInstructions(userId, {
          title: googleEvent.summary || 'No Title',
          startTime,
          endTime,
          attendees
        })
      }

    } catch (error) {
      console.error(`Error syncing event ${googleEvent.id}:`, error)
    }
  }

  private async triggerProactiveInstructions(userId: string, eventData: any) {
    try {
      // Dynamically import to avoid circular dependency
      const { ProactiveAgent } = await import('./proactive-agent')
      const agent = new ProactiveAgent()

      console.log(`🔔 Triggering proactive instructions for new calendar event`)
      
      // Process the new calendar event with proactive agent
      await agent.processNewCalendarEvent(userId, eventData)
    } catch (error) {
      console.error('Error triggering proactive instructions:', error)
    }
  }

  async createEvent(userId: string, eventData: {
    title: string
    description?: string
    startTime: Date
    endTime: Date
    attendees?: string[]
    location?: string
  }) {
    try {
      const event = {
        summary: eventData.title,
        description: eventData.description,
        start: {
          dateTime: eventData.startTime.toISOString(),
          timeZone: 'UTC',
        },
        end: {
          dateTime: eventData.endTime.toISOString(),
          timeZone: 'UTC',
        },
        attendees: eventData.attendees?.map(email => ({ email })),
        location: eventData.location,
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 10 },
          ],
        },
      }

      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        sendUpdates: 'all'
      })

      // Sync the new event to our database
      await this.syncEvent(userId, response.data)

      return { success: true, eventId: response.data.id }
    } catch (error) {
      console.error('Create event error:', error)
      throw error
    }
  }

  async findAvailableTimeSlots(userId: string, duration: number = 60, daysAhead: number = 7) {
    try {
      const now = new Date()
      const future = new Date()
      future.setDate(now.getDate() + daysAhead)

      const response = await this.calendar.freebusy.query({
        resource: {
          timeMin: now.toISOString(),
          timeMax: future.toISOString(),
          items: [{ id: 'primary' }]
        }
      })

      const busyTimes = response.data.calendars?.primary?.busy || []
      const availableSlots = []

      // Simple algorithm to find available slots
      let current = new Date(now)
      current.setHours(9, 0, 0, 0) // Start at 9 AM

      const endOfDay = new Date(current)
      endOfDay.setHours(17, 0, 0, 0) // End at 5 PM

      while (current < future) {
        const slotEnd = new Date(current.getTime() + duration * 60000)
        
        // Check if this slot conflicts with busy times
        const conflicts = busyTimes.some((busy: any) => {
          const busyStart = new Date(busy.start)
          const busyEnd = new Date(busy.end)
          return (current < busyEnd && slotEnd > busyStart)
        })

        if (!conflicts && slotEnd <= endOfDay) {
          availableSlots.push({
            start: new Date(current),
            end: new Date(slotEnd)
          })
        }

        current = new Date(current.getTime() + 30 * 60000) // Check every 30 minutes
      }

      return availableSlots.slice(0, 10) // Return top 10 available slots
    } catch (error) {
      console.error('Find available time slots error:', error)
      throw error
    }
  }

  async getUpcomingEvents(userId: string, maxResults: number = 10) {
    try {
      return await prisma.calendarEvent.findMany({
        where: {
          userId,
          startTime: {
            gte: new Date()
          }
        },
        orderBy: { startTime: 'asc' },
        take: maxResults
      })
    } catch (error) {
      console.error('Get upcoming events error:', error)
      throw error
    }
  }

  async searchEvents(userId: string, query: string, maxResults: number = 10) {
    try {
      return await prisma.calendarEvent.findMany({
        where: {
          userId,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { attendees: { has: query } }
          ]
        },
        take: maxResults,
        orderBy: { startTime: 'desc' }
      })
    } catch (error) {
      console.error('Search events error:', error)
      throw error
    }
  }
}
