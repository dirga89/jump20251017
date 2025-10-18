import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Store webhook event
    await prisma.webhookEvent.create({
      data: {
        userId: body.userId || 'unknown',
        source: 'hubspot',
        eventType: body.eventType || 'unknown',
        payload: body
      }
    })

    // Process webhook based on event type
    if (body.userId) {
      await processHubSpotEvent(body.userId, body)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('HubSpot webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

async function processHubSpotEvent(userId: string, eventData: any) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) return

    // Get relevant ongoing instructions
    let triggerType = 'HUBSPOT_UPDATE'
    if (eventData.eventType?.includes('contact')) {
      triggerType = 'NEW_CONTACT'
    }

    const instructions = await prisma.ongoingInstruction.findMany({
      where: {
        userId,
        isActive: true,
        triggerType: triggerType
      }
    })

    if (instructions.length > 0) {
      // Process each instruction
      for (const instruction of instructions) {
        await processOngoingInstruction(userId, instruction, { 
          hubspotEvent: eventData, 
          type: triggerType 
        })
      }
    }
  } catch (error) {
    console.error('Process HubSpot event error:', error)
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
