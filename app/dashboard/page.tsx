'use client'

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { EntriesTable } from '@/components/dashboard/entries-table'
import { EntryModal } from '@/components/entry/entry-modal'
import { Entry } from '@/lib/types'
import { insforge } from '@/lib/insforge'
import { updateEntryStatus } from '@/lib/insforge-db'

const REVIEW_TO_FILING_MS = 10_000
const FILING_TO_CLEARED_MS = 15_000

export default function DashboardPage() {
  const { state, dispatch } = useStore()
  const [newEntryId, setNewEntryId] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
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

  const stats = [
    { label: 'Under Review', value: reviewCount, tone: 'text-amber-400', glow: 'oklch(0.78 0.15 85 / 0.35)' },
    { label: 'Filing', value: filingCount, tone: 'text-blue-400', glow: 'oklch(0.7 0.15 250 / 0.35)' },
    { label: 'Cleared', value: clearedCount, tone: 'text-emerald-400', glow: 'oklch(0.72 0.16 160 / 0.35)' },
  ]

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Entry Dashboard</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Live customs entries, synced from InsForge Postgres via Realtime.
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-800/50 bg-emerald-950/40 px-2.5 py-1 text-xs text-emerald-400">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          Live
        </div>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        {stats.map(s => (
          <div
            key={s.label}
            className="relative overflow-hidden rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm"
          >
            <div
              className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl"
              style={{ background: s.glow }}
            />
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className={`mt-1 text-3xl font-semibold tabular-nums ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Status legend */}
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-1">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Status flow</span>
        {[
          { dot: 'bg-zinc-400', label: 'Draft', desc: 'AI-drafted, not yet approved' },
          { dot: 'bg-amber-400', label: 'Review', desc: 'Awaiting broker approval' },
          { dot: 'bg-blue-400', label: 'Filing', desc: 'Submitting to CBP' },
          { dot: 'bg-emerald-400', label: 'Cleared', desc: 'Released by customs' },
        ].map((s, i, arr) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
            <span className="text-xs font-medium text-foreground">{s.label}</span>
            <span className="text-xs text-muted-foreground">· {s.desc}</span>
            {i < arr.length - 1 && <span className="ml-3 text-muted-foreground/40">→</span>}
          </div>
        ))}
      </div>

      <EntriesTable entries={state.entries} newEntryId={newEntryId} onRowClick={setSelectedEntry} />

      <EntryModal
        entry={selectedEntry}
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </div>
  )
}
