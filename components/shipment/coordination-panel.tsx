'use client'

import {
  deriveCoordinationState,
  formatPromisedBy,
  formatRelativeTime,
} from '@/lib/shipment-timeline'
import { cn } from '@/lib/utils'
import { Clock, MessageSquare, Mail, AlertTriangle } from 'lucide-react'

interface CoordinationPanelProps {
  coordination: ReturnType<typeof deriveCoordinationState>
  className?: string
}

export function CoordinationPanel({ coordination, className }: CoordinationPanelProps) {
  const {
    waitingOn,
    followUpCount,
    lastFollowUp,
    lastSupplierReply,
    activePromise,
    promiseOverdue,
    coordinationLine,
  } = coordination

  if (waitingOn.length === 0 && !lastSupplierReply && followUpCount === 0) {
    return null
  }

  return (
    <div className={cn('rounded-lg border border-border bg-card/40 px-3 py-2.5', className)}>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Coordination
      </p>

      {waitingOn.length > 0 && (
        <p className="text-xs text-foreground">
          Waiting on{' '}
          <span className="font-medium">{waitingOn.join(', ')}</span>
        </p>
      )}

      {lastSupplierReply && (
        <div className="mt-2 flex gap-2">
          <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">
              Last supplier reply · {formatRelativeTime(lastSupplierReply.createdAt)}
            </p>
            <p className="text-xs leading-snug text-foreground/90">
              &ldquo;{lastSupplierReply.summary}&rdquo;
            </p>
            {activePromise?.promisedBy && (
              <p
                className={cn(
                  'mt-1 text-[11px]',
                  promiseOverdue ? 'text-red-400/90' : 'text-muted-foreground',
                )}
              >
                Promised by {formatPromisedBy(activePromise.promisedBy)}
                {promiseOverdue ? ' — overdue' : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {lastFollowUp && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span>
            {followUpCount} follow-up{followUpCount === 1 ? '' : 's'} logged
            · last {formatRelativeTime(lastFollowUp.createdAt)}
          </span>
        </div>
      )}

      {!lastFollowUp && waitingOn.length > 0 && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>No follow-up logged yet</span>
        </div>
      )}

      {coordinationLine && (
        <div className="mt-2.5 flex items-start gap-2 rounded-md border border-amber-900/30 bg-amber-950/15 px-2.5 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/80" />
          <p className="text-[11px] leading-snug text-amber-200/90">{coordinationLine}</p>
        </div>
      )}
    </div>
  )
}
