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
        where: { id: userId },
        include: {
          accounts: true
        }
      })

      if (!user) return

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

      // Initialize tool service
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

      // Build context for AI
      const instructionsText = instructions.map(i => `- ${i.instruction}`).join('\n')
      
      const prompt = `A new email was received:
FROM: ${emailData.from}
SUBJECT: ${emailData.subject}
BODY: ${emailData.body.substring(0, 500)}

Your ongoing instructions:
${instructionsText}

EXECUTE THESE STEPS:
1. Use search_contacts to check if the sender (${emailData.from}) exists in HubSpot
2. If NO contact found (search returns empty array or no match), use create_contact to create a new contact with:
   - email: sender's email address
   - firstName: extracted from sender name if available
   - lastName: extracted from sender name if available  
   - notes: "Email received: [subject]"
3. If contact exists, you can optionally add a note using add_contact_note

You MUST execute the tools to complete these actions. Do not just acknowledge - take action now.`

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
              
              toolResults.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                name: toolCall.function.name,
                content: JSON.stringify(result)
              })
            } catch (error) {
              console.error(`❌ Tool error:`, error)
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
}

