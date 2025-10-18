import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { OpenAI } from 'openai'
import { ToolService } from '@/lib/tools'
import { RAGService } from '@/lib/rag'
import { prisma } from '@/lib/prisma'

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

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Initialize services (these would need proper token management in production)
    const toolService = new ToolService(
      session.accessToken || '',
      user.hubspotAccessToken || '',
      session.accessToken || ''
    )
    
    const ragService = new RAGService()

    // Get available tools
    const tools = toolService.getAvailableTools()
    const toolDefinitions = tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }))

    // Get context using RAG
    const context = await ragService.getContextForQuery(user.id, message)

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
      role: msg.role as 'user' | 'assistant' | 'system',
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
        role: 'user',
        content: message
      }
    })

    // Call OpenAI with tools
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant for financial advisors. You have access to their Gmail, Google Calendar, and HubSpot CRM data through various tools.

Context from user's data:
${context.summary}

Available tools: ${tools.map(t => t.name).join(', ')}

When users ask questions, use the search tools to find relevant information from their emails, contacts, and notes.
When users ask you to do things, use the appropriate tools to complete the tasks.
Be professional, helpful, and concise in your responses.`
        },
        ...messageHistory
      ],
      tools: toolDefinitions,
      tool_choice: "auto",
      max_tokens: 1000,
      temperature: 0.7,
    })

    let assistantMessage = completion.choices[0]?.message?.content || "I'm sorry, I couldn't process your request."
    let metadata: any = {}

    // Handle tool calls
    if (completion.choices[0]?.message?.tool_calls) {
      const toolCalls = completion.choices[0].message.tool_calls
      
      for (const toolCall of toolCalls) {
        try {
          const result = await toolService.executeTool(user.id, {
            name: toolCall.function.name,
            arguments: JSON.parse(toolCall.function.arguments)
          })
          
          // Add tool result to metadata
          metadata[toolCall.function.name] = result
        } catch (error) {
          console.error(`Tool execution error:`, error)
          metadata[toolCall.function.name] = { error: error.message }
        }
      }

      // Generate final response with tool results
      const finalCompletion = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: "Provide a helpful response based on the tool results. Be conversational and helpful."
          },
          {
            role: "user",
            content: `Original question: ${message}\n\nTool results: ${JSON.stringify(metadata)}`
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
      })

      assistantMessage = finalCompletion.choices[0]?.message?.content || assistantMessage
    }

    // Store assistant message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: assistantMessage,
        metadata
      }
    })

    // Format response for frontend
    let formattedMetadata = {}
    
    // Check if we found meetings/events
    if (metadata.get_upcoming_events || metadata.search_contacts) {
      // Format meeting data for the frontend
      const events = metadata.get_upcoming_events || []
      const meetings: any = {}
      
      events.forEach((event: any) => {
        const date = new Date(event.startTime).toLocaleDateString('en-US', { 
          weekday: 'long', 
          day: 'numeric' 
        })
        
        if (!meetings[date]) meetings[date] = []
        
        meetings[date].push({
          id: event.id,
          title: event.title,
          time: `${new Date(event.startTime).toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit' 
          })} - ${new Date(event.endTime).toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit' 
          })}`,
          attendees: event.attendees || [],
          date
        })
      })
      
      formattedMetadata = { meetings }
    }

    return NextResponse.json({
      response: assistantMessage,
      metadata: formattedMetadata
    })

  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    )
  }
}
