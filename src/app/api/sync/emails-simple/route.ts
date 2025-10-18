import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GmailService } from '@/lib/gmail'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email || !session.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Initialize Gmail service
    const gmailService = new GmailService(session.accessToken)

    // Sync emails
    const syncResult = await gmailService.syncEmails(user.id, 100)
    
    return NextResponse.json({
      success: true,
      message: `Synced ${syncResult.count} emails. Embeddings will be generated in the background.`,
      count: syncResult.count
    })

  } catch (error) {
    console.error('Email sync error:', error)
    return NextResponse.json(
      { error: 'Failed to sync emails' }, 
      { status: 500 }
    )
  }
}

