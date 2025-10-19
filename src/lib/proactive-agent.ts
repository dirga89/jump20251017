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

      // Get pending tasks related to this sender
      const pendingTasks = await prisma.task.findMany({
        where: {
          userId,
          status: { in: ['PENDING', 'WAITING_FOR_RESPONSE'] },
          OR: [
            { title: { contains: emailData.from.split('<')[0].trim(), mode: 'insensitive' } },
            { description: { contains: emailData.from, mode: 'insensitive' } }
          ]
        },
        take: 3
      })

      // Initialize tool service
      const toolService = new ToolService(
        googleAccount.access_token,
        user.hubspotAccessToken || '',
        googleAccount.access_token,
        googleAccount.refresh_token || undefined,
        googleAccount.refresh_token || undefined
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

      // Build context for AI
      const instructionsText = instructions.map(i => `- ${i.instruction}`).join('\n')
      const tasksText = pendingTasks.length > 0 
        ? `\n\nPENDING TASKS RELATED TO THIS SENDER:\n${pendingTasks.map(t => `- Task ID: ${t.id}, Title: "${t.title}", Status: ${t.status}, Description: ${t.description}`).join('\n')}`
        : ''
      
      const prompt = `A new email was received:
FROM: ${emailData.from}
SUBJECT: ${emailData.subject}
BODY: ${emailData.body.substring(0, 1000)}

Your ongoing instructions:
${instructionsText}${tasksText}

INTELLIGENT EMAIL PROCESSING:

**IMPORTANT: This email is from ${senderEmail}. The user's email is ${userEmail}.**
${senderEmail === userEmail ? '⚠️ This is a SELF-SENT email - DO NOT create any contacts or take actions.' : ''}

1. **Check if this is a REPLY to a scheduling request:**
   - Subject starts with "Re:" or mentions scheduling/appointment/meeting
   - Body contains time selection or acceptance

2. **If it's a scheduling reply with a selected time:**
   a) Use search_contacts to get the contact (to retrieve the hubspotId)
   b) Extract the chosen time from the email body
   c) Use create_calendar_event to schedule the meeting at that time
   d) Use send_email to confirm the appointment
   e) Use add_contact_note with the hubspotId (NOT the database id) to log the scheduled meeting
   f) Use update_task_status to mark any related task as COMPLETED

3. **If sender is NOT in HubSpot (and is NOT the user themselves):**
   a) Use search_contacts to check if sender exists
   b) If not found AND sender email ≠ ${userEmail}, use create_contact with notes about the email
   c) NEVER create contacts for the user themselves (${userEmail})

4. **Otherwise:**
   - Add a note to the contact using add_contact_note

CRITICAL: If the email contains a time selection or appointment acceptance, you MUST create the calendar event!

Execute the appropriate tools based on the email content.`

      // Call AI to decide what to do
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a proactive AI assistant that monitors emails and takes action based on ongoing instructions. You have access to all tools and should execute actions automatically when appropriate.`
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

      // Execute tool calls in a loop until no more tools are needed
      let currentCompletion = completion
      let conversationHistory: any[] = [
        {
          role: "system",
          content: `You are a proactive AI assistant that monitors emails and takes action based on ongoing instructions. You have access to all tools and should execute actions automatically when appropriate.`
        },
        {
          role: "user",
          content: prompt
        }
      ]

      console.log(`🤖 Proactive agent processing email from ${emailData.from}`)

      // Allow up to 5 rounds of tool calling
      for (let round = 0; round < 5; round++) {
        if (!currentCompletion.choices[0]?.message?.tool_calls) {
          break
        }

        const toolCalls = currentCompletion.choices[0].message.tool_calls
        console.log(`🔧 Round ${round + 1}: Executing ${toolCalls.length} tool(s)`)

        // Add assistant's response to history
        conversationHistory.push(currentCompletion.choices[0].message)

        // Execute all tool calls and collect results
        const toolResults: any[] = []
        for (const toolCall of toolCalls) {
          if (toolCall.type === 'function' && toolCall.function) {
            console.log(`🔨 ${toolCall.function.name}:`, toolCall.function.arguments)
            
            try {
              const result = await toolService.executeTool(userId, {
                name: toolCall.function.name,
                arguments: JSON.parse(toolCall.function.arguments)
              })
              
              console.log(`✅ Tool result:`, JSON.stringify(result).substring(0, 200))
              
              // Create notifications for important actions
              await this.createNotificationForAction(userId, toolCall.function.name, JSON.parse(toolCall.function.arguments), result, emailData)
              
              toolResults.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                name: toolCall.function.name,
                content: JSON.stringify(result)
              })
            } catch (error) {
              console.error(`❌ Tool error:`, error)
              
              // Create error notification
              await this.createErrorNotification(userId, toolCall.function.name, String(error), emailData)
              
              toolResults.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                name: toolCall.function.name,
                content: JSON.stringify({ error: String(error) })
              })
            }
          }
        }

        // Add tool results to history
        conversationHistory.push(...toolResults)

        // Get next AI response with tool results
        currentCompletion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: conversationHistory,
          tools: toolDefinitions,
          tool_choice: "auto",
          max_tokens: 1000,
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
      
      const prompt = `A new calendar event was created:
TITLE: ${eventData.title}
START: ${eventData.startTime}
END: ${eventData.endTime}
ATTENDEES: ${eventData.attendees.join(', ')}

Your ongoing instructions:
${instructionsText}

Based on these instructions, what actions should you take? Use the available tools to execute the appropriate actions.`

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a proactive AI assistant that monitors calendar events and takes action based on ongoing instructions.`
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
        
        console.log(`🤖 Proactive agent processing calendar event: ${eventData.title}`)

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

