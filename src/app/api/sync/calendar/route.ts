import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { CalendarService } from '@/lib/calendar'
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

    // Initialize Calendar service
    const calendarService = new CalendarService(session.accessToken)

    // Sync calendar events
    const syncResult = await calendarService.syncCalendarEvents(user.id, 30)

    return NextResponse.json({
      success: true,
      message: `Synced ${syncResult.count} calendar events`,
      count: syncResult.count
    })

  } catch (error) {
    console.error('Calendar sync error:', error)
    return NextResponse.json(
      { error: 'Failed to sync calendar' }, 
      { status: 500 }
    )
  }
}
