'use client'

import { ReviewDelta } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Check, Circle, Sparkles } from 'lucide-react'

interface ReviewDeltaPanelProps {
  delta: ReviewDelta
  className?: string
}

export function ReviewDeltaPanel({ delta, className }: ReviewDeltaPanelProps) {
  const hasContent =
    delta.resolved.length > 0 ||
    delta.stillPending.length > 0 ||
    delta.newlyDetected.length > 0

  if (!hasContent) return null

  return (
    <div className={cn('rounded-lg border border-border bg-card/40 px-3 py-2.5', className)}>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Since last review
      </p>

      {delta.resolved.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-emerald-400/90">
            <Check className="h-3 w-3" />
            Resolved
          </p>
          <ul className="space-y-0.5">
            {delta.resolved.map(item => (
              <li key={item.key} className="flex items-start gap-1.5 text-[11px] text-foreground/85">
                <span className="mt-0.5 text-emerald-400/70">✓</span>
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {delta.stillPending.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-amber-300/90">
            <Circle className="h-2.5 w-2.5 fill-amber-400/30 text-amber-400/70" />
            Still pending
          </p>
          <ul className="space-y-0.5">
            {delta.stillPending.map(item => (
              <li key={item.key} className="flex items-start gap-1.5 text-[11px] text-foreground/85">
                <span className="mt-0.5 text-muted-foreground/50">•</span>
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {delta.newlyDetected.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-sky-300/90">
            <Sparkles className="h-3 w-3" />
            Newly detected
          </p>
          <ul className="space-y-0.5">
            {delta.newlyDetected.map(item => (
              <li key={item.key} className="flex items-start gap-1.5 text-[11px] text-foreground/85">
                <span className="mt-0.5 text-sky-400/60">+</span>
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
