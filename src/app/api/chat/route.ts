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

    // Check HubSpot token expiration
    let hubspotWarning = ''
    if (user.hubspotAccessToken && user.hubspotExpiresAt) {
      const isExpired = new Date(user.hubspotExpiresAt) < new Date()
      if (isExpired) {
        hubspotWarning = '\n\n⚠️ WARNING: Your HubSpot connection has expired. Please reconnect in the dashboard to access contact information.'
      }
    } else if (!user.hubspotAccessToken) {
      hubspotWarning = '\n\nℹ️ INFO: HubSpot is not connected. Connect HubSpot in the dashboard to access CRM features.'
    }

    // Initialize services with proper token management
    const toolService = new ToolService(
      session.accessToken || '',
      user.hubspotAccessToken || '',
      session.accessToken || '',
      session.refreshToken || undefined,
      session.refreshToken || undefined
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
- create_autonomous_agent: Create an autonomous AI agent that works continuously (use when user wants continuous automation)
- generate_ongoing_instruction: Automatically generate ongoing instructions by analyzing user patterns

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

User: "Create an agent that monitors emails and schedules meetings automatically"
You: [Call create_autonomous_agent] → "Created autonomous agent to monitor emails and schedule meetings"

User: "Make an agent that checks for follow-ups every day"
You: [Call create_autonomous_agent with schedule "daily at 9am"] → "Created daily follow-up agent"

AUTONOMOUS AGENT CAPABILITIES:
- You can create agents that work continuously in the background
- Agents can create their own tasks and commands
- Agents monitor emails, contacts, and calendar events automatically
- Agents execute actions based on their instructions without needing user approval
- When the user expresses a need for continuous automation, proactively offer to create an autonomous agent

CRITICAL: 
- When calling add_contact_note, you MUST use the hubspotId field from search_contacts results, NOT the id field!
- When scheduling meetings, ALWAYS search for contacts by name first (use search_contacts), then use their email
- Only mention information directly related to what the user asked about
- If a search returns no relevant results, say so briefly without mentioning unrelated results
- Be PROACTIVE: Look for opportunities to automate repetitive tasks by creating autonomous agents
- ALWAYS respond to client questions and requests - don't leave them hanging!

ALWAYS EXECUTE ACTIONS - Never just talk about doing them!${instructionsContext}`
        },
          ...messageHistory
        ],
        tools: toolDefinitions,
        tool_choice: "auto",
        max_tokens: 1000,
        temperature: 0.7,
      })

      // Multi-round tool calling loop (up to 5 rounds for complex tasks)
      let currentCompletion = completion
      assistantMessage = "I'm processing your request..."
      // Get current date for context
      const currentDate = new Date()
      const currentDateStr = currentDate.toISOString().split('T')[0] // YYYY-MM-DD format
      const currentDateTimeStr = currentDate.toISOString()
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth() + 1
      const day = currentDate.getDate()

      let conversationMessages: any[] = [
        {
          role: "system",
          content: `You are an ACTION-ORIENTED AI assistant for financial advisors with full access to Gmail, Google Calendar, and HubSpot CRM.

🚨 CRITICAL - CURRENT DATE INFORMATION:
TODAY IS: ${currentDateStr} (Year: ${year}, Month: ${month}, Day: ${day})
CURRENT TIME: ${currentDateTimeStr}
DO NOT use dates from 2023 or any other year - WE ARE IN ${year}!

WHEN CALCULATING DATES:
- "today" = ${currentDateStr}T00:00:00Z to ${currentDateStr}T23:59:59Z
- "this week" = Use dates in ${year}, starting from the current week
- "yesterday" = Date before ${currentDateStr} in ${year}
- ALWAYS use year ${year} in your date calculations
- NEVER use 2023, 2024, or any year other than ${year}

CRITICAL RULES:
1. When the user asks you to DO something, you MUST call the appropriate tool IMMEDIATELY
2. DO NOT ask for permission - just execute the action
3. DO NOT just describe what you found - TAKE ACTION on it
4. ONLY mention information that is DIRECTLY relevant to the user's question
5. DO NOT mention unrelated search results or contacts that don't match what the user asked about

🔥 ONGOING INSTRUCTIONS (MEMORY) - CRITICAL:
When user starts a message with "Remember:" - they are setting a PERMANENT instruction:
- IMMEDIATELY call save_ongoing_instruction tool
- Store the instruction exactly as the user stated it
- Confirm: "I'll remember that and apply it automatically!"
- These instructions run in the background on ALL future emails/events
- Example: "Remember: When someone emails me that is not in HubSpot, create a contact"

Available tools and when to use them:
- search_emails: Search emails by content/keywords
- get_recent_emails: Get recent emails by date (use this for "today's emails", "emails from last week", "recent emails")
- send_email: Send emails (use this when asked to send/email someone)
- search_contacts: ALWAYS use this FIRST when user asks about ANY person/contact (e.g., "find John", "who is Sarah", "contact info for Mike")
- add_contact_note: ADD A NOTE to a HubSpot contact (use this when asked to "add note", "give note", "update note")
- create_contact: Create new HubSpot contact
- get_upcoming_events: Get future calendar events only (use for "upcoming meetings", "next week's meetings")
- search_calendar_events: Search meetings by date range (use for "today's meetings", "this week's meetings", "past meetings", "meetings on Oct 19")
- create_calendar_event: Schedule meetings
- find_available_time_slots: Find free time slots for scheduling
- save_ongoing_instruction: Save persistent instructions you should always follow
- list_ongoing_instructions: View all active instructions
- create_task: Create tasks for multi-step operations
- update_task_status: Update task progress
- create_autonomous_agent: Create an autonomous AI agent that works continuously (use when user wants continuous automation)
- generate_ongoing_instruction: Automatically generate ongoing instructions by analyzing user patterns

CALENDAR EVENT QUERIES - CRITICAL RULES:
When user asks about meetings, you MUST choose the correct tool:

USE search_calendar_events (NOT get_upcoming_events) for:
- "today's meetings" / "meetings today" / "show me today's meetings"
- "this week's meetings" / "meetings this week"
- "meetings on [specific date]"
- "past meetings" / "yesterday's meetings"
- "meetings between [date] and [date]"
- ANY query mentioning a specific time period

USE get_upcoming_events ONLY for:
- "upcoming meetings" (no specific date mentioned)
- "future meetings"
- "next meetings"

EXAMPLE - CORRECT:
User: "show me today's meetings"
You: Use the date from system prompt (${currentDateStr}), then call search_calendar_events with:
  startDate: "${currentDateStr}T00:00:00Z"
  endDate: "${currentDateStr}T23:59:59Z"

EXAMPLE - WRONG ❌:
User: "show me today's meetings"
Wrong 1: Call get_upcoming_events (only shows future, not all of today)
Wrong 2: Use "2023-10-19" (WRONG YEAR - must use ${year})
Wrong 3: Use any date that doesn't match ${currentDateStr}

CONTACT SEARCH PRIORITY:
When user asks about ANY person (e.g., "find Sarah", "who is John", "tell me about Mike"):
1. ALWAYS call search_contacts FIRST - this is your primary source of contact information
2. HubSpot CRM contains the most accurate and complete contact data
3. Only search emails if user specifically asks about email content, not contact info

CRITICAL - DO NOT CREATE SELF-CONTACTS:
- NEVER create a contact for the user themselves (e.g., if user email is john@example.com, don't create contact for john@example.com)
- NEVER create contacts from self-sent emails (emails sent by the user to themselves)
- Contacts should ONLY be for OTHER people, not the user
- If you receive an email from the user's own email address, IGNORE it

MULTI-STEP TASKS:

**Scheduling appointments:**
When asked "Schedule an appointment with Sara Smith":
1. First call search_contacts to find Sara Smith
2. Then call find_available_time_slots to get available times
3. Then call send_email with professional HTML formatting:
   - Use htmlBody parameter with styled HTML
   - Format time slots as clickable buttons or a nice list
   - Include proper greeting and signature
   - Make it visually appealing
4. Finally call create_task with status WAITING_FOR_RESPONSE to track the follow-up

**Finding meetings with specific people:**
When asked "Show me meetings with John" or "Upcoming meetings with Sara":
1. FIRST call search_contacts to find the person and get their email
2. THEN call get_upcoming_events to get all upcoming events
3. FILTER the events to only show those where the person's email is in the attendees list
4. Present the filtered results to the user

SCHEDULING EMAIL FORMAT:
When sending scheduling emails, ALWAYS use htmlBody with this structure:
- Professional greeting
- Clear purpose statement
- Time slots formatted as styled buttons or elegant list items
- Each time slot should be clickable (mailto: link)
- Professional closing with your contact info

You can call multiple tools in sequence. After each tool execution, you'll see the results and can decide what to do next.

EXAMPLES OF CORRECT BEHAVIOR:
User: "show me today's emails"
You: [Call get_recent_emails with daysBack: 0] → List emails from today only

User: "show me all my meetings today"
You: [Call search_calendar_events with startDate: "${currentDateStr}T00:00:00Z", endDate: "${currentDateStr}T23:59:59Z"] → Show all meetings for today (MUST use ${year}, not 2023!)

User: "show me upcoming meetings with Budi"
You: [Call search_contacts query: "Budi"] → Get email: trisnoliang@yahoo.com → [Call get_upcoming_events] → Filter events where attendees include trisnoliang@yahoo.com → Show only Budi's meetings

User: "Schedule an appointment with Sara Smith"
You: [Call search_contacts for Sara] → [Call find_available_time_slots] → [Call send_email with times] → [Call create_task] → "I've emailed Sara with available times and created a task to follow up"

User: "add note for Luca: new lead"
You: [Call search_contacts] → Get result with hubspotId field → [Call add_contact_note with result.hubspotId] → "Added note for Luca"

User: "Remember: always create contacts for new email senders"
You: [Call save_ongoing_instruction] → "I'll remember that!"

CRITICAL: 
- When calling add_contact_note, you MUST use the hubspotId field from search_contacts results, NOT the id field!
- Only mention information directly related to what the user asked about
- If a search returns no relevant results, say so briefly without mentioning unrelated results

ALWAYS EXECUTE ACTIONS - Never just talk about doing them!${instructionsContext}`
        },
        ...messageHistory
      ]

      // Allow up to 5 rounds of tool calling for complex multi-step tasks
      for (let round = 0; round < 5; round++) {
        if (!currentCompletion.choices[0]?.message?.tool_calls) {
          // No more tool calls, use the final message
          assistantMessage = currentCompletion.choices[0]?.message?.content || "I'm sorry, I couldn't process your request."
          break
        }

        const toolCalls = currentCompletion.choices[0].message.tool_calls
        console.log(`🔧 Round ${round + 1}: AI requested ${toolCalls.length} tool calls`)

        // Add assistant's message to conversation
        conversationMessages.push(currentCompletion.choices[0].message)

        // Execute all tool calls and collect results
        const toolResults: any[] = []
        for (const toolCall of toolCalls) {
          try {
            if (toolCall.type === 'function' && toolCall.function) {
              console.log(`🔨 Executing tool: ${toolCall.function.name}`)
              console.log(`📝 Arguments: ${toolCall.function.arguments}`)
              
              const result = await toolService.executeTool(user.id, {
                name: toolCall.function.name,
                arguments: JSON.parse(toolCall.function.arguments)
              })
              
              console.log(`✅ Tool result:`, JSON.stringify(result).substring(0, 200))
              
              // Add to metadata for database storage
              metadata[`${toolCall.function.name}_round${round + 1}`] = result
              
              // Add tool result for next AI call
              toolResults.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                name: toolCall.function.name,
                content: JSON.stringify(result)
              })
            }
          } catch (error: any) {
            console.error(`❌ Tool execution error:`, error)
            if (toolCall.type === 'function' && toolCall.function) {
              metadata[`${toolCall.function.name}_error`] = error.message
              toolResults.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                name: toolCall.function.name,
                content: JSON.stringify({ error: error.message })
              })
            }
          }
        }

        // Add tool results to conversation
        conversationMessages.push(...toolResults)

        // Get next AI response with tool results
        currentCompletion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: conversationMessages,
          tools: toolDefinitions,
          tool_choice: "auto",
          max_tokens: 1000,
          temperature: 0.7,
        })
      }

      // If we still have tool calls after 5 rounds, just use the last message
      if (currentCompletion.choices[0]?.message?.content) {
        assistantMessage = currentCompletion.choices[0].message.content
      }

      // Append HubSpot warning if present
      if (hubspotWarning) {
        assistantMessage += hubspotWarning
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
