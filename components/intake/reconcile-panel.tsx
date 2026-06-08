'use client'

import { motion } from 'framer-motion'
import { ReconcileIssue } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ShieldCheck, AlertOctagon, AlertTriangle } from 'lucide-react'

const severityMeta = {
  error: {
    icon: <AlertOctagon className="h-4 w-4" />,
    dot: 'bg-red-400',
    wrap: 'border-red-800/50 bg-red-950/30',
    accent: 'text-red-400',
    sub: 'text-red-300/80',
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" />,
    dot: 'bg-amber-400',
    wrap: 'border-amber-800/50 bg-amber-950/25',
    accent: 'text-amber-400',
    sub: 'text-amber-300/80',
  },
} as const

export function ReconcilePanel({ issues }: { issues: ReconcileIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-800/50 bg-emerald-950/25 p-4">
        <ShieldCheck className="h-5 w-5 text-emerald-400" />
        <div>
          <p className="text-sm font-semibold text-emerald-400">No discrepancies found</p>
          <p className="text-xs text-emerald-300/80">Documents are consistent and all critical fields are present.</p>
        </div>
      </div>
    )
  }

  const errors = issues.filter(i => i.severity === 'error')
  const warnings = issues.filter(i => i.severity === 'warning')

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs">
        {errors.length > 0 && (
          <span className="flex items-center gap-1.5 font-medium text-red-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
            {errors.length} blocking
          </span>
        )}
        {warnings.length > 0 && (
          <span className="flex items-center gap-1.5 font-medium text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            {warnings.length} warning{warnings.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {[...errors, ...warnings].map((issue, i) => {
        const meta = severityMeta[issue.severity]
        const hasCompare = issue.packingListValue !== undefined || issue.invoiceValue !== undefined
        return (
          <motion.div
            key={`${issue.code}-${issue.field}-${i}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: i * 0.05 }}
            className={cn('rounded-xl border p-4', meta.wrap)}
          >
            <div className="flex items-start gap-2.5">
              <span className={cn('mt-0.5 shrink-0', meta.accent)}>{meta.icon}</span>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium', meta.accent)}>{issue.message}</p>
                {hasCompare && (
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                    <span className={meta.sub}>
                      Packing List: <span className="font-mono text-foreground">{issue.packingListValue}</span>
                    </span>
                    <span className={meta.sub}>
                      Commercial Invoice: <span className="font-mono text-foreground">{issue.invoiceValue}</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
