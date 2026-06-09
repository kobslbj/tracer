'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Entry } from '@/lib/types'
import { PrimaryStatusBadge, ResolutionBadge } from './status-badge'
import { deriveTriageRow, getReviewSnapshot, sortEntriesForQueue } from '@/lib/entry-triage'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface AttentionQueueTableProps {
  entries: Entry[]
  newEntryId?: string | null
  showPrimaryStatus?: boolean
  emptyStateMessage?: string
  compact?: boolean
  onRowClick?: (entry: Entry) => void
}

function TagsCell({ tags, compact }: { tags: string[]; compact?: boolean }) {
  if (tags.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  const limit = compact ? 2 : 3
  const shown = tags.slice(0, limit)
  const rest = tags.length - shown.length
  return (
    <div className="flex flex-wrap gap-0.5">
      {shown.map(tag => (
        <Badge
          key={tag}
          variant="outline"
          className={cn(
            'border-amber-800/40 bg-amber-950/20 font-normal text-amber-200/90',
            compact ? 'px-1 py-0 text-[10px]' : 'text-xs',
          )}
        >
          {tag}
        </Badge>
      ))}
      {rest > 0 && (
        <Badge variant="outline" className={cn('font-normal text-muted-foreground', compact ? 'px-1 py-0 text-[10px]' : 'text-xs')}>
          +{rest}
        </Badge>
      )}
    </div>
  )
}

export function AttentionQueueTable({
  entries,
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
              <TableHead className={cn('font-medium text-muted-foreground', compact && 'h-7 py-1 text-[11px]')}>Primary Status</TableHead>
            )}
            <TableHead className={cn('font-medium text-muted-foreground', compact && 'h-7 py-1 text-[11px]')}>Tags</TableHead>
            <TableHead className={cn('font-medium text-muted-foreground', compact && 'h-7 py-1 text-[11px]')}>Action Needed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <AnimatePresence initial={false}>
            {sorted.map(entry => {
              const row = deriveTriageRow(entry)
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
                  <TableCell className={compact ? 'py-1' : undefined}>
                    <TagsCell tags={row.tags} compact={compact} />
                  </TableCell>
                  <TableCell className={cn('max-w-[200px]', compact ? 'py-1' : 'py-2')}>
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
