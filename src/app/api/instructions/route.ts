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

    const instructions = await prisma.ongoingInstruction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json(instructions)
  } catch (error) {
    console.error('Get instructions error:', error)
    return NextResponse.json({ error: 'Failed to fetch instructions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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

    const { instruction, triggerType, conditions } = await request.json()

    if (!instruction || !triggerType) {
      return NextResponse.json({ error: 'Instruction and trigger type are required' }, { status: 400 })
    }

    const newInstruction = await prisma.ongoingInstruction.create({
      data: {
        userId: user.id,
        instruction,
        triggerType,
        conditions: conditions || {},
        isActive: true
      }
    })

    return NextResponse.json(newInstruction)
  } catch (error) {
    console.error('Create instruction error:', error)
    return NextResponse.json({ error: 'Failed to create instruction' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
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

    const { id, isActive } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'Instruction ID is required' }, { status: 400 })
    }

    const updatedInstruction = await prisma.ongoingInstruction.update({
      where: { 
        id,
        userId: user.id // Ensure user owns this instruction
      },
      data: { isActive }
    })

    return NextResponse.json(updatedInstruction)
  } catch (error) {
    console.error('Update instruction error:', error)
    return NextResponse.json({ error: 'Failed to update instruction' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Instruction ID is required' }, { status: 400 })
    }

    await prisma.ongoingInstruction.delete({
      where: { 
        id,
        userId: user.id // Ensure user owns this instruction
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete instruction error:', error)
    return NextResponse.json({ error: 'Failed to delete instruction' }, { status: 500 })
  }
}
