'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { ChevronLeft, Send, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import { formatDate } from '@/lib/utils'
import { useSession } from 'next-auth/react'

export default function MessageThreadPage() {
  const { id } = useParams<{ id: string }>()
  const { data: session } = useSession()
  const [thread, setThread] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const isManager = session?.user?.systemRole !== 'TENANT'

  const load = useCallback(async () => {
    const res = await fetch(`/api/messages/threads/${id}`)
    const data = await res.json()
    setThread(data)
  }, [id])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread?.messages])

  async function sendReply(e: React.FormEvent) {
    e.preventDefault()
    if (!reply.trim()) return
    setSending(true)
    await fetch(`/api/messages/threads/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: reply }),
    })
    setReply('')
    setSending(false)
    load()
  }

  async function closeThread() {
    await fetch(`/api/messages/threads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: thread.status === 'CLOSED' ? 'OPEN' : 'CLOSED' }),
    })
    load()
  }

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
  if (!thread || thread.error) return <div className="text-center py-20 text-gray-500">Thread not found</div>

  const currentUserId = session?.user?.id

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <Link href="/dashboard/messages" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
        <ChevronLeft className="h-4 w-4" /> Back to Messages
      </Link>

      <div className="flex items-start justify-between mb-4">
        <div>
          <PageHeader title={thread.subject} subtitle={`${thread.property?.name} · ${thread.tenant?.user?.name}`} />
        </div>
        {isManager && (
          <Button variant="secondary" size="sm" onClick={closeThread}>
            <XCircle className="h-4 w-4 mr-1.5" />
            {thread.status === 'CLOSED' ? 'Reopen' : 'Close Thread'}
          </Button>
        )}
      </div>

      {thread.status === 'CLOSED' && (
        <div className="mb-3 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2">
          This thread is closed. {isManager ? 'Reopen to send new messages.' : ''}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
        {(thread.messages ?? []).map((msg: any) => {
          const isMe = msg.authorId === currentUserId
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${isMe ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm'}`}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                <p className={`text-xs mt-1 ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>
                  {formatDate(msg.createdAt)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply box */}
      {thread.status !== 'CLOSED' && (
        <form onSubmit={sendReply} className="flex gap-2 border-t border-gray-100 pt-3">
          <input
            value={reply}
            onChange={e => setReply(e.target.value)}
            placeholder="Type a message…"
            className="flex-1 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(e as any) } }}
          />
          <Button type="submit" disabled={sending || !reply.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      )}
    </div>
  )
}
