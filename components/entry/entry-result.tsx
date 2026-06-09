'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Entry } from '@/lib/types'
import { RiskBadge } from '@/components/dashboard/status-badge'
import { RequiredDocBadge } from './required-doc-badge'
import { ConfidenceBadge } from '@/components/intake/confidence-badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  CheckCircle,
  FileText,
  ArrowRight,
  AlertOctagon,
  AlertTriangle,
  ShieldCheck,
  ChevronDown,
  Tag,
  DollarSign,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getReviewSnapshot, legacyTriageFromEntry } from '@/lib/entry-triage'
import { deriveShipmentSummary } from '@/lib/shipment-review'

interface EntryResultProps {
  entry: Entry
  onApprove: () => void
  /** When true, save is blocked until blocking reconcile issues are resolved. */
  saveBlocked?: boolean
}

const filabilityStyle = {
  ready: { icon: ShieldCheck, border: 'border-emerald-800/50 bg-emerald-950/25', accent: 'text-emerald-400' },
  review_recommended: { icon: AlertTriangle, border: 'border-amber-800/50 bg-amber-950/25', accent: 'text-amber-400' },
  blocking: { icon: AlertOctagon, border: 'border-red-800/50 bg-red-950/30', accent: 'text-red-400' },
} as const

export function EntryResult({ entry, onApprove, saveBlocked = false }: EntryResultProps) {
  const [tariffOpen, setTariffOpen] = useState(false)
  const [docsOpen, setDocsOpen] = useState(false)

  const snapshot = getReviewSnapshot(entry) ?? legacyTriageFromEntry(entry)
  const summary = deriveShipmentSummary(snapshot.issues)
  const statusMeta = filabilityStyle[snapshot.filability]
  const StatusIcon = statusMeta.icon
  const isBlocking = snapshot.filability === 'blocking'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-4"
    >
      {/* Filability Banner — primary signal */}
      <div className={cn('rounded-xl border p-4', statusMeta.border)}>
        <div className="flex items-start gap-3">
          <StatusIcon className={cn('mt-0.5 h-5 w-5 shrink-0', statusMeta.accent)} />
          <div>
            <p className={cn('text-sm font-semibold', statusMeta.accent)}>{summary.headline}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{summary.subline}</p>
          </div>
          <div className="ml-auto shrink-0">
            <RiskBadge risk={entry.riskLevel} />
          </div>
        </div>
      </div>

      {/* Pending items */}
      {snapshot.missingItems.length > 0 && (
        <div className="rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pending resolution
          </p>
          <ul className="space-y-2">
            {snapshot.missingItems.map(item => (
              <li key={item.label} className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.message}</p>
                </div>
                <ConfidenceBadge confidence={item.confidence} compact />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Save CTA */}
      <div className="flex flex-col gap-2">
        {(isBlocking || saveBlocked) && (
          <p className="text-xs text-red-400">Resolve the item{snapshot.missingItems.length !== 1 ? 's' : ''} above before saving.</p>
        )}
        <Button
          onClick={onApprove}
          disabled={isBlocking || saveBlocked}
          size="lg"
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 w-full"
        >
          <CheckCircle className="w-4 h-4" />
          Save for broker review
          <ArrowRight className="w-4 h-4 ml-auto" />
        </Button>
      </div>

      {/* Tariff & Classification — collapsed by default */}
      <Collapsible open={tariffOpen} onOpenChange={setTariffOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border bg-card/60 px-4 py-3 text-left backdrop-blur-sm hover:bg-muted/20 transition-colors">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Tag className="h-3.5 w-3.5" />
            Tariff &amp; Classification
          </span>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', tariffOpen && 'rotate-180')} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-b-xl border-x border-b border-border bg-card/40 p-4 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Tag className="h-3 w-3" /> HTS Code</p>
                <p className="text-sm font-mono font-semibold text-foreground mt-0.5">{entry.htsCode}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> Duty Rate</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">{entry.dutyRate}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> Est. Duty</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">${entry.estimatedDutyUsd.toLocaleString()}</p>
              </div>
            </div>
            {entry.explanation && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Classification Notes</p>
                <p className="text-xs text-foreground/80 leading-relaxed">{entry.explanation}</p>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Required Documents — collapsed by default */}
      {entry.requiredDocs.length > 0 && (
        <Collapsible open={docsOpen} onOpenChange={setDocsOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border bg-card/60 px-4 py-3 text-left backdrop-blur-sm hover:bg-muted/20 transition-colors">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              Required Documents
              <span className="text-muted-foreground/60 font-normal normal-case tracking-normal">({entry.requiredDocs.length})</span>
            </span>
            <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', docsOpen && 'rotate-180')} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="rounded-b-xl border-x border-b border-border bg-card/40 p-4">
              <div className="flex flex-wrap gap-2">
                {entry.requiredDocs.map(doc => (
                  <RequiredDocBadge key={doc} name={doc} uploadedDocs={entry.uploadedDocs} />
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Disclaimer footnote */}
      <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
        AI-generated pre-filing draft. Licensed broker verification required before submission. Saving does not submit to CBP.
      </p>
    </motion.div>
  )
}
