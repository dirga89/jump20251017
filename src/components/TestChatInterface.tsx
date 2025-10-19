"use client"

import { useState, useRef, useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'
import NotificationBell from './NotificationBell'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  metadata?: any
  calendarEvents?: CalendarEvent[]
}

interface CalendarEvent {
  id: string
  title: string
  description?: string
  startTime: string
  endTime: string
  location?: string
  attendees?: string[]
}

// Helper function to parse calendar events from assistant response
const parseCalendarEvents = (content: string): CalendarEvent[] | null => {
  // Check if the response contains meeting/calendar event information
  const meetingPattern = /\d+\.\s\*\*(.*?)\*\*/g
  const matches = Array.from(content.matchAll(meetingPattern))
  
  if (matches.length === 0) return null
  
  const events: CalendarEvent[] = []
  const sections = content.split(/\d+\.\s\*\*/)
  
  sections.forEach((section, index) => {
    if (index === 0) return // Skip intro text
    
    const titleMatch = section.match(/^(.*?)\*\*/)
    const descMatch = section.match(/- \*\*Description:\*\* (.*?)(?:\n|$)/)
    const timeMatch = section.match(/- \*\*Time:\*\* (.*?)(?:\n|$)/)
    const locationMatch = section.match(/- \*\*Location:\*\* (.*?)(?:\n|$)/)
    const attendeesMatch = section.match(/- \*\*Attendees:\*\* (.*?)(?:\n|$)/)
    
    if (titleMatch && timeMatch) {
      events.push({
        id: `event-${index}`,
        title: titleMatch[1].trim(),
        description: descMatch ? descMatch[1].trim() : undefined,
        startTime: timeMatch[1].split(' - ')[0]?.trim() || '',
        endTime: timeMatch[1].split(' - ')[1]?.trim() || '',
        location: locationMatch ? locationMatch[1].trim() : undefined,
        attendees: attendeesMatch ? [attendeesMatch[1].trim()] : undefined
      })
    }
  })
  
  return events.length > 0 ? events : null
}

