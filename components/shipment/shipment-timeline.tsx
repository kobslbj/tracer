'use client'

import { ShipmentTimelineEvent } from '@/lib/types'
import {
  EVENT_TYPE_LABELS,
  formatDuration,
  formatPromisedBy,
  formatRelativeTime,
  sortTimeline,
} from '@/lib/shipment-timeline'
import { cn } from '@/lib/utils'

interface ShipmentTimelineProps {
  events: ShipmentTimelineEvent[]
  className?: string
  limit?: number
}

const ACTOR_LABELS = {
  ai: 'AI',
  broker: 'Broker',
  supplier: 'Supplier',
} as const

export function ShipmentTimeline({ events, className, limit = 8 }: ShipmentTimelineProps) {
  const sorted = sortTimeline(events).slice(0, limit)

  if (sorted.length === 0) {
    return (
      <div className={cn('rounded-lg border border-border/60 bg-muted/5 px-3 py-2.5', className)}>
        <p className="text-[11px] text-muted-foreground">No coordination events yet.</p>
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border border-border bg-card/40 px-3 py-2.5', className)}>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Timeline
      </p>
      <ol className="space-y-0">
        {sorted.map((event, i) => (
          <li key={event.id} className="flex gap-2 pb-2.5 last:pb-0">
            <div className="flex flex-col items-center">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
              {i < sorted.length - 1 && (
                <span className="my-0.5 w-px flex-1 bg-border/60" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="text-[11px] font-medium text-foreground/90">
                  {EVENT_TYPE_LABELS[event.type]}
                </p>
                <span className="text-[10px] text-muted-foreground/70">
                  {ACTOR_LABELS[event.actor]} · {formatRelativeTime(event.createdAt)}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                {event.summary}
                {event.type === 'issue_resolved' && event.resolutionTimeHours != null && (
                  <span className="text-emerald-400/80">
                    {' '}· resolved after {formatDuration(event.resolutionTimeHours)}
                  </span>
                )}
              </p>
              {event.promisedBy && (
                <p className="mt-0.5 text-[10px] text-muted-foreground/80">
                  Promised by {formatPromisedBy(event.promisedBy)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
