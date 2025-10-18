import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Store webhook event
    await prisma.webhookEvent.create({
      data: {
        userId: body.userId || 'unknown',
        source: 'calendar',
        eventType: body.eventType || 'unknown',
        payload: body
      }
    })

    // Process webhook based on event type
    if (body.userId) {
      await processCalendarEvent(body.userId, body)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Calendar webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

async function processCalendarEvent(userId: string, eventData: any) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) return

    // Get relevant ongoing instructions
    const instructions = await prisma.ongoingInstruction.findMany({
      where: {
        userId,
        isActive: true,
        triggerType: 'NEW_CALENDAR_EVENT'
      }
    })

    if (instructions.length > 0) {
      // Process each instruction
      for (const instruction of instructions) {
        await processOngoingInstruction(userId, instruction, { 
          calendarEvent: eventData, 
          type: 'NEW_CALENDAR_EVENT' 
        })
      }
    }
  } catch (error) {
    console.error('Process calendar event error:', error)
  }
}

async function processOngoingInstruction(userId: string, instruction: any, context: any) {
  try {
    // Create a task to process this instruction
    await prisma.task.create({
      data: {
        userId,
        title: `Process ongoing instruction: ${instruction.instruction}`,
        description: `Automated task triggered by ${context.type}`,
        status: 'PENDING',
        priority: 'MEDIUM',
        context: {
          instruction: instruction.instruction,
          triggerContext: context
        }
      }
    })

    console.log(`Created task for ongoing instruction: ${instruction.instruction}`)
  } catch (error) {
    console.error('Process ongoing instruction error:', error)
  }
}
