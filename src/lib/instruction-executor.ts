import { OpenAI } from 'openai'
import { ToolService } from './tools'
import { prisma } from './prisma'
import { NotificationService } from './notifications'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export class InstructionExecutor {
  /**
   * Execute an ongoing instruction dynamically using AI to interpret it
   * This makes the system truly flexible - it can handle ANY instruction without hardcoding
   */
  async executeInstruction(
    userId: string,
    instruction: any,
    context: {
      triggerType: string
      eventData?: any
    }
  ) {
    try {
      // Get user with tokens
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { accounts: true }
      })

      if (!user) return

      // Get Google access token
      const googleAccount = user.accounts.find(acc => acc.provider === 'google')
      if (!googleAccount?.access_token) return

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

      // Build context-specific prompt
      let contextPrompt = ''
      
      if (context.triggerType === 'NEW_EMAIL' && context.eventData) {
        const emailData = context.eventData
        contextPrompt = `A new email was received:
FROM: ${emailData.from}
SUBJECT: ${emailData.subject}
BODY: ${emailData.body.substring(0, 1000)}`
      } else if (context.triggerType === 'NEW_CALENDAR_EVENT' && context.eventData) {
        const eventData = context.eventData
        contextPrompt = `A new calendar event was created:
TITLE: ${eventData.title}
START: ${eventData.startTime}
END: ${eventData.endTime}
ATTENDEES: ${eventData.attendees?.join(', ') || 'None'}`
      } else if (context.triggerType === 'NEW_CONTACT' && context.eventData) {
        const contactData = context.eventData
        contextPrompt = `A new contact was created:
NAME: ${contactData.firstName} ${contactData.lastName}
EMAIL: ${contactData.email}
COMPANY: ${contactData.company}`
      }

      // Create the execution prompt
      const prompt = `${contextPrompt}

YOUR INSTRUCTION: ${instruction.instruction}

Based on this instruction and the context above, what actions should you take? 
Interpret the instruction naturally and use the available tools to execute it.
Be autonomous and proactive - execute actions automatically without asking for permission.

Remember:
- If the instruction mentions "send email" or "email" - use send_email tool
- If it mentions "create contact" or "add contact" - use create_contact tool
- If it mentions "schedule" or "meeting" - use create_calendar_event tool
- If it mentions "note" or "log" - use add_contact_note tool
- Use multiple tools if needed to complete the instruction`

      console.log(`🤖 Executing instruction: ${instruction.instruction}`)
      console.log(`📋 Context: ${context.triggerType}`)

      // Call AI to interpret and execute the instruction
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an autonomous AI agent that executes instructions proactively. 
You have access to tools for Gmail, HubSpot CRM, and Google Calendar.
When given an instruction, you should interpret it naturally and execute the appropriate actions automatically.
Don't ask for permission - just execute. Use multiple tools if needed to complete the instruction fully.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        tools: toolDefinitions,
        tool_choice: "auto",
        max_tokens: 2000,
      })

      // Execute tool calls in a loop until no more tools are needed
      let currentCompletion = completion
      let conversationHistory: any[] = [
        {
          role: "system",
          content: `You are an autonomous AI agent that executes instructions proactively. 
You have access to tools for Gmail, HubSpot CRM, and Google Calendar.
When given an instruction, you should interpret it naturally and execute the appropriate actions automatically.
Don't ask for permission - just execute. Use multiple tools if needed to complete the instruction fully.`
        },
        {
          role: "user",
          content: prompt
        }
      ]

      // Allow up to 10 rounds of tool calling for complex multi-step instructions
      for (let round = 0; round < 10; round++) {
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
              await this.createNotificationForAction(
                userId, 
                toolCall.function.name, 
                JSON.parse(toolCall.function.arguments), 
                result,
                context
              )
              
              toolResults.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                name: toolCall.function.name,
                content: JSON.stringify(result)
              })
            } catch (error) {
              console.error(`❌ Tool error:`, error)
              
              // Create error notification
              await this.createErrorNotification(
                userId, 
                toolCall.function.name, 
                String(error), 
                context
              )
              
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
          max_tokens: 2000,
        })
      }

      console.log(`✅ Completed execution of instruction: ${instruction.instruction}`)
    } catch (error) {
      console.error('Instruction executor error:', error)
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
    context: any
  ) {
    try {
      const eventTitle = context.eventData?.title || context.eventData?.subject || 'Event'
      
      switch (toolName) {
        case 'create_contact':
          await NotificationService.create(
            userId,
            'NEW_CONTACT_CREATED',
            'New Contact Created',
            `Created contact for ${args.email || args.firstName} from ${eventTitle}`,
            'SUCCESS',
            { contactEmail: args.email, result }
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

        case 'send_email':
          await NotificationService.create(
            userId,
            'PROACTIVE_ACTION',
            'Email Sent',
            `Sent email to ${args.to}`,
            'SUCCESS',
            { to: args.to, subject: args.subject, result }
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
    context: any
  ) {
    try {
      const eventTitle = context.eventData?.title || context.eventData?.subject || 'Event'
      
      if (errorMessage.includes('hubspot') && errorMessage.includes('401')) {
        await NotificationService.create(
          userId,
          'HUBSPOT_TOKEN_EXPIRED',
          'HubSpot Connection Expired',
          'Your HubSpot connection has expired. Please reconnect in the dashboard.',
          'ERROR',
          { error: errorMessage }
        )
      } else if (errorMessage.includes('google') && errorMessage.includes('401')) {
        await NotificationService.create(
          userId,
          'GOOGLE_TOKEN_EXPIRED',
          'Google Connection Expired',
          'Your Google connection has expired. Please sign in again.',
          'ERROR',
          { error: errorMessage }
        )
      } else {
        await NotificationService.create(
          userId,
          'ERROR',
          `Action Failed: ${toolName}`,
          `Failed to execute ${toolName}: ${errorMessage.substring(0, 200)}`,
          'ERROR',
          { tool: toolName, error: errorMessage, event: eventTitle }
        )
      }
    } catch (error) {
      console.error('Error creating error notification:', error)
    }
  }
}

