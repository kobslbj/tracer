'use client'

import { useState } from 'react'
import { BrokerCorrection, ReconcileIssue } from '@/lib/types'
import { deriveOperationalState, deriveShipmentSummary, tagAllIssues, waitingItemOwnership } from '@/lib/shipment-review'
import { cn } from '@/lib/utils'
import { ChevronDown, ArrowRight, ShieldCheck, AlertOctagon } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

interface OperationalWorkflowPanelProps {
  issues: ReconcileIssue[]
  corrections?: BrokerCorrection[]
  children?: React.ReactNode
  className?: string
}

export function OperationalWorkflowPanel({ issues, corrections = [], children, className }: OperationalWorkflowPanelProps) {
  const [secondaryOpen, setSecondaryOpen] = useState(false)
  const tagged = tagAllIssues(issues)
  const summary = deriveShipmentSummary(tagged, corrections)
  const op = deriveOperationalState(tagged, corrections)
  const hasSecondary = op.secondaryNotes.length > 0 || op.verificationMismatches.length > 0

  const isReady = summary.filability === 'ready'

  return (
    <div className={cn('space-y-3', className)}>
      <div
        className={cn(
          'rounded-lg border px-4 py-3',
          isReady
            ? 'border-emerald-800/50 bg-emerald-950/20'
            : 'border-primary/30 bg-primary/5',
        )}
      >
        <div className="flex items-start gap-2.5">
          {isReady ? (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {isReady ? 'Status' : 'Current blocker'}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">
              {summary.headline}
            </p>
            {!isReady && op.waitingOn.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Waiting on
                </p>
                <ul className="mt-1 space-y-0.5">
                  {op.waitingOn.map(item => (
                    <li key={item} className="flex items-center gap-1.5 text-sm text-foreground">
                      <span className="text-muted-foreground">·</span>
                      <span className="min-w-0 truncate">{item}</span>
                      <span className="ml-auto shrink-0 rounded border border-border/60 bg-muted/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {waitingItemOwnership(item)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {children && (
              <div className="mt-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Next action
                </p>
                {children}
              </div>
            )}
          </div>
        </div>
      </div>

      {hasSecondary && (
        <Collapsible open={secondaryOpen} onOpenChange={setSecondaryOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border/50 bg-muted/5 px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground">
            <span>Regulatory notes &amp; verification details</span>
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', secondaryOpen && 'rotate-180')} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-2">
            {op.secondaryNotes.map(note => (
              <div key={note.label} className="rounded-md border border-border/40 bg-muted/5 px-3 py-2 text-xs">
                <p className="font-medium text-foreground/90">{note.label}</p>
                <p className="mt-0.5 text-muted-foreground leading-snug">{note.detail}</p>
              </div>
            ))}
            {op.verificationMismatches.map(issue => (
              <div key={issue.code + issue.field} className="rounded-md border border-border/40 bg-muted/5 px-3 py-2 text-xs">
                <p className="font-medium text-foreground/90">{issue.field}</p>
                <p className="mt-0.5 text-muted-foreground leading-snug">{issue.message}</p>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}

export function OperationalNextStepHint({ blocker }: { blocker: string | null }) {
  if (!blocker) return null
  return (
    <p className="flex items-center gap-1 text-xs text-muted-foreground">
      <ArrowRight className="h-3 w-3 shrink-0" />
      {blocker}
    </p>
  )
}
