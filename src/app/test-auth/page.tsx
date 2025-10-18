"use client"

import { signIn, getSession } from "next-auth/react"
import { useState } from "react"

export default function TestAuthPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string>("")

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setResult("")
    
    try {
      const result = await signIn("google", {
        redirect: false,
        callbackUrl: "/"
      })
      
      setResult(JSON.stringify(result, null, 2))
    } catch (error) {
      setResult(`Error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const checkSession = async () => {
    const session = await getSession()
    setResult(JSON.stringify(session, null, 2))
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-2xl font-bold mb-6">Google OAuth Test</h1>
      
      <div className="space-y-4">
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? "Loading..." : "Sign In with Google"}
        </button>
        
        <button
          onClick={checkSession}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Check Session
        </button>
        
        {result && (
          <div className="mt-4 p-4 bg-white rounded border">
            <h3 className="font-semibold mb-2">Result:</h3>
            <pre className="text-sm overflow-auto">{result}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
