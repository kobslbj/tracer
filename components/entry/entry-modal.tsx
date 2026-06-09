'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Entry } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { RequiredDocBadge } from './required-doc-badge'
import { RiskBadge, PrimaryStatusBadge, ResolutionBadge } from '@/components/dashboard/status-badge'
import { Badge } from '@/components/ui/badge'
import { ConfidenceBadge } from '@/components/intake/confidence-badge'
import { ReviewDeltaPanel } from '@/components/intake/review-delta-panel'
import { ResolutionPathPanel } from '@/components/intake/resolution-path-panel'
import { ResolutionActionButton } from '@/components/intake/resolution-action-button'
import { CoordinationPanel } from '@/components/shipment/coordination-panel'
import { ShipmentTimeline } from '@/components/shipment/shipment-timeline'
import { LogSupplierReply } from '@/components/shipment/log-supplier-reply'
import { Button } from '@/components/ui/button'
import { getReviewSnapshot, deriveTriageRow } from '@/lib/entry-triage'
import { deriveShipmentSummary } from '@/lib/shipment-review'
import { appendTimelineEvents, updateEntry } from '@/lib/insforge-db'
import { createTimelineEvent, deriveCoordinationState } from '@/lib/shipment-timeline'
import { ShipmentTimelineEvent } from '@/lib/types'
import {
  FileText, DollarSign, Tag, ChevronDown, ChevronUp,
  AlertOctagon, AlertTriangle, ShieldCheck, ClipboardCopy, Check, ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface EntryModalProps {
  entry: Entry | null
  open: boolean
  onClose: () => void
  onEntryUpdated?: (entry: Entry) => void
}

function MetricCard({ icon, label, value, mono = false }: {
  icon: React.ReactNode
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className={cn('text-sm font-semibold text-foreground', mono && 'font-mono')}>{value}</p>
    </div>
  )
}

function FieldRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-xs font-medium text-foreground">{value}</span>
    </div>
  )
}

const filabilityStyle = {
  ready: { icon: ShieldCheck, border: 'border-emerald-800/50 bg-emerald-950/25', accent: 'text-emerald-400' },
  review_recommended: { icon: AlertTriangle, border: 'border-amber-800/50 bg-amber-950/25', accent: 'text-amber-400' },
  blocking: { icon: AlertOctagon, border: 'border-red-800/50 bg-red-950/30', accent: 'text-red-400' },
} as const

