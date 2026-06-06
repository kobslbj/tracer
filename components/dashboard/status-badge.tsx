import { Badge } from '@/components/ui/badge'
import { EntryStatus, RiskLevel } from '@/lib/types'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: EntryStatus
}

const statusStyles: Record<EntryStatus, string> = {
  Draft: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  Review: 'bg-amber-950 text-amber-300 border-amber-800',
  Filing: 'bg-blue-950 text-blue-300 border-blue-800',
  Cleared: 'bg-emerald-950 text-emerald-300 border-emerald-800',
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn('font-medium text-xs', statusStyles[status])}
    >
      {status}
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
      className={cn('font-medium text-xs', riskStyles[risk])}
    >
      {risk}
    </Badge>
  )
}
