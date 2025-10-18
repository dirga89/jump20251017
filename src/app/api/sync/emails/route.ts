import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GmailService } from '@/lib/gmail'
import { RAGService } from '@/lib/rag'
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
    const ragService = new RAGService()

    // Sync emails
    const syncResult = await gmailService.syncEmails(user.id, 100)
    
    // Update embeddings for new emails
    await ragService.updateEmailEmbeddings(user.id)

    return NextResponse.json({
      success: true,
      message: `Synced ${syncResult.count} emails`,
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