export function EntryModal({ entry, open, onClose, onEntryUpdated }: EntryModalProps) {
  const [rationaleOpen, setRationaleOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [approving, setApproving] = useState(false)

  const snapshot = useMemo(
    () => (entry ? getReviewSnapshot(entry) : null),
    [entry],
  )

  const summary = useMemo(
    () => (snapshot ? deriveShipmentSummary(snapshot.issues) : null),
    [snapshot],
  )

  if (!entry || !snapshot || !summary) return null

  const triage = deriveTriageRow(entry)
  const statusMeta = filabilityStyle[snapshot.filability]
  const StatusIcon = statusMeta.icon
  const isResolved = triage.isResolved

  const actionContext = {
    supplier: entry.description.match(/from ([^,]+)/)?.[1] ?? 'Supplier',
    importer: entry.productName,
    product: entry.productName,
    missingItems: snapshot.missingItems,
  }

  const timeline = entry.timeline ?? []
  const waitingOn = snapshot.missingItems.map(m => m.label)
  const coordination = deriveCoordinationState(timeline, waitingOn)

  function handleTimelineUpdated(updated: ShipmentTimelineEvent[]) {
    if (!entry) return
    onEntryUpdated?.({ ...entry, timeline: updated })
  }

  async function handleApprove() {
    if (!entry) return
    setApproving(true)
    try {
      const filingEvent = createTimelineEvent({
        type: 'filing_ready',
        actor: 'broker',
        summary: 'Broker marked shipment ready to submit',
      })
      const newTimeline = await appendTimelineEvents(entry.id, timeline, [filingEvent])
      const updated: Entry = {
        ...entry,
        status: 'ready_to_submit',
        reviewSnapshot: { ...snapshot!, filability: 'ready' },
        timeline: newTimeline,
        updatedAt: new Date().toISOString(),
      }
      await updateEntry(entry.id, {
        status: 'ready_to_submit',
        reviewSnapshot: updated.reviewSnapshot,
        timeline: newTimeline,
      })
      onEntryUpdated?.(updated)
    } catch (err) {
      console.error('[EntryModal approve]', err)
    } finally {
      setApproving(false)
    }
  }

  async function copyActions() {
    const text = snapshot!.suggestedActions.map(a => `- ${a}`).join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-4xl border-border bg-card p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-border px-6 py-5">
          <div className="flex items-start justify-between gap-4 pr-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{entry.entryNo}</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-xs text-muted-foreground">{entry.portOfDischarge ?? entry.port}</span>
              </div>
              <DialogTitle className="mt-1 text-lg font-semibold text-foreground">
                {entry.productName}
              </DialogTitle>
              <DialogDescription className="mt-0.5 line-clamp-2">{entry.description}</DialogDescription>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <RiskBadge risk={entry.riskLevel} />
              {isResolved ? (
                <ResolutionBadge />
              ) : triage.primaryStatus ? (
                <PrimaryStatusBadge status={triage.primaryStatus} />
              ) : null}
            </div>
          </div>
          {triage.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {triage.tags.map(tag => (
                <Badge key={tag} variant="outline" className="text-xs font-normal">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </DialogHeader>

        {snapshot.filability === 'blocking' && (
          <div className="bg-red-950/40 border-b border-red-800/50 px-6 py-2.5 flex items-center gap-2">
            <AlertOctagon className="h-3.5 w-3.5 shrink-0 text-red-400" />
            <span className="text-sm font-medium text-red-400">Cannot file — resolve blocking items first</span>
          </div>
        )}

        <div className="overflow-y-auto px-6 py-5" style={{ maxHeight: 'calc(85vh - 180px)' }}>
          <p className="mb-4 text-xs text-muted-foreground">
            Pre-filing review only — not CBP release status.
          </p>

          {snapshot.delta && (
            <div className="mb-5">
              <ReviewDeltaPanel delta={snapshot.delta} />
            </div>
          )}

          {(waitingOn.length > 0 || timeline.length > 0) && (
            <div className="mb-5 space-y-3">
              <CoordinationPanel coordination={coordination} />
              {!isResolved && (
                <LogSupplierReply
                  entryId={entry.id}
                  timeline={timeline}
                  onTimelineUpdated={handleTimelineUpdated}
                />
              )}
              <ShipmentTimeline events={timeline} />
            </div>
          )}

          {/* Filing readiness */}
          <div className={cn('mb-5 rounded-lg border p-4', statusMeta.border)}>
            <div className="flex items-start gap-3">
              <StatusIcon className={cn('mt-0.5 h-4 w-4 shrink-0', statusMeta.accent)} />
              <div>
                <p className={cn('text-sm font-semibold', statusMeta.accent)}>{summary.headline}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{summary.subline}</p>
                <div className="mt-2 flex items-center gap-2">
                  {(snapshot.htsConfidence ?? summary.overallConfidence) === 'needs_review' && (
                    <>
                      <span className="text-xs text-muted-foreground">Classification uncertainty:</span>
                      <ConfidenceBadge confidence={snapshot.htsConfidence ?? summary.overallConfidence} compact />
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Pending resolution */}
          {snapshot.missingItems.length > 0 && (
            <div className="mb-5 rounded-lg border border-border bg-muted/10 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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

          {/* Resolution path + coordinate */}
          {snapshot.suggestedActions.length > 0 && (
            <div className="mb-5 space-y-3">
              <ResolutionPathPanel steps={snapshot.suggestedActions} />
              <div className="rounded-lg border border-border bg-muted/10 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Coordinate
                </p>
                <div className="flex flex-wrap gap-2">
                  {snapshot.suggestedActions.map(action => (
                    <ResolutionActionButton
                      key={action}
                      action={action}
                      context={actionContext}
                      entryId={entry.id}
                      timeline={timeline}
                      onTimelineUpdated={handleTimelineUpdated}
                    />
                  ))}
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={copyActions}>
                    {copied ? <Check className="mr-1 h-3 w-3" /> : <ClipboardCopy className="mr-1 h-3 w-3" />}
                    {copied ? 'Copied' : 'Copy all'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Detection rationale — collapsed */}
          {snapshot.flagReasons.length > 0 && (
            <div className="mb-5 rounded-lg border border-border bg-muted/10 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Why flagged
              </p>
              <ul className="list-inside list-disc space-y-1">
                {snapshot.flagReasons.map(reason => (
                  <li key={reason} className="text-xs text-foreground/90">{reason}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Supporting rationale (collapsed) */}
          {entry.explanation && (
            <div className="mb-5 rounded-lg border border-border bg-muted/10">
              <button
                type="button"
                onClick={() => setRationaleOpen(v => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Supporting rationale
                </span>
                {rationaleOpen
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {rationaleOpen && (
                <p className="border-t border-border px-4 py-3 text-xs leading-relaxed text-foreground/80">
                  {entry.explanation}
                </p>
              )}
            </div>
          )}

          {/* 6. Shipment details (secondary) */}
          <div className="mb-4 grid grid-cols-3 gap-3">
            <MetricCard icon={<Tag className="h-3 w-3" />} label="HTS Code" value={entry.htsCode} mono />
            <MetricCard icon={<DollarSign className="h-3 w-3" />} label="Duty Rate" value={`${entry.dutyRate}%`} />
            <MetricCard
              icon={<DollarSign className="h-3 w-3" />}
              label="Estimated Duty"
              value={`$${entry.estimatedDutyUsd.toLocaleString()}`}
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/10 px-4 py-2">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Shipment details
            </p>
            <FieldRow label="Origin Country" value={entry.originCountry} />
            <FieldRow label="Discharge Port" value={entry.portOfDischarge ?? entry.port} />
            {entry.portOfDischarge && <FieldRow label="US Port of Entry" value={entry.port} />}
            <FieldRow label="Incoterm" value={entry.incoterm} />
            <FieldRow label="Quantity" value={entry.quantity.toLocaleString()} />
            <FieldRow label="Shipment Value" value={`$${entry.valueUsd.toLocaleString()}`} />
          </div>

          {entry.requiredDocs?.length > 0 && (
            <div className="mt-4 rounded-lg border border-border bg-muted/10 p-4">
              <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                Required documents
              </p>
              <div className="flex flex-wrap gap-2">
                {entry.requiredDocs.map(doc => (
                  <RequiredDocBadge key={doc} name={doc} uploadedDocs={entry.uploadedDocs} />
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <div className="flex w-full items-center justify-between gap-3">
            {!isResolved && (
              <Button variant="outline" asChild>
                <Link href={`/intake?entryId=${entry.id}`}>
                  Continue review
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
            <div className="ml-auto">
              {!isResolved ? (
                <Button onClick={handleApprove} disabled={approving}>
                  {approving ? 'Saving…' : 'Mark ready to submit'}
                </Button>
              ) : (
                <p className="text-sm text-emerald-400">Ready to submit — broker review complete</p>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
