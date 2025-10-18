import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GmailService } from '@/lib/gmail'
import { RAGService } from '@/lib/rag'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Store webhook event
    await prisma.webhookEvent.create({
      data: {
        userId: body.userId || 'unknown',
        source: 'gmail',
        eventType: body.eventType || 'unknown',
        payload: body
      }
    })

    // Process webhook based on event type
    if (body.eventType === 'new_email' && body.userId) {
      await processNewEmail(body.userId, body.emailId)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Gmail webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

async function processNewEmail(userId: string, emailId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) return

    // Get ongoing instructions for new emails
    const instructions = await prisma.ongoingInstruction.findMany({
      where: {
        userId,
        isActive: true,
        triggerType: 'NEW_EMAIL'
      }
    })

    if (instructions.length > 0) {
      // Process each instruction
      for (const instruction of instructions) {
        await processOngoingInstruction(userId, instruction, { emailId, type: 'NEW_EMAIL' })
      }
    }
  } catch (error) {
    console.error('Process new email error:', error)
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

    // In a full implementation, this would trigger the AI agent to process the instruction
    console.log(`Created task for ongoing instruction: ${instruction.instruction}`)
  } catch (error) {
    console.error('Process ongoing instruction error:', error)
  }
}
