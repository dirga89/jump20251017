import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GmailService } from '@/lib/gmail'
import { ProactiveAgent } from '@/lib/proactive-agent'

export async function POST(request: NextRequest) {
  try {
    // Get all users with active ongoing instructions
    const usersWithInstructions = await prisma.user.findMany({
      where: {
        ongoingInstructions: {
          some: {
            isActive: true,
            OR: [
              { triggerType: 'EMAIL_RECEIVED' },
              { triggerType: 'ALWAYS' }
            ]
          }
        }
      }
    })

    console.log(`🔍 Polling emails for ${usersWithInstructions.length} users...`)

    const proactiveAgent = new ProactiveAgent()

    for (const user of usersWithInstructions) {
      if (!user.googleAccessToken) continue

      try {
        const gmail = new GmailService(user.googleAccessToken, user.googleRefreshToken || undefined)

        // Get the last processed email timestamp
        const lastEmail = await prisma.email.findFirst({
          where: { userId: user.id },
          orderBy: { date: 'desc' }
        })

        // Search for new emails since last check
        const response = await gmail.gmail.users.messages.list({
          userId: 'me',
          maxResults: 10,
          q: lastEmail ? `after:${Math.floor(lastEmail.date.getTime() / 1000)}` : 'is:unread'
        })

        const newMessages = response.data.messages || []
        
        console.log(`📧 Found ${newMessages.length} new emails for ${user.email}`)

        for (const message of newMessages) {
          // Get full message details
          const fullMessage = await gmail.gmail.users.messages.get({
            userId: 'me',
            id: message.id!,
            format: 'full'
          })

          const headers = fullMessage.data.payload?.headers || []
          const getHeader = (name: string) => 
            headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value

          const from = getHeader('From') || ''
          const subject = getHeader('Subject') || ''
          
          // Extract body
          let body = ''
          const extractBody = (part: any): void => {
            if (part.body?.data) {
              body += Buffer.from(part.body.data, 'base64').toString()
            }
            if (part.parts) {
              part.parts.forEach(extractBody)
            }
          }
          if (fullMessage.data.payload) {
            extractBody(fullMessage.data.payload)
          }

          // Store the email
          await prisma.email.create({
            data: {
              userId: user.id,
              gmailId: message.id!,
              threadId: fullMessage.data.threadId || '',
              subject,
              sender: from,
              recipient: user.email || '',
              body: body.substring(0, 5000), // Limit body length
              date: new Date(getHeader('Date') || Date.now()),
              labels: fullMessage.data.labelIds || [],
              isRead: !(fullMessage.data.labelIds || []).includes('UNREAD')
            }
          })

          // Trigger proactive agent
          await proactiveAgent.processNewEmail(user.id, {
            from,
            subject,
            body,
            messageId: message.id!
          })
        }
      } catch (error) {
        console.error(`Error polling emails for user ${user.email}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Polled emails for ${usersWithInstructions.length} users`
    })

  } catch (error) {
    console.error('Email polling error:', error)
    return NextResponse.json(
      { error: 'Failed to poll emails' },
      { status: 500 }
    )
  }
}

