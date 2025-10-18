"use client"

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, XCircle, RefreshCw, Mail, Calendar, Users } from 'lucide-react'
import Link from 'next/link'

interface UserData {
  hubspotConnected: boolean
  emailCount: number
  contactCount: number
  eventCount: number
}

export default function Dashboard() {
  const { data: session, status } = useSession()
  const [userData, setUserData] = useState<UserData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.email) {
      fetchUserData()
    }
  }, [status, session])

  const fetchUserData = async () => {
    try {
      const response = await fetch('/api/user/data')
      if (response.ok) {
        const data = await response.json()
        setUserData(data)
      }
    } catch (error) {
      console.error('Error fetching user data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleHubSpotConnect = () => {
    const hubspotAuthUrl = `https://app.hubspot.com/oauth/authorize?client_id=${process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.NEXT_PUBLIC_HUBSPOT_REDIRECT_URI || '')}&scope=contacts%20crm.objects.contacts.read%20crm.objects.contacts.write`
    window.location.href = hubspotAuthUrl
  }

  const handleSync = async (type: 'emails' | 'contacts' | 'calendar') => {
    setIsSyncing(true)
    try {
      const response = await fetch(`/api/sync/${type}`, {
        method: 'POST'
      })
      
      if (response.ok) {
        await fetchUserData() // Refresh data
      }
    } catch (error) {
      console.error(`Error syncing ${type}:`, error)
    } finally {
      setIsSyncing(false)
    }
  }

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-8">Please sign in to access your dashboard</p>
          <Button asChild>
            <Link href="/api/auth/signin">Sign In</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-2">Welcome back, {session?.user?.name}</p>
        </div>

        {/* Connection Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Google (Gmail & Calendar) */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Google Integration</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4">
                Gmail and Google Calendar access
              </CardDescription>
              <div className="flex space-x-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleSync('emails')}
                  disabled={isSyncing}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Sync Emails
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleSync('calendar')}
                  disabled={isSyncing}
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Sync Calendar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* HubSpot */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">HubSpot CRM</CardTitle>
              {userData?.hubspotConnected ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4">
                CRM contacts and notes
              </CardDescription>
              {userData?.hubspotConnected ? (
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleSync('contacts')}
                  disabled={isSyncing}
                >
                  <Users className="w-4 h-4 mr-2" />
                  Sync Contacts
                </Button>
              ) : (
                <Button size="sm" onClick={handleHubSpotConnect}>
                  Connect HubSpot
                </Button>
              )}
            </CardContent>
          </Card>

          {/* AI Assistant */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">AI Assistant</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4">
                Ready to help with your data
              </CardDescription>
              <Button asChild size="sm">
                <Link href="/">
                  Start Chatting
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Data Overview */}
        {userData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Emails</CardTitle>
                <Mail className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{userData.emailCount}</div>
                <p className="text-xs text-muted-foreground">
                  Emails synced and indexed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Contacts</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{userData.contactCount}</div>
                <p className="text-xs text-muted-foreground">
                  HubSpot contacts synced
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Events</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{userData.eventCount}</div>
                <p className="text-xs text-muted-foreground">
                  Calendar events synced
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common tasks you can ask the AI assistant to help with
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium">Ask Questions</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• "Who mentioned their kid plays baseball?"</li>
                  <li>• "Why did Greg say he wanted to sell AAPL stock?"</li>
                  <li>• "Find all emails from John about the quarterly review"</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Request Actions</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• "Schedule an appointment with Sara Smith"</li>
                  <li>• "Create a contact for the new lead from LinkedIn"</li>
                  <li>• "Send follow-up email to all Q4 prospects"</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
