import { IssueConfidence } from '@/lib/types'
import { confidenceLabel } from '@/lib/issue-display'
import { cn } from '@/lib/utils'

const meta: Record<IssueConfidence, { cls: string }> = {
  high: { cls: 'border-emerald-800/40 bg-emerald-950/20 text-emerald-400/90' },
  medium: { cls: 'border-border bg-muted/20 text-muted-foreground' },
  needs_review: { cls: 'border-amber-800/50 bg-amber-950/25 text-amber-300' },
}

interface ConfidenceBadgeProps {
  confidence: IssueConfidence
  compact?: boolean
  showProvenance?: boolean
}

export function ConfidenceBadge({
  confidence,
  compact = false,
  showProvenance = false,
}: ConfidenceBadgeProps) {
  if (compact && confidence !== 'needs_review') return null

  const m = meta[confidence]
  const label = confidenceLabel(confidence)

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span
        className={cn(
          'inline-flex shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium leading-tight',
          m.cls,
          !compact && 'uppercase tracking-wide',
        )}
      >
        {compact ? 'Verify manually' : label}
      </span>
      {showProvenance && confidence !== 'high' && (
        <span className="text-[10px] text-muted-foreground/80">
          Based on invoice line items & cross-doc comparison
        </span>
      )}
    </span>
  )
}
