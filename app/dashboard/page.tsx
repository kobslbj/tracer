'use client'

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { EntriesTable } from '@/components/dashboard/entries-table'
import { Entry } from '@/lib/types'
import { insforge } from '@/lib/insforge'
import { updateEntryStatus } from '@/lib/insforge-db'

const REVIEW_TO_FILING_MS = 10_000
const FILING_TO_CLEARED_MS = 15_000

export default function DashboardPage() {
  const { state, dispatch } = useStore()
  const [newEntryId, setNewEntryId] = useState<string | null>(null)
  const prevLengthRef = useRef(state.entries.length)

  // Detect newly added entry (flash green)
  useEffect(() => {
    if (state.entries.length > prevLengthRef.current) {
      setNewEntryId(state.entries[0]?.id ?? null)
      prevLengthRef.current = state.entries.length
      const t = setTimeout(() => setNewEntryId(null), 2000)
      return () => clearTimeout(t)
    }
  }, [state.entries])

  // InsForge Realtime: subscribe to entry updates
  useEffect(() => {
    let connected = false

    async function connect() {
      await insforge.realtime.connect()
      connected = true
      await insforge.realtime.subscribe('entries')

      insforge.realtime.on('entry_updated', (payload: Record<string, unknown>) => {
        // Re-fetch entries when any entry changes in DB
        import('@/lib/insforge-db').then(({ fetchEntries }) => {
          fetchEntries().then(entries => {
            dispatch({ type: 'SET_ENTRIES', entries })
          })
        })
        console.log('[Realtime] entry_updated', payload)
      })
    }

    connect().catch(console.error)

    return () => {
      if (connected) insforge.realtime.disconnect()
    }
  }, [dispatch])

  // Status auto-ticker — also persists to InsForge DB
  useEffect(() => {
    const entries = state.entries
    const interval = setInterval(() => {
      const now = Date.now()
      entries.forEach((entry: Entry) => {
        if (entry.status === 'Review') {
          const elapsed = now - new Date(entry.updatedAt).getTime()
          if (elapsed >= REVIEW_TO_FILING_MS) {
            dispatch({ type: 'TICK_STATUS', id: entry.id })
            updateEntryStatus(entry.id, 'Filing').catch(console.error)
          }
        } else if (entry.status === 'Filing') {
          const elapsed = now - new Date(entry.updatedAt).getTime()
          if (elapsed >= FILING_TO_CLEARED_MS) {
            dispatch({ type: 'TICK_STATUS', id: entry.id })
            updateEntryStatus(entry.id, 'Cleared').catch(console.error)
          }
        }
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [state.entries, dispatch])

  const reviewCount = state.entries.filter(e => e.status === 'Review').length
  const filingCount = state.entries.filter(e => e.status === 'Filing').length
  const clearedCount = state.entries.filter(e => e.status === 'Cleared').length

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Entry Dashboard</h1>
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/50 border border-emerald-800/50 rounded-full px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </div>
        </div>
        <p className="text-muted-foreground mt-1">InsForge Realtime · Postgres-backed · auto-progression</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Under Review</p>
          <p className="text-3xl font-bold text-amber-400 mt-1">{reviewCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Filing</p>
          <p className="text-3xl font-bold text-blue-400 mt-1">{filingCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Cleared</p>
          <p className="text-3xl font-bold text-emerald-400 mt-1">{clearedCount}</p>
        </div>
      </div>

      <EntriesTable entries={state.entries} newEntryId={newEntryId} />
    </div>
  )
}
