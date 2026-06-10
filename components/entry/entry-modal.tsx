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
import { PrimaryStatusBadge } from '@/components/dashboard/status-badge'
import { ReviewDeltaPanel } from '@/components/intake/review-delta-panel'
import { OperationalWorkflowPanel } from '@/components/intake/operational-workflow-panel'
import { ResolutionActionButton } from '@/components/intake/resolution-action-button'
import { ShipmentTimeline } from '@/components/shipment/shipment-timeline'
import { BrokerFlagVerification } from '@/components/shipment/broker-flag-verification'
import { AddSupportingDocument } from '@/components/shipment/add-supporting-document'
import { LogSupplierReply } from '@/components/shipment/log-supplier-reply'
import { ImporterProfilePanel } from '@/components/shipment/importer-profile-panel'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { getReviewSnapshot, deriveTriageRow, isResolved } from '@/lib/entry-triage'
import { deriveOperationalState } from '@/lib/shipment-review'
import { appendTimelineEvents, updateEntry } from '@/lib/insforge-db'
import { createTimelineEvent, formatRelativeTime, deriveWorkflowTimestamps } from '@/lib/shipment-timeline'
import { deriveSupplierProfile, deriveSupplierAwareCoordination } from '@/lib/supplier-profile'
import { deriveImporterProfile } from '@/lib/importer-profile'
import { useStore } from '@/lib/store'
import { BrokerCorrection, ShipmentTimelineEvent, SupplementaryDoc } from '@/lib/types'
import { ArrowRight, ChevronDown, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EntryModalProps {
  entry: Entry | null
  open: boolean
  onClose: () => void
  onEntryUpdated?: (entry: Entry) => void
}

export function EntryModal({ entry, open, onClose, onEntryUpdated }: EntryModalProps) {
  const { state } = useStore()
  const [marking, setMarking] = useState(false)
  const [replyOpen, setReplyOpen] = useState(false)

  const snapshot = useMemo(
    () => (entry ? getReviewSnapshot(entry) : null),
    [entry],
  )

  const supplierProfile = useMemo(
    () => (entry?.supplier ? deriveSupplierProfile(entry.supplier, state.entries) : null),
    [entry, state.entries],
  )

  const importerProfile = useMemo(
    () => (entry?.importer ? deriveImporterProfile(entry.importer, state.entries) : null),
    [entry, state.entries],
  )

  const corrections = entry?.brokerCorrections ?? []

  const op = useMemo(
    () => (snapshot ? deriveOperationalState(snapshot.issues, corrections) : null),
    [snapshot, corrections],
  )

  if (!entry || !snapshot || !op) return null

  const triage = deriveTriageRow(entry)
  const resolved = isResolved(entry)
  const canMarkReady = op.canProceed
  const needsFollowUp = op.waitingOn.length > 0

  const actionContext = {
    supplier: entry.supplier ?? 'Supplier',
    importer: entry.importer ?? entry.productName,
    product: entry.productName,
    missingItems: snapshot.missingItems,
  }

  const timeline = entry.timeline ?? []
  const waitingOn = op.waitingOn
  const coordination = deriveSupplierAwareCoordination(timeline, waitingOn, supplierProfile)
  const lastReply = coordination.lastSupplierReply
  const workflow = deriveWorkflowTimestamps(entry, waitingOn)

  function handleTimelineUpdated(updated: ShipmentTimelineEvent[]) {
    if (!entry) return
    onEntryUpdated?.({ ...entry, timeline: updated })
  }

  function handleCorrectionsUpdated(updatedCorrections: BrokerCorrection[], updatedTimeline: ShipmentTimelineEvent[]) {
    if (!entry) return
    onEntryUpdated?.({
      ...entry,
      brokerCorrections: updatedCorrections,
      timeline: updatedTimeline,
      updatedAt: new Date().toISOString(),
    })
  }

  function handleSupplementaryDocsUpdated(updatedDocs: SupplementaryDoc[], updatedTimeline: ShipmentTimelineEvent[]) {
    if (!entry) return
    onEntryUpdated?.({
      ...entry,
      supplementaryDocs: updatedDocs,
      timeline: updatedTimeline,
      updatedAt: new Date().toISOString(),
    })
  }

  async function handleMarkReady() {
    if (!entry || !canMarkReady) return
    setMarking(true)
    try {
      const readyEvent = createTimelineEvent({
        type: 'filing_ready',
        actor: 'broker',
        summary: 'Ready for broker review — coordination complete',
      })
      const newTimeline = await appendTimelineEvents(entry.id, timeline, [readyEvent])
      const updated: Entry = {
        ...entry,
        status: 'ready_for_review',
        reviewSnapshot: { ...snapshot!, filability: 'ready' },
        timeline: newTimeline,
        updatedAt: new Date().toISOString(),
      }
      await updateEntry(entry.id, {
        status: 'ready_for_review',
        reviewSnapshot: updated.reviewSnapshot,
        timeline: newTimeline,
      })
      onEntryUpdated?.(updated)
    } catch (err) {
      console.error('[EntryModal mark ready]', err)
    } finally {
      setMarking(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="!flex h-[min(90vh,720px)] max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden border-border bg-card p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4 pr-12">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{entry.entryNo}</span>
                {entry.supplier && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="truncate">{entry.supplier}</span>
                  </>
                )}
              </div>
              <DialogTitle className="mt-1 text-base font-semibold text-foreground">
                {entry.productName}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                Coordination layer before filing — not submitted to CBP
              </DialogDescription>
            </div>
            {!resolved && triage.primaryStatus && (
              <PrimaryStatusBadge status={triage.primaryStatus} />
            )}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4 pb-6 space-y-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span>Entered review {workflow.enteredReviewAgo}</span>
            {workflow.lastActivityAgo && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>Last activity {workflow.lastActivityAgo}</span>
              </>
            )}
            {workflow.waitingLine && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span
                  className={cn(
                    'font-medium',
                    workflow.stalled ? 'text-red-400/90' : 'text-amber-300/90',
                  )}
                >
                  {workflow.waitingLine}
                </span>
              </>
            )}
          </div>

          {snapshot.delta && <ReviewDeltaPanel delta={snapshot.delta} />}

          <OperationalWorkflowPanel issues={snapshot.issues} corrections={corrections}>
            {!resolved && needsFollowUp && (
              <ResolutionActionButton
                action="Generate follow-up email"
                context={actionContext}
                entryId={entry.id}
                timeline={timeline}
                onTimelineUpdated={handleTimelineUpdated}
                size="default"
              />
            )}
          </OperationalWorkflowPanel>

          {entry.importer && (
            <ImporterProfilePanel profile={importerProfile} importerName={entry.importer} />
          )}

          {!resolved && (
            <BrokerFlagVerification
              entryId={entry.id}
              productDescription={entry.description}
              issues={snapshot.issues}
              corrections={corrections}
              timeline={timeline}
              onUpdated={handleCorrectionsUpdated}
            />
          )}

          <AddSupportingDocument
            entryId={entry.id}
            docs={entry.supplementaryDocs ?? []}
            timeline={timeline}
            waitingOn={waitingOn}
            onUpdated={handleSupplementaryDocsUpdated}
          />

          {lastReply && (
            <div className="flex gap-2 rounded-lg border border-border/60 bg-muted/5 px-3 py-2">
              <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
              <div className="min-w-0 text-xs">
                <span className="text-muted-foreground">
                  Supplier replied {formatRelativeTime(lastReply.createdAt)} —{' '}
                </span>
                <span className="text-foreground/90">&ldquo;{lastReply.summary}&rdquo;</span>
              </div>
            </div>
          )}

          <ShipmentTimeline events={timeline} limit={5} />

          {!resolved && (
            <Collapsible open={replyOpen} onOpenChange={setReplyOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-muted/5 px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground">
                <span>Log supplier reply</span>
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', replyOpen && 'rotate-180')} />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <LogSupplierReply
                  entryId={entry.id}
                  timeline={timeline}
                  onTimelineUpdated={handleTimelineUpdated}
                />
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>

        <DialogFooter className="!mx-0 !mb-0 shrink-0 !flex-row items-center gap-3 rounded-none border-t border-border bg-card px-6 py-3">
          <div className="flex w-full min-w-0 items-center gap-3">
            <p className="mr-auto min-w-0 truncate text-xs text-muted-foreground">
              {resolved
                ? 'Coordination complete'
                : canMarkReady
                  ? 'No open blockers'
                  : 'Re-upload corrected documents to update review delta'}
            </p>
            {!resolved && (
              canMarkReady ? (
                <Button onClick={handleMarkReady} disabled={marking}>
                  {marking ? 'Saving…' : 'Mark ready for review'}
                </Button>
              ) : (
                <Button asChild className="shrink-0">
                  <Link href={`/intake?entryId=${entry.id}`}>
                    Continue review
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              )
            )}
            {resolved && (
              <p className="text-sm font-medium text-emerald-400">Ready for broker review</p>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
