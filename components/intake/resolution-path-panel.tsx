'use client'

import { cn } from '@/lib/utils'

interface ResolutionPathPanelProps {
  steps: string[]
  className?: string
}

export function ResolutionPathPanel({ steps, className }: ResolutionPathPanelProps) {
  if (steps.length === 0) return null

  return (
    <div className={cn('rounded-lg border border-border bg-card/40 px-3 py-2.5', className)}>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Resolution path
      </p>
      <p className="mb-2 text-[11px] text-muted-foreground">
        To move this shipment toward filing:
      </p>
      <ol className="space-y-1.5">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-2 text-xs text-foreground/90">
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">{i + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
