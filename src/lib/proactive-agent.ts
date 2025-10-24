import { OpenAI } from 'openai'
import { ToolService } from './tools'
import { prisma } from './prisma'
import { NotificationService } from './notifications'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export class ProactiveAgent {
  /**
   * Process a new email and decide if any actions should be taken based on ongoing instructions
   */
  async processNewEmail(userId: string, emailData: {
    from: string
    subject: string
    body: string
    messageId: string
  }) {
    try {
      // Get user with tokens
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          accounts: true
        }
      })

      if (!user) return

      // Extract email from "Name <email@domain.com>" format
      const extractEmail = (from: string) => {
        const match = from.match(/<([^>]+)>/)
        return match ? match[1] : from
      }

      const senderEmail = extractEmail(emailData.from).toLowerCase()
      const userEmail = user.email.toLowerCase()

      // Skip processing if email is from the user themselves
      if (senderEmail === userEmail) {
        console.log(`⏭️  Skipping self-sent email from ${senderEmail}`)
        return
      }

      // Get Google access token from accounts
      const googleAccount = user.accounts.find(acc => acc.provider === 'google')
      if (!googleAccount?.access_token) return

      // Get ongoing instructions
      const instructions = await prisma.ongoingInstruction.findMany({
        where: { 
          userId, 
          isActive: true,
          triggerType: 'NEW_EMAIL'
        }
      })

      if (instructions.length === 0) return

      // Use the flexible instruction executor instead of hardcoded logic
      const { InstructionExecutor } = await import('./instruction-executor')
      const executor = new InstructionExecutor()

      console.log(`🤖 Proactive agent processing email from ${emailData.from}`)

      // Execute each instruction using the AI-driven executor
      for (const instruction of instructions) {
        await executor.executeInstruction(userId, instruction, {
          triggerType: 'NEW_EMAIL',
          eventData: emailData
        })
      }

      console.log(`✅ Proactively processed email from ${emailData.from}`)
    } catch (error) {
      console.error('Proactive agent error:', error)
    }
  }

  /**
   * Process a new calendar event
   */
  async processNewCalendarEvent(userId: string, eventData: {
    title: string
    startTime: Date
    endTime: Date
    attendees: string[]
  }) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          accounts: true
        }
      })

      if (!user) return

      const googleAccount = user.accounts.find(acc => acc.provider === 'google')
      if (!googleAccount?.access_token) return

      const instructions = await prisma.ongoingInstruction.findMany({
        where: { 
          userId, 
          isActive: true,
          triggerType: 'NEW_CALENDAR_EVENT'
        }
      })

      if (instructions.length === 0) return

      // Use the flexible instruction executor
      const { InstructionExecutor } = await import('./instruction-executor')
      const executor = new InstructionExecutor()

      console.log(`🤖 Proactive agent processing calendar event: ${eventData.title}`)

      // Execute each instruction using the AI-driven executor
      for (const instruction of instructions) {
        await executor.executeInstruction(userId, instruction, {
          triggerType: 'NEW_CALENDAR_EVENT',
          eventData
        })
      }
    } catch (error) {
      console.error('Proactive agent error:', error)
    }
  }

  /**
   * Process a new HubSpot contact
   */
  async processNewContact(userId: string, contactData: {
    firstName: string
    lastName: string
    email: string
    company: string
  }) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          accounts: true
        }
      })

      if (!user) return

      const googleAccount = user.accounts.find(acc => acc.provider === 'google')
      if (!googleAccount?.access_token) return

      const instructions = await prisma.ongoingInstruction.findMany({
        where: { 
          userId, 
          isActive: true,
          triggerType: 'NEW_CONTACT'
        }
      })

      if (instructions.length === 0) return

      const toolService = new ToolService(
        googleAccount.access_token,
        user.hubspotAccessToken || '',
        googleAccount.access_token
      )

      const tools = toolService.getAvailableTools()
      const toolDefinitions = tools.map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      }))

      const instructionsText = instructions.map(i => `- ${i.instruction}`).join('\n')
      
      const prompt = `A new contact was created in HubSpot:
NAME: ${contactData.firstName} ${contactData.lastName}
EMAIL: ${contactData.email}
COMPANY: ${contactData.company}

Your ongoing instructions:
${instructionsText}

Based on these instructions, what actions should you take? Use the available tools to execute the appropriate actions.`

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a proactive AI assistant that monitors new contacts and takes action based on ongoing instructions.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        tools: toolDefinitions,
        tool_choice: "auto",
        max_tokens: 1000,
      })

      if (completion.choices[0]?.message?.tool_calls) {
        const toolCalls = completion.choices[0].message.tool_calls
        
        console.log(`🤖 Proactive agent processing new contact: ${contactData.email}`)

        for (const toolCall of toolCalls) {
          if (toolCall.type === 'function' && toolCall.function) {
            try {
              await toolService.executeTool(userId, {
                name: toolCall.function.name,
                arguments: JSON.parse(toolCall.function.arguments)
              })
            } catch (error) {
              console.error(`❌ Proactive agent error:`, error)
            }
          }
        }
      }
    } catch (error) {
      console.error('Proactive agent error:', error)
    }
  }

  /**
   * Create notifications for successful actions
   */
  private async createNotificationForAction(
    userId: string,
    toolName: string,
    args: any,
    result: any,
    emailData: { from: string; subject: string }
  ) {
    try {
      switch (toolName) {
        case 'create_contact':
          await NotificationService.create(
            userId,
            'NEW_CONTACT_CREATED',
            'New Contact Created',
            `Created contact for ${args.email || args.firstName} from email: "${emailData.subject}"`,
            'SUCCESS',
            { contactEmail: args.email, from: emailData.from, result }
          )
          break

        case 'create_calendar_event':
          await NotificationService.create(
            userId,
            'CALENDAR_EVENT_CREATED',
            'Meeting Scheduled',
            `Scheduled "${args.title}" for ${new Date(args.startTime).toLocaleString()}`,
            'SUCCESS',
            { event: args, result }
          )
          break

        case 'add_contact_note':
          await NotificationService.create(
            userId,
            'PROACTIVE_ACTION',
            'Note Added to Contact',
            `Added note to contact in HubSpot`,
            'INFO',
            { note: args.note, result }
          )
          break

        case 'update_task_status':
          if (args.status === 'COMPLETED') {
            await NotificationService.create(
              userId,
              'TASK_COMPLETED',
              'Task Completed',
              `Task completed: ${args.taskId}`,
              'SUCCESS',
              { taskId: args.taskId, result }
            )
          }
          break
      }
    } catch (error) {
      console.error('Error creating notification:', error)
    }
  }

  /**
   * Create error notifications
   */
  private async createErrorNotification(
    userId: string,
    toolName: string,
    errorMessage: string,
    emailData: { from: string; subject: string }
  ) {
    try {
      // Check for specific error types
      if (errorMessage.includes('hubspot') && errorMessage.includes('401')) {
        await NotificationService.create(
          userId,
          'HUBSPOT_TOKEN_EXPIRED',
          'HubSpot Connection Expired',
          'Your HubSpot connection has expired. Please reconnect in the dashboard.',
          'ERROR',
          { error: errorMessage, from: emailData.from }
        )
      } else if (errorMessage.includes('google') && errorMessage.includes('401')) {
        await NotificationService.create(
          userId,
          'GOOGLE_TOKEN_EXPIRED',
          'Google Connection Expired',
          'Your Google connection has expired. Please sign in again.',
          'ERROR',
          { error: errorMessage, from: emailData.from }
        )
      } else {
        await NotificationService.create(
          userId,
          'ERROR',
          `Action Failed: ${toolName}`,
          `Failed to execute ${toolName}: ${errorMessage.substring(0, 200)}`,
          'ERROR',
          { tool: toolName, error: errorMessage, from: emailData.from, subject: emailData.subject }
        )
      }
    } catch (error) {
      console.error('Error creating error notification:', error)
    }
  }
}

