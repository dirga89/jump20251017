import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { HubSpotService } from '@/lib/hubspot'
import { RAGService } from '@/lib/rag'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user || !user.hubspotConnected || !user.hubspotAccessToken) {
      return NextResponse.json({ error: 'HubSpot not connected' }, { status: 400 })
    }

    // Initialize HubSpot service
    const hubspotService = new HubSpotService(user.hubspotAccessToken)
    const ragService = new RAGService()

    // Sync contacts
    const syncResult = await hubspotService.syncContacts(user.id)
    
    // Update embeddings for new contacts and notes
    await Promise.all([
      ragService.updateContactEmbeddings(user.id),
      ragService.updateContactNoteEmbeddings(user.id)
    ])

    return NextResponse.json({
      success: true,
      message: `Synced ${syncResult.count} contacts`,
      count: syncResult.count
    })

  } catch (error) {
    console.error('Contact sync error:', error)
    return NextResponse.json(
      { error: 'Failed to sync contacts' }, 
      { status: 500 }
    )
  }
}
