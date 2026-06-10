'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Entry } from '@/lib/types'
import { PrimaryStatusBadge, ResolutionBadge } from './status-badge'
import { deriveTriageRow, getReviewSnapshot, sortEntriesForQueue } from '@/lib/entry-triage'
import { SupplierProfile } from '@/lib/supplier-profile'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface AttentionQueueTableProps {
  entries: Entry[]
  /** Cross-shipment supplier history, keyed by normalized supplier name. */
  supplierIndex?: Map<string, SupplierProfile>
  newEntryId?: string | null
  showPrimaryStatus?: boolean
  emptyStateMessage?: string
  compact?: boolean
  onRowClick?: (entry: Entry) => void
}

export function AttentionQueueTable({
  entries,
  supplierIndex,
  newEntryId,
  showPrimaryStatus = true,
  emptyStateMessage = 'No shipments match this view.',
  compact = false,
  onRowClick,
}: AttentionQueueTableProps) {
  const sorted = sortEntriesForQueue(entries)

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/40 px-4 py-8 text-center backdrop-blur-sm">
        <p className="text-xs text-muted-foreground">{emptyStateMessage}</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/40 backdrop-blur-sm">
      <Table>
        <TableHeader>
          <TableRow className={cn('border-border bg-muted/30 hover:bg-transparent', compact && 'h-7')}>
            <TableHead className={cn('font-medium text-muted-foreground', compact && 'h-7 py-1 text-[11px]')}>Shipment</TableHead>
            {showPrimaryStatus && (
              <TableHead className={cn('font-medium text-muted-foreground', compact && 'h-7 py-1 text-[11px]')}>Status</TableHead>
            )}
            <TableHead className={cn('font-medium text-muted-foreground', compact && 'h-7 py-1 text-[11px]')}>Next step</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <AnimatePresence initial={false}>
            {sorted.map(entry => {
              const row = deriveTriageRow(entry, supplierIndex)
              return (
                <motion.tr
                  key={entry.id}
                  layout
                  initial={
                    entry.id === newEntryId
                      ? { opacity: 0, backgroundColor: 'oklch(0.25 0.12 160)' }
                      : { opacity: 1 }
                  }
                  animate={{ opacity: 1, backgroundColor: 'oklch(0 0 0 / 0)' }}
                  transition={{ duration: 0.8 }}
                  className={cn(
                    'border-border transition-colors hover:bg-muted/30',
                    onRowClick && 'cursor-pointer',
                    compact && 'h-8',
                    getReviewSnapshot(entry).filability === 'blocking' && 'bg-red-950/10',
                  )}
                  onClick={() => onRowClick?.(entry)}
                >
                  <TableCell className={cn('max-w-[200px]', compact ? 'py-1' : 'py-2')}>
                    <p className={cn('truncate font-medium text-foreground', compact ? 'text-[11px]' : 'text-xs')}>{row.shipment}</p>
                    {!compact && (
                      <p className="truncate font-mono text-[10px] text-muted-foreground">{entry.entryNo}</p>
                    )}
                  </TableCell>
                  {showPrimaryStatus && (
                    <TableCell className={compact ? 'py-1' : undefined}>
                      {row.isResolved ? (
                        <ResolutionBadge />
                      ) : row.primaryStatus ? (
                        <PrimaryStatusBadge status={row.primaryStatus} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell className={cn('max-w-[240px]', compact ? 'py-1' : 'py-2')}>
                    <p className={cn('truncate text-foreground', compact ? 'text-[11px]' : 'text-sm')}>
                      <span className="text-muted-foreground mr-1">→</span>{row.actionNeeded}
                    </p>
                    {!compact && row.coordinationLine && (
                      <p className="truncate text-[10px] text-muted-foreground mt-0.5">
                        {row.coordinationLine}
                      </p>
                    )}
                  </TableCell>
                </motion.tr>
              )
            })}
          </AnimatePresence>
        </TableBody>
      </Table>
    </div>
  )
}
