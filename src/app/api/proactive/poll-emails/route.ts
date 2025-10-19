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
            triggerType: 'NEW_EMAIL'
          }
        }
      },
      include: {
        accounts: {
          where: {
            provider: 'google'
          }
        }
      }
    })

    console.log(`📊 Users found:`, usersWithInstructions.map(u => ({
      email: u.email,
      accountsCount: u.accounts.length
    })))

    console.log(`🔍 Polling emails for ${usersWithInstructions.length} users...`)

    const proactiveAgent = new ProactiveAgent()

    for (const user of usersWithInstructions) {
      console.log(`👤 Processing user: ${user.email}`)
      
      // Get Google access token from accounts
      const googleAccount = user.accounts.find(acc => acc.provider === 'google')
      if (!googleAccount?.access_token) {
        console.log(`❌ No Google account found for ${user.email}`)
        continue
      }

      console.log(`✅ Found Google account for ${user.email}`)

      try {
        const gmail = new GmailService(googleAccount.access_token, googleAccount.refresh_token || undefined)

        // Get the last processed email timestamp
        const lastEmail = await prisma.email.findFirst({
          where: { userId: user.id },
          orderBy: { date: 'desc' }
        })

        const sinceDate = lastEmail?.date || new Date(Date.now() - 24 * 60 * 60 * 1000)
        
        console.log(`🔍 Checking emails since: ${sinceDate.toISOString()} for ${user.email}`)
        
        // Use the getNewEmailsSince method
        const newEmails = await gmail.getNewEmailsSince(sinceDate)
        
        console.log(`📧 Gmail returned ${newEmails.length} emails for ${user.email}`)

        for (const email of newEmails) {
          // Check if already exists
          const existing = await prisma.email.findFirst({
            where: { userId: user.id, gmailId: email.id }
          })
          
          if (existing) {
            console.log(`⏭️  Skipping existing email: ${email.subject}`)
            continue
          }
          
          console.log(`📥 NEW EMAIL: "${email.subject}" from ${email.from}`)
          // Store the email
          await prisma.email.create({
            data: {
              userId: user.id,
              gmailId: email.id,
              threadId: '',
              subject: email.subject,
              sender: email.from,
              recipient: user.email || '',
              body: email.body.substring(0, 5000),
              date: email.date,
              labels: [],
              isRead: false
            }
          })

          // Trigger proactive agent
          console.log(`🤖 Processing with proactive agent...`)
          await proactiveAgent.processNewEmail(user.id, {
            from: email.from,
            subject: email.subject,
            body: email.body,
            messageId: email.id
          })
          console.log(`✅ Processed: ${email.subject}`)
        }
      } catch (error) {
        console.error(`❌ Error polling emails for user ${user.email}:`, error)
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

