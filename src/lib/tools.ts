import { GmailService } from './gmail'
import { HubSpotService } from './hubspot'
import { CalendarService } from './calendar'
import { RAGService } from './rag'
import { prisma } from './prisma'

export interface Tool {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, any>
    required: string[]
  }
}

export interface ToolCall {
  name: string
  arguments: Record<string, any>
}

export class ToolService {
  private gmail: GmailService
  private hubspot: HubSpotService
  private calendar: CalendarService
  private rag: RAGService

  constructor(
    gmailAccessToken: string,
    hubspotAccessToken: string,
    calendarAccessToken: string,
    gmailRefreshToken?: string,
    calendarRefreshToken?: string
  ) {
    this.gmail = new GmailService(gmailAccessToken, gmailRefreshToken)
    this.hubspot = new HubSpotService(hubspotAccessToken)
    this.calendar = new CalendarService(calendarAccessToken, calendarRefreshToken)
    this.rag = new RAGService()
  }

  getAvailableTools(): Tool[] {
    // Get current date for tool descriptions
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]
    const year = now.getFullYear()
    
    return [
      {
        name: 'search_emails',
        description: 'Search through user emails for specific information',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for emails'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of emails to return',
              default: 5
            }
          },
          required: ['query']
        }
      },
      {
        name: 'get_recent_emails',
        description: 'Get the most recent emails, optionally filtered by date. Use this for "today\'s emails", "recent emails", "emails from last week", etc.',
        parameters: {
          type: 'object',
          properties: {
            daysBack: {
              type: 'number',
              description: 'Number of days to look back (0 = today only, 1 = yesterday and today, 7 = last week)',
              default: 1
            },
            limit: {
              type: 'number',
              description: 'Maximum number of emails to return',
              default: 10
            }
          },
          required: []
        }
      },
      {
        name: 'search_contacts',
        description: 'Search through HubSpot contacts. Returns contacts with their hubspotId field (use this ID for add_contact_note)',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for contacts'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of contacts to return',
              default: 5
            }
          },
          required: ['query']
        }
      },
      {
        name: 'search_contact_notes',
        description: 'Search through contact notes for specific information',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for contact notes'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of notes to return',
              default: 5
            }
          },
          required: ['query']
        }
      },
      {
        name: 'send_email',
        description: 'Send an email to a recipient',
        parameters: {
          type: 'object',
          properties: {
            to: {
              type: 'string',
              description: 'Recipient email address'
            },
            subject: {
              type: 'string',
              description: 'Email subject'
            },
            body: {
              type: 'string',
              description: 'Email body content'
            },
            htmlBody: {
              type: 'string',
              description: 'HTML email body (optional)'
            }
          },
          required: ['to', 'subject', 'body']
        }
      },
      {
        name: 'create_contact',
        description: 'Create a new contact in HubSpot',
        parameters: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              description: 'Contact email address'
            },
            firstName: {
              type: 'string',
              description: 'Contact first name'
            },
            lastName: {
              type: 'string',
              description: 'Contact last name'
            },
            phone: {
              type: 'string',
              description: 'Contact phone number'
            },
            company: {
              type: 'string',
              description: 'Contact company'
            },
            jobTitle: {
              type: 'string',
              description: 'Contact job title'
            },
            notes: {
              type: 'string',
              description: 'Additional notes about the contact'
            }
          },
          required: ['email']
        }
      },
      {
        name: 'add_contact_note',
        description: 'Add a note to an existing contact in HubSpot',
        parameters: {
          type: 'object',
          properties: {
            contactId: {
              type: 'string',
              description: 'HubSpot contact ID'
            },
            note: {
              type: 'string',
              description: 'Note content to add'
            }
          },
          required: ['contactId', 'note']
        }
      },
      {
        name: 'create_calendar_event',
        description: 'Create a new calendar event',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Event title'
            },
            description: {
              type: 'string',
              description: 'Event description'
            },
            startTime: {
              type: 'string',
              description: 'Event start time (ISO string)'
            },
            endTime: {
              type: 'string',
              description: 'Event end time (ISO string)'
            },
            attendees: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of attendee email addresses'
            },
            location: {
              type: 'string',
              description: 'Event location'
            }
          },
          required: ['title', 'startTime', 'endTime']
        }
      },
      {
        name: 'find_available_time_slots',
        description: 'Find available time slots for scheduling',
        parameters: {
          type: 'object',
          properties: {
            duration: {
              type: 'number',
              description: 'Duration in minutes',
              default: 60
            },
            daysAhead: {
              type: 'number',
              description: 'Number of days to look ahead',
              default: 7
            }
          },
          required: []
        }
      },
      {
        name: 'get_upcoming_events',
        description: 'Get upcoming calendar events (future only)',
        parameters: {
          type: 'object',
          properties: {
            maxResults: {
              type: 'number',
              description: 'Maximum number of events to return',
              default: 10
            }
          },
          required: []
        }
      },
      {
        name: 'search_calendar_events',
        description: `Search calendar events by date range. CRITICAL: We are in year ${year}. Current date is ${todayStr}. Use this for queries like "today's meetings", "meetings this week", "past meetings", or any date-specific queries. ALWAYS use year ${year}, NOT 2023 or 2024!`,
        parameters: {
          type: 'object',
          properties: {
            startDate: {
              type: 'string',
              description: `Start date in ISO format. MUST use year ${year}! For "today" use "${todayStr}T00:00:00Z". Example: "${todayStr}T00:00:00Z"`
            },
            endDate: {
              type: 'string',
              description: `End date in ISO format. MUST use year ${year}! For "today" use "${todayStr}T23:59:59Z". Example: "${todayStr}T23:59:59Z"`
            },
            maxResults: {
              type: 'number',
              description: 'Maximum number of events to return',
              default: 50
            }
          },
          required: ['startDate', 'endDate']
        }
      },
      {
        name: 'create_task',
        description: 'Create a new task for the agent to complete',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Task title'
            },
            description: {
              type: 'string',
              description: 'Task description'
            },
            priority: {
              type: 'string',
              enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
              description: 'Task priority level',
              default: 'MEDIUM'
            },
            context: {
              type: 'object',
              description: 'Additional context for the task'
            }
          },
          required: ['title', 'description']
        }
      },
      {
        name: 'update_task_status',
        description: 'Update the status of an existing task',
        parameters: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'Task ID to update'
            },
            status: {
              type: 'string',
              enum: ['PENDING', 'IN_PROGRESS', 'WAITING_FOR_RESPONSE', 'COMPLETED', 'FAILED', 'CANCELLED'],
              description: 'New task status'
            },
            result: {
              type: 'string',
              description: 'Task result or outcome'
            },
            error: {
              type: 'string',
              description: 'Error message if task failed'
            }
          },
          required: ['taskId', 'status']
        }
      },
      {
        name: 'save_ongoing_instruction',
        description: 'Save a persistent instruction that the AI should always follow (e.g., "always create contacts from new emails")',
        parameters: {
          type: 'object',
          properties: {
            instruction: {
              type: 'string',
              description: 'The instruction to remember'
            },
            triggerType: {
              type: 'string',
              enum: ['NEW_EMAIL', 'NEW_CONTACT', 'NEW_CALENDAR_EVENT', 'EMAIL_RESPONSE', 'CALENDAR_RESPONSE', 'HUBSPOT_UPDATE'],
              description: 'When this instruction should be applied'
            }
          },
          required: ['instruction', 'triggerType']
        }
      },
      {
        name: 'list_ongoing_instructions',
        description: 'Get all active ongoing instructions',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    ]
  }

  async executeTool(userId: string, toolCall: ToolCall): Promise<any> {
    try {
      switch (toolCall.name) {
        case 'search_emails':
          // Try RAG search first, fall back to Gmail API search
          try {
            const ragResults = await this.rag.searchEmails(userId, toolCall.arguments.query, toolCall.arguments.limit || 5)
            if (Array.isArray(ragResults) && ragResults.length > 0) {
              return ragResults
            }
          } catch (error) {
            console.log('RAG search failed, using Gmail API fallback:', error)
          }
          // Fallback to Gmail API direct search
          return await this.gmail.searchEmails(userId, toolCall.arguments.query, toolCall.arguments.limit || 10)

        case 'get_recent_emails':
          const daysBack = toolCall.arguments.daysBack || 1
          const startDate = new Date()
          startDate.setDate(startDate.getDate() - daysBack)
          startDate.setHours(0, 0, 0, 0)
          
          const emails = await prisma.email.findMany({
            where: {
              userId,
              date: {
                gte: startDate
              }
            },
            orderBy: {
              date: 'desc'
            },
            take: toolCall.arguments.limit || 10,
            select: {
              id: true,
              subject: true,
              sender: true,
              body: true,
              date: true
            }
          })
          
          return emails

        case 'search_contacts':
          return await this.rag.searchContacts(userId, toolCall.arguments.query, toolCall.arguments.limit || 5)

        case 'search_contact_notes':
          return await this.rag.searchContactNotes(userId, toolCall.arguments.query, toolCall.arguments.limit || 5)

        case 'send_email':
          return await this.gmail.sendEmail(
            toolCall.arguments.to,
            toolCall.arguments.subject,
            toolCall.arguments.body,
            toolCall.arguments.htmlBody
          )

        case 'create_contact':
          // Check if trying to create contact for the user themselves
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true }
          })
          
          if (user && toolCall.arguments.email === user.email) {
            return {
              error: 'Cannot create contact for yourself',
              message: 'This is your own email address. Contacts should only be created for other people.'
            }
          }
          
          return await this.hubspot.createContact(userId, toolCall.arguments)

        case 'add_contact_note':
          return await this.hubspot.addContactNote(
            toolCall.arguments.contactId,
            toolCall.arguments.note
          )

        case 'create_calendar_event':
          return await this.calendar.createEvent(userId, {
            title: toolCall.arguments.title,
            description: toolCall.arguments.description,
            startTime: new Date(toolCall.arguments.startTime),
            endTime: new Date(toolCall.arguments.endTime),
            attendees: toolCall.arguments.attendees,
            location: toolCall.arguments.location
          })

        case 'find_available_time_slots':
          return await this.calendar.findAvailableTimeSlots(
            userId,
            toolCall.arguments.duration || 60,
            toolCall.arguments.daysAhead || 7
          )

        case 'get_upcoming_events':
          return await this.calendar.getUpcomingEvents(userId, toolCall.arguments.maxResults || 10)

        case 'search_calendar_events':
          const eventStartDate = new Date(toolCall.arguments.startDate)
          const eventEndDate = new Date(toolCall.arguments.endDate)
          
          return await prisma.calendarEvent.findMany({
            where: {
              userId,
              startTime: {
                gte: eventStartDate,
                lte: eventEndDate
              }
            },
            orderBy: { startTime: 'asc' },
            take: toolCall.arguments.maxResults || 50,
            select: {
              id: true,
              title: true,
              description: true,
              startTime: true,
              endTime: true,
              location: true,
              attendees: true
            }
          })

        case 'create_task':
          return await prisma.task.create({
            data: {
              userId,
              title: toolCall.arguments.title,
              description: toolCall.arguments.description,
              priority: toolCall.arguments.priority || 'MEDIUM',
              context: toolCall.arguments.context || {},
              status: 'PENDING'
            }
          })

        case 'update_task_status':
          return await prisma.task.update({
            where: { id: toolCall.arguments.taskId },
            data: {
              status: toolCall.arguments.status,
              result: toolCall.arguments.result,
              error: toolCall.arguments.error,
              completedAt: toolCall.arguments.status === 'COMPLETED' ? new Date() : undefined
            }
          })

        case 'save_ongoing_instruction':
          return await prisma.ongoingInstruction.create({
            data: {
              userId,
              instruction: toolCall.arguments.instruction,
              triggerType: toolCall.arguments.triggerType,
              isActive: true
            }
          })

        case 'list_ongoing_instructions':
          return await prisma.ongoingInstruction.findMany({
            where: { userId, isActive: true },
            orderBy: { createdAt: 'desc' }
          })

        default:
          throw new Error(`Unknown tool: ${toolCall.name}`)
      }
    } catch (error) {
      console.error(`Error executing tool ${toolCall.name}:`, error)
      throw error
    }
  }
}
