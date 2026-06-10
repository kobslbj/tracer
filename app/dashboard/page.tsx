'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { useAuth } from '@/lib/auth'
import { AttentionQueueTable } from '@/components/dashboard/attention-queue-table'
import { EntryModal } from '@/components/entry/entry-modal'
import { Entry, PrimaryQueue } from '@/lib/types'
import { insforge } from '@/lib/insforge'
import {
  PRIMARY_QUEUE_LABELS,
  isQueueEntry,
  deriveTriageRow,
  deriveActiveIssueStats,
  deriveEmptyStateMessage,
  isResolved,
} from '@/lib/entry-triage'
import { buildSupplierProfileIndex } from '@/lib/supplier-profile'
import { cn } from '@/lib/utils'

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
  const { user, loading: authLoading } = useAuth()
  const [newEntryId, setNewEntryId] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [activeTab, setActiveTab] = useState<PrimaryQueue>('waiting_on_docs')
  const prevLengthRef = useRef(state.entries.length)

  const queueEntries = useMemo(
    () => state.entries.filter(e => isQueueEntry(e) && !isResolved(e)),
    [state.entries],
  )

  const supplierIndex = useMemo(() => buildSupplierProfileIndex(state.entries), [state.entries])
  const activeStats = useMemo(() => deriveActiveIssueStats(queueEntries), [queueEntries])

  useEffect(() => {
    if (state.entries.length > prevLengthRef.current) {
      setNewEntryId(state.entries[0]?.id ?? null)
      prevLengthRef.current = state.entries.length
      const t = setTimeout(() => setNewEntryId(null), 2000)
      return () => clearTimeout(t)
    }
  }, [state.entries])

  useEffect(() => {
    if (authLoading || !user) return

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
  }, [dispatch, authLoading, user])

  const filteredEntries = useMemo(() => {
    return queueEntries.filter(entry => {
      const row = deriveTriageRow(entry)
      return row.primaryStatus === activeTab
    })
  }, [queueEntries, activeTab])

  const emptyStateMessage = useMemo(
    () => deriveEmptyStateMessage('active', activeTab, []),
    [activeTab],
  )

  const summaryLine = useMemo(() => {
    const parts = [
      `${activeStats.needsAttention} ${shipmentWord(activeStats.needsAttention)} need attention`,
      `${activeStats.waitingOnDocs} waiting on docs`,
      `${activeStats.readyForReview} ready for review`,
    ]
    return parts.join(' · ')
  }, [activeStats])

  function handleEntryUpdated(updated: Entry) {
    dispatch({ type: 'UPDATE_ENTRY', entry: updated })
    setSelectedEntry(updated)
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-primary/80">Attention OS</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Shipment Review Queue
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            The coordination layer before customs filing — who&apos;s waiting, what&apos;s blocking, what changed.
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

      <p className="mb-6 text-sm text-muted-foreground">{summaryLine}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-border pb-3">
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

      <AttentionQueueTable
        entries={filteredEntries}
        supplierIndex={supplierIndex}
        newEntryId={newEntryId}
        emptyStateMessage={emptyStateMessage}
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
