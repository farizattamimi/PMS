'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { Card } from '@/components/ui/Card'

type CalendarEventType = 'PM' | 'COMPLIANCE' | 'LEASE_RENEWAL' | 'INSPECTION'

interface CalendarEvent {
  id: string
  date: string          // YYYY-MM-DD
  type: CalendarEventType
  title: string
  propertyId: string
  propertyName: string
  status: string
  href: string
}

interface CalendarResponse {
  events: CalendarEvent[]
  properties: { id: string; name: string }[]
  range: { start: string; end: string }
}

// ── Styling ────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<CalendarEventType, {
  label: string
  dot: string
  pill: string
  border: string
}> = {
  PM:            { label: 'PM Schedule',    dot: 'bg-blue-500',   pill: 'bg-blue-100 text-blue-800',   border: 'border-blue-300' },
  COMPLIANCE:    { label: 'Compliance',     dot: 'bg-orange-500', pill: 'bg-orange-100 text-orange-800', border: 'border-orange-300' },
  LEASE_RENEWAL: { label: 'Lease Renewal',  dot: 'bg-purple-500', pill: 'bg-purple-100 text-purple-800', border: 'border-purple-300' },
  INSPECTION:    { label: 'Inspection',     dot: 'bg-green-500',  pill: 'bg-green-100 text-green-800',  border: 'border-green-300' },
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ── Helpers ────────────────────────────────────────────────────────────────────

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1)
}

function endOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0)
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const today = new Date()
  const [year, setYear]               = useState(today.getFullYear())
  const [month, setMonth]             = useState(today.getMonth())          // 0-indexed
  const [data, setData]               = useState<CalendarResponse | null>(null)
  const [loading, setLoading]         = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(toYMD(today))
  const [propertyFilter, setPropertyFilter] = useState('')

  // Build the grid: 6 rows × 7 cols starting from the Sunday before month start
  const monthStart = startOfMonth(year, month)
  const monthEnd   = endOfMonth(year, month)
  const gridStart  = new Date(monthStart)
  gridStart.setDate(gridStart.getDate() - gridStart.getDay()) // back to Sunday

  const gridDays: Date[] = []
  const cursor = new Date(gridStart)
  while (gridDays.length < 42) {
    gridDays.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    // Fetch a slightly wider range to catch edge-day events
    const start = toYMD(gridStart)
    const end   = toYMD(new Date(gridStart.getTime() + 41 * 86400000))
    const qs = new URLSearchParams({ start, end })
    if (propertyFilter) qs.set('propertyId', propertyFilter)
    try {
      const res = await fetch(`/api/calendar?${qs}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, propertyFilter])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Event maps ─────────────────────────────────────────────────────────────

  const eventsByDate = new Map<string, CalendarEvent[]>()
  for (const ev of data?.events ?? []) {
    const list = eventsByDate.get(ev.date) ?? []
    list.push(ev)
    eventsByDate.set(ev.date, list)
  }

  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) ?? []) : []

  // ── Navigation ─────────────────────────────────────────────────────────────

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }
  function goToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
    setSelectedDate(toYMD(today))
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const todayStr = toYMD(today)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Link href="/dashboard" className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> Dashboard
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
            <p className="text-sm text-gray-500">PM schedules, compliance, lease renewals & inspections</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Property filter */}
          {data && data.properties.length > 1 && (
            <select
              value={propertyFilter}
              onChange={e => setPropertyFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Properties</option>
              {data.properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}

          {/* Month nav */}
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-semibold text-gray-900 min-w-[160px] text-center">
              {monthLabel(year, month)}
            </span>
            <button
              onClick={nextMonth}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={goToday}
            className="text-sm px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-400 text-gray-600 hover:text-gray-900 transition-colors"
          >
            Today
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* ── Calendar Grid ───────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <Card className="overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b">
              {DAYS_OF_WEEK.map(d => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            {loading ? (
              <div className="py-20 text-center text-gray-400 text-sm">Loading…</div>
            ) : (
              <div className="grid grid-cols-7">
                {gridDays.map((day, idx) => {
                  const dateStr    = toYMD(day)
                  const isToday    = dateStr === todayStr
                  const isCurMonth = day.getMonth() === month
                  const isSelected = dateStr === selectedDate
                  const dayEvents  = eventsByDate.get(dateStr) ?? []
                  const overflow   = dayEvents.length > 3

                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedDate(dateStr)}
                      className={[
                        'min-h-[90px] p-1.5 text-left border-b border-r transition-colors',
                        // Grid border cleanup: last row no border-b, every 7th no border-r
                        idx >= 35 ? 'border-b-0' : '',
                        (idx + 1) % 7 === 0 ? 'border-r-0' : '',
                        isSelected  ? 'bg-blue-50'  : 'hover:bg-gray-50',
                        !isCurMonth ? 'bg-gray-50/50' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      {/* Date number */}
                      <div className="mb-1">
                        <span className={[
                          'inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium',
                          isToday    ? 'bg-blue-600 text-white'        :
                          isSelected ? 'bg-blue-100 text-blue-700'     :
                          isCurMonth ? 'text-gray-900'                 :
                                       'text-gray-400',
                        ].join(' ')}>
                          {day.getDate()}
                        </span>
                      </div>

                      {/* Event pills */}
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map(ev => (
                          <div
                            key={ev.id}
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded truncate leading-tight ${TYPE_CONFIG[ev.type].pill}`}
                            title={ev.title}
                          >
                            {ev.title}
                          </div>
                        ))}
                        {overflow && (
                          <div className="text-[10px] text-gray-400 font-medium px-1">
                            +{dayEvents.length - 3} more
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            {(Object.entries(TYPE_CONFIG) as [CalendarEventType, typeof TYPE_CONFIG[CalendarEventType]][]).map(([type, cfg]) => (
              <div key={type} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </div>
            ))}
          </div>
        </div>

        {/* ── Day Detail Panel ──────────────────────────────────────────────── */}
        <div className="w-80 flex-shrink-0">
          <Card className="p-4 sticky top-6">
            <h2 className="font-semibold text-gray-900 mb-1">
              {selectedDate
                ? new Date(selectedDate + 'T12:00:00').toLocaleDateString(undefined, {
                    weekday: 'long', month: 'long', day: 'numeric',
                  })
                : 'Select a day'
              }
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              {selectedEvents.length === 0 ? 'No events' : `${selectedEvents.length} event${selectedEvents.length !== 1 ? 's' : ''}`}
            </p>

            {selectedEvents.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Nothing scheduled.</p>
            ) : (
              <div className="space-y-2">
                {selectedEvents.map(ev => {
                  const cfg = TYPE_CONFIG[ev.type]
                  return (
                    <Link
                      key={ev.id}
                      href={ev.href}
                      className={`block rounded-lg border p-3 hover:shadow-sm transition-shadow ${cfg.border} bg-white`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                        <div className="min-w-0">
                          <p className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${cfg.pill.split(' ')[1]}`}>
                            {cfg.label}
                          </p>
                          <p className="text-sm font-medium text-gray-900 leading-snug">{ev.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{ev.propertyName}</p>
                          <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded ${cfg.pill}`}>
                            {ev.status}
                          </span>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
