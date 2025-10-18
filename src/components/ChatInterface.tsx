"use client"

import { useState, useRef, useEffect } from 'react'
import { Send, Plus, ChevronDown, Mic, X } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  metadata?: any
}

interface Meeting {
  id: string
  title: string
  time: string
  attendees: string[]
  date: string
}

export default function ChatInterface() {
  const { data: session } = useSession()
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "I can answer questions about any Jump meeting. What do you want to know?",
      timestamp: new Date()
    }
  ])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('chat')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

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
          conversationId: 'default' // For now, using a default conversation
        })
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      const data = await response.json()
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        metadata: data.metadata
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

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Welcome to Ask Anything</h1>
          <p className="text-gray-600 mb-8">Please sign in to access your financial advisor AI assistant</p>
          <Button asChild>
            <a href="/api/auth/signin">Sign in with Google</a>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-gray-900">Ask Anything</h1>
            <div className="flex space-x-1">
              <button
                className={`px-3 py-1 text-sm font-medium ${
                  activeTab === 'chat' 
                    ? 'text-blue-600 border-b-2 border-blue-600' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setActiveTab('chat')}
              >
                Chat
              </button>
              <button
                className={`px-3 py-1 text-sm font-medium ${
                  activeTab === 'history' 
                    ? 'text-blue-600 border-b-2 border-blue-600' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setActiveTab('history')}
              >
                History
              </button>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Button variant="outline" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              New thread
            </Button>
            <button className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Context Info */}
      <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">
            Context set to all meetings
          </span>
          <span className="text-sm text-gray-500">
            11:17am - May 13, 2025
          </span>
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
                    ? 'bg-gray-100 text-gray-900'
                    : 'bg-white border border-gray-200 text-gray-900'
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                
                {/* Meeting cards for assistant messages */}
                {message.metadata?.meetings && (
                  <div className="mt-4 space-y-4">
                    {Object.entries(message.metadata.meetings).map(([date, meetings]: [string, any]) => (
                      <div key={date}>
                        <h3 className="font-medium text-gray-900 mb-2">{date}</h3>
                        <div className="space-y-3">
                          {meetings.map((meeting: Meeting) => (
                            <div key={meeting.id} className="bg-white border border-gray-200 rounded-lg p-4">
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="text-sm text-gray-500">{meeting.time}</p>
                                  <h4 className="font-semibold text-gray-900">{meeting.title}</h4>
                                  <div className="flex items-center space-x-2 mt-2">
                                    {meeting.attendees.map((attendee, index) => (
                                      <div
                                        key={index}
                                        className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center text-xs font-medium"
                                      >
                                        {attendee.charAt(0).toUpperCase()}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
                <div className="flex items-center space-x-2">
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
            <button className="text-gray-400 hover:text-gray-600">
              <Plus className="w-5 h-5" />
            </button>
            <div className="flex items-center space-x-2 bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-sm text-gray-600">All meetings</span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </div>
            <div className="flex-1 relative">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask anything about your meetings..."
                className="w-full pr-20"
                disabled={isLoading}
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
                <button className="text-gray-400 hover:text-gray-600">
                  <Mic className="w-4 h-4" />
                </button>
                <button 
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isLoading}
                  className="text-blue-600 hover:text-blue-700 disabled:text-gray-400"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">🐕</span>
              </div>
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">🌐</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
