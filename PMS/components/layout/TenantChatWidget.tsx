'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageCircle, Send, X, RotateCcw } from 'lucide-react'

const QUICK_ACTIONS = [
  { label: 'Check my balance', message: 'What is my current account balance?' },
  { label: 'Make a rent payment', message: "I'd like to make a rent payment" },
  { label: 'Submit maintenance request', message: 'I need to submit a maintenance request' },
  { label: 'View my work orders', message: 'Show me my current work orders' },
  { label: 'Check renewal offers', message: 'Are there any lease renewal offers for me?' },
  { label: 'Renew my lease', message: 'I want to renew my lease' },
]

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export function TenantChatWidget() {
  const [showChat, setShowChat] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatStreaming, setChatStreaming] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || chatStreaming) return

    const userMsg: ChatMessage = { role: 'user', content: trimmed }
    const newMessages = [...chatMessages, userMsg]
    setChatMessages([...newMessages, { role: 'assistant', content: '' }])
    setChatInput('')
    setChatStreaming(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })

      if (!res.ok || !res.body) {
        setChatMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { ...updated[updated.length - 1], content: 'Sorry, something went wrong. Please try again.' }
          return updated
        })
        setChatStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = dec.decode(value, { stream: true })
        setChatMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: updated[updated.length - 1].content + chunk,
          }
          return updated
        })
      }
    } catch {
      setChatMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { ...updated[updated.length - 1], content: 'Connection error. Please try again.' }
        return updated
      })
    } finally {
      setChatStreaming(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setShowChat(v => !v)}
        className="fixed bottom-6 right-6 z-50 h-12 w-12 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-indigo-700 transition-colors"
        aria-label="Open tenant assistant"
      >
        <MessageCircle className="h-5 w-5" />
      </button>

      {showChat && (
        <div
          className="fixed bottom-20 right-6 w-80 z-50 bg-white rounded-2xl shadow-xl border border-gray-200 flex flex-col"
          style={{ maxHeight: '480px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-sm text-gray-900 flex items-center gap-1.5">
              <MessageCircle className="h-4 w-4 text-indigo-600" /> Tenant Assistant
            </span>
            <div className="flex items-center gap-1.5">
              {chatMessages.length > 0 && (
                <button
                  onClick={() => setChatMessages([])}
                  className="text-gray-400 hover:text-gray-600"
                  title="Clear conversation"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <button onClick={() => setShowChat(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages / Quick Actions */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ maxHeight: '340px' }}>
            {chatMessages.length === 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs text-gray-400 text-center mb-3 pt-1">
                  Hi! I can help with your lease, payments, and maintenance.
                </p>
                {QUICK_ACTIONS.map(action => (
                  <button
                    key={action.label}
                    onClick={() => sendMessage(action.message)}
                    disabled={chatStreaming}
                    className="w-full text-left text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg px-3 py-2 transition-colors border border-indigo-100 disabled:opacity-50"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : (
              chatMessages.map((m, i) => (
                <div
                  key={i}
                  className={`text-xs rounded-lg px-3 py-2 leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-indigo-50 text-indigo-900 ml-6'
                      : 'bg-gray-50 text-gray-700 mr-6'
                  }`}
                >
                  {m.content ||
                    (chatStreaming && i === chatMessages.length - 1 ? (
                      <span className="animate-pulse text-gray-400">Thinking…</span>
                    ) : (
                      ''
                    ))}
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2 px-4 py-3 border-t border-gray-100">
            <input
              className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ask a question…"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage(chatInput)
                }
              }}
              disabled={chatStreaming}
            />
            <button
              onClick={() => sendMessage(chatInput)}
              disabled={chatStreaming || !chatInput.trim()}
              className="bg-indigo-600 text-white rounded-lg px-2.5 py-1.5 disabled:opacity-50 hover:bg-indigo-700 transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
