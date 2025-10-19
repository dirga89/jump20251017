import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const email = 'dirga89@gmail.com'
    
    console.log(`🔍 Looking for user: ${email}`)
    
    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    console.log(`👤 Found user: ${user.id}`)
    console.log('🗑️  Deleting user and all related data...')

    // Delete the user (cascade will handle related records)
    await prisma.user.delete({
      where: { id: user.id }
    })

    console.log('✅ User deleted successfully!')

    return NextResponse.json({ 
      success: true, 
      message: 'User deleted. Now sign in again with Google.' 
    })

  } catch (error) {
    console.error('❌ Error:', error)
    return NextResponse.json(
      { error: 'Failed to delete user', details: String(error) }, 
      { status: 500 }
    )
  }
}