export default function TestChatInterface() {
  const { data: session, status } = useSession()
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hello! I'm your AI assistant for financial advisors. I can help you with Gmail, Calendar, and HubSpot integration.\n\n💡 **Tip:** Start your message with \"Remember:\" to create ongoing instructions I'll follow automatically.\n\nExamples:\n• \"Remember: When someone emails me that is not in HubSpot, create a contact with a note about the email\"\n• \"Remember: Always CC me on meeting confirmations\"\n\nWhat would you like to do?",
      timestamp: new Date()
    }
  ])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSyncingContacts, setIsSyncingContacts] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition()
        recognition.continuous = false
        recognition.interimResults = false
        recognition.lang = 'en-US'

        recognition.onstart = () => {
          setIsListening(true)
        }

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript
          setInputValue(transcript)
        }

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error)
          setIsListening(false)
        }

        recognition.onend = () => {
          setIsListening(false)
        }

        recognitionRef.current = recognition
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [])

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.')
      return
    }

    if (isListening) {
      recognitionRef.current.stop()
    } else {
      recognitionRef.current.start()
    }
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputValue,
          conversationId: 'default'
        })
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      const data = await response.json()
      
      // Try to parse calendar events from the response
      const calendarEvents = parseCalendarEvents(data.response)
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        metadata: data.metadata,
        calendarEvents: calendarEvents || undefined
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm sorry, I encountered an error processing your request. Please try again.",
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleSyncEmails = async () => {
    setIsSyncing(true)
    try {
      const response = await fetch('/api/sync/emails', {
        method: 'POST'
      })

      if (!response.ok) {
        throw new Error('Failed to sync emails')
      }

      const data = await response.json()
      
      const syncMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `✅ Successfully synced ${data.count} emails from Gmail! You can now ask me questions about your emails.`,
        timestamp: new Date()
      }
      
      setMessages(prev => [...prev, syncMessage])
    } catch (error) {
      console.error('Sync error:', error)
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: "❌ Failed to sync emails. Please make sure you've granted Gmail permissions.",
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsSyncing(false)
    }
  }

  const handleSyncContacts = async () => {
    setIsSyncingContacts(true)
    try {
      const response = await fetch('/api/sync/contacts', {
        method: 'POST'
      })

      if (!response.ok) {
        throw new Error('Failed to sync contacts')
      }

      const data = await response.json()
      
      const syncMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `✅ Successfully synced ${data.count} contacts from HubSpot! You can now ask me questions about your contacts.`,
        timestamp: new Date()
      }
      
      setMessages(prev => [...prev, syncMessage])
    } catch (error) {
      console.error('Sync error:', error)
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: "❌ Failed to sync contacts. Please make sure you've connected HubSpot in the dashboard.",
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsSyncingContacts(false)
    }
  }

  const handlePollEmails = async () => {
    setIsPolling(true)
    try {
      const response = await fetch('/api/proactive/poll-emails', {
        method: 'POST'
      })

      if (!response.ok) {
        throw new Error('Failed to poll emails')
      }

      const data = await response.json()
      
      const pollMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `🤖 Checked for new emails! The proactive agent has processed any new messages according to your ongoing instructions.`,
        timestamp: new Date()
      }
      
      setMessages(prev => [...prev, pollMessage])
    } catch (error) {
      console.error('Poll error:', error)
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: "❌ Failed to poll emails.",
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsPolling(false)
    }
  }

  // Show loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Show sign-in page if not authenticated
  if (!session) {
    // Check if there's an error in the URL
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    const error = urlParams?.get('error')
    
    const handleSignIn = () => {
      signIn('google', { callbackUrl: '/dashboard' })
    }
    
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Welcome to Ask Anything</h1>
          <p className="text-gray-600 mb-8">Please sign in with Google to access your financial advisor AI assistant</p>
          
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-left">
              <h3 className="text-sm font-semibold text-red-800 mb-2">Sign-in Error</h3>
              <p className="text-sm text-red-700 mb-2">Error: {error}</p>
              <p className="text-xs text-red-600">
                Please make sure:
                <br />• Your Google OAuth redirect URI is set to: <code className="bg-red-100 px-1">http://localhost:3000/api/auth/callback/google</code>
                <br />• You've added webshookeng@gmail.com as a test user in Google Cloud Console
              </p>
            </div>
          )}
          
          <button 
            onClick={handleSignIn}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }

  return (
          <div className="min-h-screen bg-white flex flex-col">
            {/* Header */}
            <div className="border-b border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-gray-900">Ask Anything</h1>
              <div className="flex items-center space-x-4">
                <NotificationBell />
                <button
                  onClick={() => window.location.href = '/dashboard'}
                  className="text-sm px-3 py-1 bg-gray-600 text-white hover:bg-gray-700 rounded transition-colors"
                >
                  📊 Dashboard
                </button>
                {/* <button
                  onClick={handleSyncEmails}
                  disabled={isSyncing}
                  className="text-sm px-3 py-1 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded transition-colors"
                >
                  {isSyncing ? 'Syncing...' : '🔄 Sync Emails'}
                </button>
                <button
                  onClick={handleSyncContacts}
                  disabled={isSyncingContacts}
                  className="text-sm px-3 py-1 bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded transition-colors"
                >
                  {isSyncingContacts ? 'Syncing...' : '👥 Sync Contacts'}
                </button> */}
                <button
                  onClick={handlePollEmails}
                  disabled={isPolling}
                  className="text-sm px-3 py-1 bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded transition-colors"
                >
                  {isPolling ? 'Checking...' : '🤖 Check New Emails'}
                </button>
                <div className="text-sm text-gray-500">
                  Welcome, {session.user?.name || session.user?.email}
                </div>
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to sign out?')) {
                        window.location.href = '/api/auth/signout'
                      }
                    }}
                    className="text-sm px-3 py-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                {/* Show calendar events as cards if available */}
                {message.calendarEvents && message.calendarEvents.length > 0 ? (
                  <div className="space-y-4">
                    <p className="text-sm mb-4 font-medium">📅 Your meetings for today:</p>
                    <div className="grid gap-3">
                      {message.calendarEvents.map((event) => (
                        <div
                          key={event.id}
                          className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-semibold text-gray-900 text-base flex-1">
                              {event.title}
                            </h3>
                            {event.location && (
                              <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                                📍 {event.location}
                              </span>
                            )}
                          </div>
                          
                          {event.description && (
                            <p className="text-sm text-gray-600 mb-3">
                              {event.description}
                            </p>
                          )}
                          
                          <div className="flex items-center text-sm text-gray-700 mb-2">
                            <span className="font-medium mr-2">🕐</span>
                            <span>{event.startTime} - {event.endTime}</span>
                          </div>
                          
                          {event.attendees && event.attendees.length > 0 && (
                            <div className="flex items-center text-sm text-gray-600">
                              <span className="font-medium mr-2">👥</span>
                              <span className="truncate">{event.attendees.join(', ')}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )}
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg px-4 py-3">
                <div className="flex items-center space-x-진">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span className="text-gray-600">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center space-x-3">
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder='Type your message... (Use "Remember:" for ongoing instructions)'
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
              disabled={isLoading}
            />
            
            {/* Microphone Button */}
            <button 
              onClick={toggleVoiceInput}
              disabled={isLoading}
              className={`p-2 rounded-lg transition-all ${
                isListening 
                  ? 'bg-red-500 text-white animate-pulse' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={isListening ? 'Listening... Click to stop' : 'Click to speak'}
            >
              {isListening ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                </svg>
              )}
            </button>
            
            <button 
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
