'use client'

import { useState, useMemo } from 'react'
import { ReconcileIssue, ExtractedDoc, ReviewDelta } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { ConfidenceBadge } from './confidence-badge'
import {
  deriveShipmentSummary,
  deriveMissingItems,
  checklistFromMissingItems,
  tagAllIssues,
} from '@/lib/shipment-review'
import { cn } from '@/lib/utils'
import {
  ClipboardCopy, Mail, Check, AlertTriangle, ShieldCheck, AlertOctagon,
} from 'lucide-react'
import { ReviewDeltaPanel } from './review-delta-panel'
import { ResolutionPathPanel } from './resolution-path-panel'
import { ResolutionActionButton } from './resolution-action-button'

interface ShipmentReviewSummaryProps {
  issues: ReconcileIssue[]
  packingList: ExtractedDoc
  invoice: ExtractedDoc
  delta?: ReviewDelta | null
}

const filabilityStyle = {
  ready: { icon: ShieldCheck, border: 'border-emerald-800/50 bg-emerald-950/25', accent: 'text-emerald-400' },
  review_recommended: { icon: AlertTriangle, border: 'border-amber-800/50 bg-amber-950/25', accent: 'text-amber-400' },
  blocking: { icon: AlertOctagon, border: 'border-red-800/50 bg-red-950/30', accent: 'text-red-400' },
} as const

export function ShipmentReviewSummary({ issues, packingList, invoice, delta }: ShipmentReviewSummaryProps) {
  const [copiedChecklist, setCopiedChecklist] = useState(false)
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [emailDraft, setEmailDraft] = useState<string | null>(null)
  const [loadingEmail, setLoadingEmail] = useState(false)

  const tagged = useMemo(() => tagAllIssues(issues), [issues])
  const summary = useMemo(() => deriveShipmentSummary(tagged), [tagged])
  const missing = useMemo(() => deriveMissingItems(tagged), [tagged])

  const supplier = invoice.supplier ?? packingList.supplier ?? 'Supplier'
  const importer = invoice.importer ?? packingList.importer ?? 'Importer'
  const product = invoice.productDescription ?? packingList.productDescription ?? 'the shipment'

  const checklist = checklistFromMissingItems(missing, importer, product)
  const emailLabels = missing.map(m => m.label)
  const resolutionSteps = tagged.length > 0
    ? (() => {
        const steps: string[] = []
        if (missing.some(m => /coo|certificate of origin/i.test(m.label))) {
          steps.push('Request COO from supplier')
        }
        const reg = tagged.find(i => i.code.startsWith('regulatory_'))
        if (reg) steps.push(`Verify ${reg.message.toLowerCase()}`)
        const addr = tagged.find(i => i.code.endsWith('_address_mismatch'))
        if (addr) steps.push('Confirm importer address with supplier')
        for (const item of missing) {
          const label = `Resolve ${item.label}`
          if (!steps.some(s => s.toLowerCase().includes(item.label.toLowerCase()))) {
            steps.push(label)
          }
        }
        return steps.slice(0, 4)
      })()
    : []

  const actionContext = { supplier, importer, product, missingItems: missing }

  const statusMeta = filabilityStyle[summary.filability]
  const StatusIcon = statusMeta.icon

  async function copyChecklist() {
    await navigator.clipboard.writeText(checklist)
    setCopiedChecklist(true)
    setTimeout(() => setCopiedChecklist(false), 2000)
  }

  async function handleCopyEmail() {
    if (emailLabels.length === 0) return
    setLoadingEmail(true)
    try {
      let text = emailDraft
      if (!text) {
        try {
          const res = await fetch('/api/documents/follow-up', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ supplier, importer, product, missingItems: emailLabels }),
          })
          if (!res.ok) throw new Error('Failed')
          const data = await res.json()
          text = data.email as string
        } catch {
          text = `Subject: Documents to confirm for ${product}\n\nDear ${supplier},\n\nWe are preparing the import entry for ${importer} and the following items may be needed — please confirm or provide at your earliest convenience:\n\n${emailLabels.map(m => `- ${m}`).join('\n')}\n\nThank you,`
        }
        setEmailDraft(text)
      }
      await navigator.clipboard.writeText(text)
      setCopiedEmail(true)
      setTimeout(() => setCopiedEmail(false), 2000)
    } finally {
      setLoadingEmail(false)
    }
  }

  return (
    <div className="space-y-3">
      {delta && <ReviewDeltaPanel delta={delta} />}

      <div className={cn('rounded-lg border px-3 py-2.5', statusMeta.border)}>
        <div className="flex items-start gap-2.5">
          <StatusIcon className={cn('h-4 w-4 shrink-0 mt-0.5', statusMeta.accent)} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">{summary.headline}</h2>
              {summary.overallConfidence === 'needs_review' && (
                <ConfidenceBadge confidence={summary.overallConfidence} showProvenance />
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{summary.subline}</p>
            <p className="mt-2 text-[11px] text-muted-foreground/75">
              AI-assisted detect — broker verifies before submit.
            </p>
          </div>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="rounded-lg border border-border bg-card/40 px-3 py-2.5">
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Pending resolution
          </h3>
          <ul className="space-y-2">
            {missing.map(item => (
              <li key={item.label} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">{item.label}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{item.message}</p>
                </div>
                {item.confidence === 'needs_review' && (
                  <ConfidenceBadge confidence={item.confidence} compact />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {resolutionSteps.length > 0 && (
        <ResolutionPathPanel steps={resolutionSteps} />
      )}

      {missing.length > 0 && (
        <div className="rounded-lg border border-border bg-card/40 px-3 py-2.5">
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Coordinate
          </h3>
          <div className="flex flex-wrap gap-2">
            {tagged.some(i => i.code === 'coo_certificate_missing') && (
              <ResolutionActionButton
                action="Request COO from supplier"
                context={actionContext}
              />
            )}
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={copyChecklist}>
              {copiedChecklist ? <Check className="h-3 w-3" /> : <ClipboardCopy className="h-3 w-3" />}
              {copiedChecklist ? 'Copied' : 'Copy importer checklist'}
            </Button>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled={loadingEmail} onClick={handleCopyEmail}>
              {copiedEmail ? <Check className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
              {loadingEmail ? 'Generating…' : copiedEmail ? 'Copied' : 'Copy follow-up email'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
