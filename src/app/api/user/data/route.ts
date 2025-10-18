import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get counts
    const [emailCount, contactCount, eventCount] = await Promise.all([
      prisma.email.count({ where: { userId: user.id } }),
      prisma.contact.count({ where: { userId: user.id } }),
      prisma.calendarEvent.count({ where: { userId: user.id } })
    ])

    return NextResponse.json({
      hubspotConnected: user.hubspotConnected,
      emailCount,
      contactCount,
      eventCount
    })

  } catch (error) {
    console.error('User data API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    )
  }
}
