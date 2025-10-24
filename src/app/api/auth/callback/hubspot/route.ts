import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function getBaseUrl(request: NextRequest): string {
  // Use NEXTAUTH_URL if available (production)
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL
  }
  
  // Fallback to constructing from request headers
  const protocol = request.headers.get('x-forwarded-proto') || 'http'
  const host = request.headers.get('host') || 'localhost:3000'
  return `${protocol}://${host}`
}

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request)
  
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.redirect(new URL('/auth/signin', baseUrl))
    }

    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')

    if (!code) {
      return NextResponse.redirect(new URL('/dashboard?error=no_code', baseUrl))
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.HUBSPOT_CLIENT_ID!,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
        redirect_uri: process.env.HUBSPOT_REDIRECT_URI!,
        code: code,
      }),
    })

    const tokenData = await tokenResponse.json()

    if (!tokenResponse.ok) {
      console.error('HubSpot token error:', tokenData)
      return NextResponse.redirect(new URL('/dashboard?error=token_failed', baseUrl))
    }

    // Get user info
    const userInfoResponse = await fetch('https://api.hubapi.com/oauth/v1/access-tokens/' + tokenData.access_token)
    const userInfo = await userInfoResponse.json()

    // Update user with HubSpot connection
    await prisma.user.update({
      where: { email: session.user.email },
      data: {
        hubspotConnected: true,
        hubspotAccessToken: tokenData.access_token,
        hubspotRefreshToken: tokenData.refresh_token,
        hubspotExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000)
      }
    })

    return NextResponse.redirect(new URL('/dashboard?hubspot=connected', baseUrl))

  } catch (error) {
    console.error('HubSpot callback error:', error)
    return NextResponse.redirect(new URL('/dashboard?error=callback_failed', baseUrl))
  }
}
