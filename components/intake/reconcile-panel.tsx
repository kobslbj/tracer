'use client'

import { ReconcileIssue } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ConfidenceBadge } from './confidence-badge'
import { tagIssueConfidence } from '@/lib/shipment-review'
import {
  deriveIssueTier,
  issueTitle,
  issueEvidence,
  issueCitations,
  shouldShowConfidenceBadge,
  type IssueTier,
} from '@/lib/issue-display'
import { CitationList } from './citation-list'
import { ShieldCheck } from 'lucide-react'

const tierMeta: Record<
  IssueTier,
  { label: string; row: string; dot: string; title: string; evidence: string }
> = {
  blocking: {
    label: 'Blocking',
    row: 'border-red-900/40 bg-red-950/20',
    dot: 'bg-red-400',
    title: 'text-red-300',
    evidence: 'text-red-300/70',
  },
  verification: {
    label: 'Needs verification',
    row: 'border-amber-900/30 bg-amber-950/10',
    dot: 'bg-amber-400',
    title: 'text-amber-200/90',
    evidence: 'text-muted-foreground',
  },
  informational: {
    label: 'Informational',
    row: 'border-border/60 bg-muted/10',
    dot: 'bg-muted-foreground/50',
    title: 'text-muted-foreground',
    evidence: 'text-muted-foreground/80',
  },
}

const tierOrder: IssueTier[] = ['blocking', 'verification', 'informational']

function IssueRow({ issue }: { issue: ReconcileIssue }) {
  const tagged = tagIssueConfidence(issue)
  const tier = deriveIssueTier(tagged)
  const meta = tierMeta[tier]
  const title = issueTitle(tagged)
  const evidence = issueEvidence(tagged)
  const citations = issueCitations(tagged)
  const showBadge = shouldShowConfidenceBadge(tagged.confidence)

  return (
    <div className={cn('rounded-lg border px-3 py-2', meta.row)}>
      <div className="flex items-start gap-2">
        <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', meta.dot)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className={cn('text-xs font-medium leading-snug', meta.title)}>{title}</p>
            {showBadge && tagged.confidence && (
              <ConfidenceBadge confidence={tagged.confidence} compact />
            )}
          </div>
          {tagged.analystNote && (
            <p className={cn('mt-1 text-[11px] leading-snug italic', meta.evidence)}>
              {tagged.analystNote}
            </p>
          )}
          {citations.length > 0 ? (
            <CitationList citations={citations} quoteClassName={meta.evidence} />
          ) : evidence.length > 0 ? (
            <ul className={cn('mt-1 space-y-0.5 text-[11px] leading-snug', meta.evidence)}>
              {evidence.map(line => (
                <li key={line} className="flex gap-1.5">
                  <span className="shrink-0 opacity-50">·</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function ReconcilePanel({ issues }: { issues: ReconcileIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-800/40 bg-emerald-950/15 px-3 py-2">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        <p className="text-xs text-emerald-300/90">No issues detected across uploaded documents.</p>
      </div>
    )
  }

  const byTier: Record<IssueTier, ReconcileIssue[]> = {
    blocking: [],
    verification: [],
    informational: [],
  }
  for (const issue of issues) {
    byTier[deriveIssueTier(issue)].push(issue)
  }

  return (
    <div className="space-y-3">
      {tierOrder.map(tier => {
        const items = byTier[tier]
        if (items.length === 0) return null
        const meta = tierMeta[tier]
        return (
          <div key={tier}>
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
              {meta.label}
              <span className="font-normal">({items.length})</span>
            </p>
            <div className="space-y-1.5">
              {items.map((issue, i) => (
                <IssueRow key={`${issue.code}-${issue.field}-${i}`} issue={issue} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
