import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Simple response for testing
    const responses = [
      "Hello! I'm your AI assistant. How can I help you today?",
      "I can help you with Gmail, Calendar, and HubSpot integration. What would you like to know?",
      "I'm ready to assist you with your financial advisor tasks. What do you need help with?",
      "Great question! I can search through your emails, manage contacts, and schedule meetings. What would you like me to do?",
      "I'm here to help! I can answer questions about your data or perform actions like sending emails and creating contacts."
    ]

    const randomResponse = responses[Math.floor(Math.random() * responses.length)]

    return NextResponse.json({
      response: randomResponse,
      metadata: {}
    })

  } catch (error) {
    console.error('Simple chat API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    )
  }
}
