import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ToolService } from '@/lib/tools'
import { OpenAI } from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    // Get pending tasks
    const tasks = await prisma.task.findMany({
      where: {
        status: 'PENDING',
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Only process tasks from last 24 hours
        }
      },
      take: 10, // Process up to 10 tasks at a time
      orderBy: { priority: 'desc' }
    })

    const results = []

    for (const task of tasks) {
      try {
        // Mark task as in progress
        await prisma.task.update({
          where: { id: task.id },
          data: { 
            status: 'IN_PROGRESS',
            startedAt: new Date()
          }
        })

        const result = await processTask(task)
        results.push({ taskId: task.id, success: true, result })
      } catch (error) {
        console.error(`Error processing task ${task.id}:`, error)
        
        // Mark task as failed
        await prisma.task.update({
          where: { id: task.id },
          data: { 
            status: 'FAILED',
            error: error.message,
            completedAt: new Date()
          }
        })
        
        results.push({ taskId: task.id, success: false, error: error.message })
      }
    }

    return NextResponse.json({ 
      processed: tasks.length, 
      results 
    })
  } catch (error) {
    console.error('Process tasks error:', error)
    return NextResponse.json({ error: 'Failed to process tasks' }, { status: 500 })
  }
}

async function processTask(task: any) {
  const user = await prisma.user.findUnique({
    where: { id: task.userId }
  })

  if (!user) {
    throw new Error('User not found')
  }

  // Check if this is an ongoing instruction task
  if (task.context?.instruction) {
    return await processOngoingInstructionTask(task, user)
  }

  // Handle other types of tasks based on title or description
  if (task.title.includes('schedule') || task.title.includes('appointment')) {
    return await processSchedulingTask(task, user)
  }

  if (task.title.includes('email') || task.title.includes('send')) {
    return await processEmailTask(task, user)
  }

  if (task.title.includes('contact') || task.title.includes('create')) {
    return await processContactTask(task, user)
  }

  // Default: use AI to process the task
  return await processWithAI(task, user)
}

async function processOngoingInstructionTask(task: any, user: any) {
  const instruction = task.context.instruction
  const triggerContext = task.context.triggerContext

  // Use AI to determine how to execute the instruction
  const completion = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages: [
      {
        role: "system",
        content: `You are an AI assistant that processes ongoing instructions for financial advisors. 
        
        You have access to tools for:
        - Sending emails (send_email)
        - Creating contacts (create_contact)
        - Adding contact notes (add_contact_note)
        - Creating calendar events (create_calendar_event)
        
        Process the instruction based on the trigger context.`
      },
      {
        role: "user",
        content: `Instruction: ${instruction}
        
        Trigger Context: ${JSON.stringify(triggerContext)}
        
        What should I do? Provide the tool calls needed to execute this instruction.`
      }
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'send_email',
          description: 'Send an email',
          parameters: {
            type: 'object',
            properties: {
              to: { type: 'string' },
              subject: { type: 'string' },
              body: { type: 'string' }
            },
            required: ['to', 'subject', 'body']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'create_contact',
          description: 'Create a new contact',
          parameters: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              notes: { type: 'string' }
            },
            required: ['email']
          }
        }
      }
    ],
    tool_choice: "auto"
  })

  let result = "Instruction processed"
  
  // Execute tool calls if any
  if (completion.choices[0]?.message?.tool_calls) {
    const toolService = new ToolService(
      '', // These would need proper token management
      user.hubspotAccessToken || '',
      ''
    )

    for (const toolCall of completion.choices[0].message.tool_calls) {
      try {
        const toolResult = await toolService.executeTool(user.id, {
          name: toolCall.function.name,
          arguments: JSON.parse(toolCall.function.arguments)
        })
        result += `\nExecuted ${toolCall.function.name}: ${JSON.stringify(toolResult)}`
      } catch (error) {
        result += `\nError executing ${toolCall.function.name}: ${error.message}`
      }
    }
  }

  // Mark task as completed
  await prisma.task.update({
    where: { id: task.id },
    data: {
      status: 'COMPLETED',
      result,
      completedAt: new Date()
    }
  })

  return result
}

async function processSchedulingTask(task: any, user: any) {
  // Implementation for scheduling tasks
  return "Scheduling task processed"
}

async function processEmailTask(task: any, user: any) {
  // Implementation for email tasks
  return "Email task processed"
}

async function processContactTask(task: any, user: any) {
  // Implementation for contact tasks
  return "Contact task processed"
}

async function processWithAI(task: any, user: any) {
  // Use AI to process generic tasks
  const completion = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages: [
      {
        role: "system",
        content: "You are an AI assistant helping process tasks for financial advisors."
      },
      {
        role: "user",
        content: `Task: ${task.title}
        Description: ${task.description}
        
        How should this task be completed?`
      }
    ],
    max_tokens: 500
  })

  const result = completion.choices[0]?.message?.content || "Task processed by AI"

  // Mark task as completed
  await prisma.task.update({
    where: { id: task.id },
    data: {
      status: 'COMPLETED',
      result,
      completedAt: new Date()
    }
  })

  return result
}
