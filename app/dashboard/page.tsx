'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { AttentionQueueTable } from '@/components/dashboard/attention-queue-table'
import { EntryModal } from '@/components/entry/entry-modal'
import { Entry, PrimaryQueue } from '@/lib/types'
import { insforge } from '@/lib/insforge'
import {
  PRIMARY_QUEUE_LABELS,
  TAG_FILTER_CHIPS,
  RESOLUTION_FILTER_CHIPS,
  isQueueEntry,
  deriveTriageRow,
  matchesAllTagFilters,
  matchesResolutionFilter,
  deriveActiveIssueStats,
  deriveResolutionMetrics,
  deriveTagCounts,
  deriveEmptyStateMessage,
  type ResolutionFilter,
} from '@/lib/entry-triage'
import { cn } from '@/lib/utils'
import { Rows3, Rows4 } from 'lucide-react'

const COMPACT_STORAGE_KEY = 'tracer-queue-compact'

const PRIMARY_TABS: PrimaryQueue[] = [
  'needs_attention',
  'waiting_on_docs',
  'ready_for_review',
]

function shipmentWord(n: number): string {
  return n === 1 ? 'shipment' : 'shipments'
}

export default function DashboardPage() {
  const { state, dispatch } = useStore()
  const [newEntryId, setNewEntryId] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [activeTab, setActiveTab] = useState<PrimaryQueue>('needs_attention')
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([])
  const [resolutionFilter, setResolutionFilter] = useState<ResolutionFilter>('active')
  const [compact, setCompact] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return localStorage.getItem(COMPACT_STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })
  const prevLengthRef = useRef(state.entries.length)

  function toggleCompact() {
    setCompact(prev => {
      const next = !prev
      try {
        localStorage.setItem(COMPACT_STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const queueEntries = useMemo(
    () => state.entries.filter(isQueueEntry),
    [state.entries],
  )

  const activeStats = useMemo(() => deriveActiveIssueStats(queueEntries), [queueEntries])
  const resolutionMetrics = useMemo(() => deriveResolutionMetrics(queueEntries), [queueEntries])
  const tagCounts = useMemo(() => deriveTagCounts(queueEntries), [queueEntries])

  useEffect(() => {
    if (state.entries.length > prevLengthRef.current) {
      setNewEntryId(state.entries[0]?.id ?? null)
      prevLengthRef.current = state.entries.length
      const t = setTimeout(() => setNewEntryId(null), 2000)
      return () => clearTimeout(t)
    }
  }, [state.entries])

  useEffect(() => {
    let connected = false

    async function connect() {
      await insforge.realtime.connect()
      connected = true
      await insforge.realtime.subscribe('entries')

      insforge.realtime.on('entry_updated', () => {
        import('@/lib/insforge-db').then(({ fetchEntries }) => {
          fetchEntries().then(entries => {
            dispatch({ type: 'SET_ENTRIES', entries })
          })
        })
      })
    }

    connect().catch(console.error)

    return () => {
      if (connected) insforge.realtime.disconnect()
    }
  }, [dispatch])

  const filteredEntries = useMemo(() => {
    return queueEntries.filter(entry => {
      if (!matchesResolutionFilter(entry, resolutionFilter)) return false

      if (resolutionFilter === 'active') {
        const row = deriveTriageRow(entry)
        if (row.primaryStatus !== activeTab) return false
      }

      if (activeTagFilters.length > 0 && !matchesAllTagFilters(entry, activeTagFilters)) {
        return false
      }

      return true
    })
  }, [queueEntries, activeTab, activeTagFilters, resolutionFilter])

  const emptyStateMessage = useMemo(
    () => deriveEmptyStateMessage(resolutionFilter, activeTab, activeTagFilters),
    [resolutionFilter, activeTab, activeTagFilters],
  )

  const summaryLine = useMemo(() => {
    if (resolutionFilter === 'ready_to_submit') {
      const n = resolutionMetrics.readyToSubmit
      return n === 0
        ? 'No shipments ready for submission review'
        : `${n} ${shipmentWord(n)} ready for submission review`
    }
    const parts = [
      `${activeStats.needsAttention} ${shipmentWord(activeStats.needsAttention)} need attention`,
      `${activeStats.waitingOnDocs} waiting on docs`,
      `${activeStats.readyForReview} ready for review`,
    ]
    return parts.join(' · ')
  }, [resolutionFilter, activeStats, resolutionMetrics.readyToSubmit])

  function toggleTagFilter(id: string) {
    setActiveTagFilters(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id],
    )
  }

  function handleEntryUpdated(updated: Entry) {
    dispatch({ type: 'UPDATE_ENTRY', entry: updated })
    setSelectedEntry(updated)
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Shipment Review Queue
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            Review shipments by operational risk, missing documents, and regulatory flags.
            Pre-filing only — not CBP release status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleCompact}
            title={compact ? 'Switch to comfortable density' : 'Switch to compact density'}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
              compact
                ? 'border-primary/40 bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {compact ? <Rows3 className="h-3.5 w-3.5" /> : <Rows4 className="h-3.5 w-3.5" />}
            {compact ? 'Compact' : 'Comfortable'}
          </button>
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-800/50 bg-emerald-950/40 px-2.5 py-1 text-xs text-emerald-400">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          Live
          </div>
        </div>
      </div>

      {/* Contextual summary + throughput */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{summaryLine}</p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setResolutionFilter('ready_to_submit')}
            className="rounded-lg border border-border bg-card/50 px-3 py-2 text-left transition-colors hover:bg-card/70"
          >
            <p className="text-xs text-muted-foreground">Reviewed Today</p>
            <p className="text-lg font-semibold tabular-nums text-emerald-400">
              {resolutionMetrics.reviewedToday}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setResolutionFilter('ready_to_submit')}
            className="rounded-lg border border-border bg-card/50 px-3 py-2 text-left transition-colors hover:bg-card/70"
          >
            <p className="text-xs text-muted-foreground">Ready to Submit</p>
            <p className="text-lg font-semibold tabular-nums text-emerald-400">
              {resolutionMetrics.readyToSubmit}
            </p>
          </button>
        </div>
      </div>

      {/* View scope */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          View
        </span>
        {RESOLUTION_FILTER_CHIPS.map(chip => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setResolutionFilter(chip.id)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
              resolutionFilter === chip.id
                ? 'border-primary/50 bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Queue tabs — sole queue navigation */}
      {resolutionFilter === 'active' && (
        <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-border pb-3">
          <span className="mr-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Queue
          </span>
          {PRIMARY_TABS.map(status => {
            const count =
              status === 'needs_attention'
                ? activeStats.needsAttention
                : status === 'waiting_on_docs'
                  ? activeStats.waitingOnDocs
                  : activeStats.readyForReview
            return (
              <button
                key={status}
                type="button"
                onClick={() => setActiveTab(status)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  activeTab === status
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {PRIMARY_QUEUE_LABELS[status]}
                <span className="ml-1.5 tabular-nums text-muted-foreground">({count})</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Tag filters with counts */}
      {resolutionFilter === 'active' && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Tags
          </span>
          {TAG_FILTER_CHIPS.map(chip => {
            const count = tagCounts[chip.id] ?? 0
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => toggleTagFilter(chip.id)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                  activeTagFilters.includes(chip.id)
                    ? 'border-primary/50 bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {chip.label}
                {count > 0 && (
                  <span className="ml-1 tabular-nums opacity-70">({count})</span>
                )}
              </button>
            )
          })}
          {activeTagFilters.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTagFilters([])}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear tags
            </button>
          )}
        </div>
      )}

      <AttentionQueueTable
        entries={filteredEntries}
        newEntryId={newEntryId}
        showPrimaryStatus={resolutionFilter !== 'ready_to_submit'}
        emptyStateMessage={emptyStateMessage}
        compact={compact}
        onRowClick={setSelectedEntry}
      />

      <EntryModal
        entry={selectedEntry}
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
        onEntryUpdated={handleEntryUpdated}
      />
    </div>
  )
}
