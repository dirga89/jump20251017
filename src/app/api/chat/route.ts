import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { OpenAI } from 'openai'
import { ToolService } from '@/lib/tools'
import { RAGService } from '@/lib/rag'
import { prisma } from '@/lib/prisma'
import '@/lib/startup' // Initialize background services

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message, conversationId } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Get or create user from database
    let user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      // Create user if doesn't exist
      user = await prisma.user.create({
        data: {
          email: session.user.email,
          name: session.user.name,
          image: session.user.image,
          emailVerified: new Date()
        }
      })
    }

    // Initialize services with proper token management
    const toolService = new ToolService(
      session.accessToken || '',
      user.hubspotAccessToken || '',
      session.accessToken || ''
    )
    
    // const ragService = new RAGService()

    // Get available tools
    const tools = toolService.getAvailableTools()
    const toolDefinitions = tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }))

    // Get context using RAG
    // const context = await ragService.getContextForQuery(user.id, message)

    // Create or get conversation
    let conversation = await prisma.conversation.findUnique({
      where: { id: conversationId || 'default' }
    })

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          id: conversationId || 'default',
          userId: user.id,
          title: message.substring(0, 50)
        }
      })
    }

    // Get recent conversation history
    const recentMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: 10
    })

    // Build message history for OpenAI
    const messageHistory = recentMessages.reverse().map(msg => ({
      role: msg.role.toLowerCase() as 'user' | 'assistant' | 'system',
      content: msg.content
    }))

    // Add current user message
    messageHistory.push({
      role: 'user',
      content: message
    })

    // Store user message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'USER',
        content: message
      }
    })

    // Load ongoing instructions for context
    const ongoingInstructions = await prisma.ongoingInstruction.findMany({
      where: { userId: user.id, isActive: true }
    })

    const instructionsContext = ongoingInstructions.length > 0
      ? `\n\nONGOING INSTRUCTIONS YOU MUST FOLLOW:\n${ongoingInstructions.map(i => `- ${i.instruction} (Trigger: ${i.triggerType})`).join('\n')}`
      : ''

    // Call OpenAI - with error handling
    let assistantMessage: string
    let metadata: any = {}
    
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Better at following instructions than gpt-3.5-turbo
        messages: [
        {
          role: "system",
          content: `You are an ACTION-ORIENTED AI assistant for financial advisors with full access to Gmail, Google Calendar, and HubSpot CRM.

CRITICAL RULES:
1. When the user asks you to DO something, you MUST call the appropriate tool IMMEDIATELY
2. DO NOT ask for permission - just execute the action
3. DO NOT just describe what you found - TAKE ACTION on it
4. ONLY mention information that is DIRECTLY relevant to the user's question
5. DO NOT mention unrelated search results or contacts that don't match what the user asked about

Available tools and when to use them:
- search_emails: Search emails by content/keywords
- get_recent_emails: Get recent emails by date (use this for "today's emails", "emails from last week", "recent emails")
- send_email: Send emails (use this when asked to send/email someone)
- search_contacts: Find HubSpot contacts
- add_contact_note: ADD A NOTE to a HubSpot contact (use this when asked to "add note", "give note", "update note")
- create_contact: Create new HubSpot contact
- get_upcoming_events: Get calendar events
- create_calendar_event: Schedule meetings
- save_ongoing_instruction: Save persistent instructions you should always follow
- list_ongoing_instructions: View all active instructions
- create_task: Create tasks for multi-step operations
- update_task_status: Update task progress

EXAMPLES OF CORRECT BEHAVIOR:
User: "show me today's emails"
You: [Call get_recent_emails with daysBack: 0] → List emails from today only

User: "emails from last week"
You: [Call get_recent_emails with daysBack: 7] → List emails from the last 7 days

User: "add note for Luca: new lead"
You: [Call search_contacts] → Get result with hubspotId field → [Call add_contact_note with result.hubspotId] → "Added note for Luca"

User: "send email to john@example.com saying hello"
You: [Call send_email immediately] → "Email sent to john@example.com"

User: "create contact for Jane with note: interested in product"
You: [Call create_contact] → "Created contact for Jane with the note"

User: "Remember: always create contacts for new email senders"
You: [Call save_ongoing_instruction] → "I'll remember that!"

CRITICAL: 
- When calling add_contact_note, you MUST use the hubspotId field from search_contacts results, NOT the id field!
- Only mention information directly related to what the user asked about
- If a search returns no relevant results, say so briefly without mentioning unrelated results

ALWAYS EXECUTE ACTIONS - Never just talk about doing them!${instructionsContext}`
        },
          ...messageHistory
        ],
        tools: toolDefinitions,
        tool_choice: "auto",
        max_tokens: 1000,
        temperature: 0.7,
      })

      assistantMessage = completion.choices[0]?.message?.content || "I'm sorry, I couldn't process your request."
      
      // Handle tool calls
      if (completion.choices[0]?.message?.tool_calls) {
        const toolCalls = completion.choices[0].message.tool_calls
        
        console.log(`🔧 AI requested ${toolCalls.length} tool calls`)
        
        for (const toolCall of toolCalls) {
          try {
            if (toolCall.type === 'function' && toolCall.function) {
              console.log(`🔨 Executing tool: ${toolCall.function.name}`)
              console.log(`📝 Arguments: ${toolCall.function.arguments}`)
              
              const result = await toolService.executeTool(user.id, {
                name: toolCall.function.name,
                arguments: JSON.parse(toolCall.function.arguments)
              })
              
              console.log(`✅ Tool result:`, result)
              
              // Add tool result to metadata
              metadata[toolCall.function.name] = result
            }
          } catch (error: any) {
            console.error(`❌ Tool execution error:`, error)
            if (toolCall.type === 'function' && toolCall.function) {
              metadata[toolCall.function.name] = { error: error.message }
            }
          }
        }

        // Generate final response with tool results
        const finalCompletion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "Based on the tool results, provide a helpful and conversational response to the user. Summarize what you found in a natural way."
            },
            {
              role: "user",
              content: `Original question: ${message}\n\nTool results: ${JSON.stringify(metadata, null, 2)}`
            }
          ],
          max_tokens: 500,
          temperature: 0.7,
        })

        assistantMessage = finalCompletion.choices[0]?.message?.content || assistantMessage
      }
    } catch (error: any) {
      console.error('OpenAI API error:', error)
      
      // Provide helpful error message
      if (error.status === 429 || error.code === 'insufficient_quota') {
        assistantMessage = `⚠️ **OpenAI API Quota Exceeded**

To enable the full AI agent functionality, please:

1. Visit: https://platform.openai.com/account/billing
2. Add credits to your account (minimum $5)
3. The AI agent will then be able to:
   - Read and search your Gmail emails
   - Schedule appointments on Google Calendar
   - Manage HubSpot contacts and notes
   - Answer questions about your clients
   - Automate tasks based on your requests

Once you add credits, just refresh and try again!`
      } else {
        assistantMessage = `Error: ${error.message || 'Unable to connect to OpenAI'}. Please check your API key configuration.`
      }
    }

    // Store assistant message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'ASSISTANT',
        content: assistantMessage,
        metadata
      }
    })

    return NextResponse.json({
      response: assistantMessage,
      metadata: {}
    })

  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    )
  }
}
