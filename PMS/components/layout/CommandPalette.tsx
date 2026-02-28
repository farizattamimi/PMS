'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Search, ArrowRight, Command } from 'lucide-react'
import { navItems, GROUP_LABELS, GROUP_ORDER, NavItem } from '@/lib/nav-items'

// ── Context / hook ───────────────────────────────────────────────────────────
import { createContext, useContext } from 'react'

interface CommandPaletteContextValue {
  open: () => void
  close: () => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue>({
  open: () => {},
  close: () => {},
})

export function useCommandPalette() {
  return useContext(CommandPaletteContext)
}

// ── Provider + Palette ───────────────────────────────────────────────────────
export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const { data: session } = useSession()
  const role = session?.user?.systemRole

  // Filter items by role
  const allowedItems = navItems.filter(
    item => !item.roles || !role || item.roles.includes(role)
  )

  // Fuzzy filter by query
  const filtered: NavItem[] = query.trim()
    ? allowedItems.filter(item =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.href.toLowerCase().includes(query.toLowerCase())
      )
    : allowedItems

  // Group the filtered results
  const grouped = GROUP_ORDER.reduce<Record<string, NavItem[]>>((acc, key) => {
    const items = filtered.filter(i => (i.group ?? 'main') === key)
    if (items.length) acc[key] = items
    return acc
  }, {})

  // Flat list for keyboard navigation
  const flatList = GROUP_ORDER.flatMap(g => grouped[g] ?? [])

  const openPalette = useCallback(() => {
    setIsOpen(true)
    setQuery('')
    setActiveIndex(0)
  }, [])

  const closePalette = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    setActiveIndex(0)
  }, [])

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (isOpen) {
          closePalette()
        } else {
          openPalette()
        }
      }
      if (e.key === 'Escape' && isOpen) {
        closePalette()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, openPalette, closePalette])

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [isOpen])

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  function handleNavigate(item: NavItem) {
    router.push(item.href)
    closePalette()
  }

  function handleKeyNavigation(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, flatList.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flatList[activeIndex]) {
        handleNavigate(flatList[activeIndex])
      }
    }
  }

  return (
    <CommandPaletteContext.Provider value={{ open: openPalette, close: closePalette }}>
      {children}

      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
          onClick={closePalette}
        >
          {/* Palette modal */}
          <div
            className="w-full max-w-[540px] mx-4 overflow-hidden animate-fade-in-up"
            style={{
              background: 'var(--surface-raised)',
              border: '1px solid var(--border-strong)',
              borderRadius: '16px',
              boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Search input */}
            <div
              className="flex items-center gap-3 px-4 py-3.5"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <Search className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyNavigation}
                placeholder="Search pages…"
                className="flex-1 bg-transparent outline-none text-[14px] placeholder-opacity-40"
                style={{
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-plus-jakarta-sans, inherit)',
                }}
              />
              <kbd
                className="hidden sm:flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)', border: '1px solid var(--border-strong)' }}
              >
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[400px] overflow-y-auto py-1.5">
              {flatList.length === 0 && (
                <p className="text-center py-10 text-[13px]" style={{ color: 'var(--text-muted)' }}>
                  No pages found for "{query}"
                </p>
              )}

              {GROUP_ORDER.map(groupKey => {
                const items = grouped[groupKey]
                if (!items) return null
                return (
                  <div key={groupKey}>
                    {/* Group label */}
                    <p
                      className="px-4 pt-3 pb-1 text-[9px] font-bold uppercase tracking-[0.12em]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {GROUP_LABELS[groupKey]}
                    </p>

                    {items.map(item => {
                      const globalIndex = flatList.indexOf(item)
                      const isActive = globalIndex === activeIndex
                      const Icon = item.icon

                      return (
                        <button
                          key={item.href}
                          className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left"
                          style={{
                            background: isActive ? 'var(--accent-amber-muted)' : 'transparent',
                            color: isActive ? 'var(--accent-amber)' : 'var(--text-secondary)',
                          }}
                          onClick={() => handleNavigate(item)}
                          onMouseEnter={() => setActiveIndex(globalIndex)}
                        >
                          <div
                            className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{
                              background: isActive ? 'var(--accent-amber-muted)' : 'var(--surface-hover)',
                            }}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-[13px] font-medium flex-1">{item.label}</span>
                          {isActive && (
                            <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>

            {/* Footer hint */}
            <div
              className="px-4 py-2.5 flex items-center gap-4"
              style={{ borderTop: '1px solid var(--border)' }}
            >
              {[
                { keys: ['↑', '↓'], label: 'Navigate' },
                { keys: ['↵'], label: 'Open' },
                { keys: ['Esc'], label: 'Close' },
              ].map(({ keys, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  {keys.map(k => (
                    <kbd
                      key={k}
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)', border: '1px solid var(--border-strong)' }}
                    >
                      {k}
                    </kbd>
                  ))}
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </CommandPaletteContext.Provider>
  )
}

// ── Trigger button (for Topbar) ──────────────────────────────────────────────
export function CommandPaletteTrigger() {
  const { open } = useCommandPalette()
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  return (
    <button
      onClick={open}
      className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors"
      style={{
        background: 'var(--surface-hover)',
        border: '1px solid var(--border-strong)',
        color: 'var(--text-muted)',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
      title="Open command palette"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Search…</span>
      <div className="flex items-center gap-0.5">
        <kbd
          className="text-[9px] font-bold px-1 py-0.5 rounded"
          style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border-strong)', lineHeight: 1.4 }}
        >
          {isMac ? '⌘' : 'Ctrl'}
        </kbd>
        <kbd
          className="text-[9px] font-bold px-1 py-0.5 rounded"
          style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border-strong)', lineHeight: 1.4 }}
        >
          K
        </kbd>
      </div>
    </button>
  )
}
