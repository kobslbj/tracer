import { Badge } from '@/components/ui/badge'
import { PrimaryQueue, RiskLevel } from '@/lib/types'
import { PRIMARY_QUEUE_LABELS } from '@/lib/entry-triage'
import { cn } from '@/lib/utils'

interface PrimaryStatusBadgeProps {
  status: PrimaryQueue
}

const primaryStyles: Record<PrimaryQueue, string> = {
  needs_attention: 'bg-amber-950 text-amber-300 border-amber-800',
  waiting_on_docs: 'bg-blue-950 text-blue-300 border-blue-800',
  ready_for_review: 'bg-zinc-800 text-zinc-300 border-zinc-700',
}

export function PrimaryStatusBadge({ status }: PrimaryStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn('text-xs font-medium', primaryStyles[status])}
    >
      {PRIMARY_QUEUE_LABELS[status]}
    </Badge>
  )
}

export function ResolutionBadge() {
  return (
    <Badge
      variant="outline"
      className="border-emerald-800 bg-emerald-950 text-xs font-medium text-emerald-300"
    >
      Ready for Review
    </Badge>
  )
}

interface RiskBadgeProps {
  risk: RiskLevel
}

const riskStyles: Record<RiskLevel, string> = {
  Low: 'bg-emerald-950 text-emerald-300 border-emerald-800',
  Medium: 'bg-amber-950 text-amber-300 border-amber-800',
  High: 'bg-red-950 text-red-300 border-red-800',
}

export function RiskBadge({ risk }: RiskBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn('text-xs font-medium', riskStyles[risk])}
    >
      {risk}
    </Badge>
  )
}
