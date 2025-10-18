import { OpenAI } from 'openai'
import { ToolService } from './tools'
import { prisma } from './prisma'

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
        where: { id: userId }
      })

      if (!user) return

      // Get ongoing instructions
      const instructions = await prisma.ongoingInstruction.findMany({
        where: { 
          userId, 
          isActive: true,
          OR: [
            { triggerType: 'EMAIL_RECEIVED' },
            { triggerType: 'ALWAYS' }
          ]
        }
      })

      if (instructions.length === 0) return

      // Initialize tool service
      const toolService = new ToolService(
        user.googleAccessToken || '',
        user.hubspotAccessToken || '',
        user.googleAccessToken || ''
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
      
      const prompt = `A new email was received:
FROM: ${emailData.from}
SUBJECT: ${emailData.subject}
BODY: ${emailData.body.substring(0, 500)}

Your ongoing instructions:
${instructionsText}

Based on these instructions, what actions should you take? If no action is needed, respond with "NO_ACTION". Otherwise, use the available tools to execute the appropriate actions.`

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

      // Execute any tool calls
      if (completion.choices[0]?.message?.tool_calls) {
        const toolCalls = completion.choices[0].message.tool_calls
        
        console.log(`🤖 Proactive agent processing email from ${emailData.from}`)
        console.log(`🔧 Executing ${toolCalls.length} tool(s)`)

        for (const toolCall of toolCalls) {
          if (toolCall.type === 'function' && toolCall.function) {
            console.log(`🔨 ${toolCall.function.name}:`, toolCall.function.arguments)
            
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

        // Log the proactive action
        await prisma.message.create({
          data: {
            conversationId: 'proactive-agent',
            role: 'ASSISTANT',
            content: `Proactively processed email from ${emailData.from}: ${completion.choices[0]?.message?.content || 'Executed actions'}`
          }
        })
      }
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
        where: { id: userId }
      })

      if (!user) return

      const instructions = await prisma.ongoingInstruction.findMany({
        where: { 
          userId, 
          isActive: true,
          OR: [
            { triggerType: 'CALENDAR_EVENT_CREATED' },
            { triggerType: 'ALWAYS' }
          ]
        }
      })

      if (instructions.length === 0) return

      const toolService = new ToolService(
        user.googleAccessToken || '',
        user.hubspotAccessToken || '',
        user.googleAccessToken || ''
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
        where: { id: userId }
      })

      if (!user) return

      const instructions = await prisma.ongoingInstruction.findMany({
        where: { 
          userId, 
          isActive: true,
          OR: [
            { triggerType: 'CONTACT_CREATED' },
            { triggerType: 'ALWAYS' }
          ]
        }
      })

      if (instructions.length === 0) return

      const toolService = new ToolService(
        user.googleAccessToken || '',
        user.hubspotAccessToken || '',
        user.googleAccessToken || ''
      })

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
}

