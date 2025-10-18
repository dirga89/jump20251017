"use client"

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'

export default function DebugPage() {
  const { data: session, status } = useSession()
  const [envData, setEnvData] = useState<any>(null)

  useEffect(() => {
    fetch('/api/test-env')
      .then(res => res.json())
      .then(data => setEnvData(data))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-2xl font-bold mb-6">Debug Information</h1>
      
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Session Status</h2>
          <p><strong>Status:</strong> {status}</p>
          <p><strong>Session:</strong> {session ? 'Authenticated' : 'Not authenticated'}</p>
          {session && (
            <div className="mt-4">
              <p><strong>User:</strong> {session.user?.name}</p>
              <p><strong>Email:</strong> {session.user?.email}</p>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Environment Variables</h2>
          {envData ? (
            <div className="space-y-2">
              <p><strong>Google Client ID:</strong> {envData.hasGoogleClientId ? '✅ Set' : '❌ Not set'}</p>
              <p><strong>Google Client Secret:</strong> {envData.hasGoogleClientSecret ? '✅ Set' : '❌ Not set'}</p>
              <p><strong>NextAuth Secret:</strong> {envData.hasNextAuthSecret ? '✅ Set' : '❌ Not set'}</p>
              <p><strong>NextAuth URL:</strong> {envData.nextAuthUrl || '❌ Not set'}</p>
              <p><strong>Google Client ID (prefix):</strong> {envData.googleClientIdPrefix}</p>
            </div>
          ) : (
            <p>Loading...</p>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Actions</h2>
          <div className="space-x-4">
            <a 
              href="/api/auth/signin"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Sign In
            </a>
            <a 
              href="/api/auth/signout"
              className="inline-block px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Sign Out
            </a>
            <a 
              href="/"
              className="inline-block px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Back to App
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
