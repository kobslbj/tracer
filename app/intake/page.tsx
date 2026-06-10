'use client'

import { useState, useCallback, useRef, Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '@/lib/store'
import { useAuth } from '@/lib/auth'
import { insertEntry, insertDocumentSet, saveEntryReviewUpdate } from '@/lib/insforge-db'
import { uploadWorkspaceFile } from '@/lib/storage'
import { buildReviewSnapshot, derivePrimaryStatus } from '@/lib/entry-triage'
import { computeIssueListDelta } from '@/lib/review-delta'
import { eventsForReviewSave, prependTimelineEvents, createFollowupDraftedEvent } from '@/lib/shipment-timeline'
import { docFileMetaToUploaded } from '@/lib/doc-links'
import { buildEntryFromDocs } from '@/lib/entry-from-docs'
import { deriveImporterProfile } from '@/lib/importer-profile'
import {
  DocType, ExtractedDoc, ReconcileResult, DocFileMeta, ReviewDelta,
  ReconcileIssue, ShipmentTimelineEvent,
} from '@/lib/types'
import { DocumentUpload, DocumentUploadPayload } from '@/components/intake/document-upload'
import { FieldTable } from '@/components/intake/field-table'
import { ReconcilePanel } from '@/components/intake/reconcile-panel'
import { ShipmentReviewSummary } from '@/components/intake/shipment-review-summary'
import { ImporterProfilePanel } from '@/components/shipment/importer-profile-panel'
import { Button } from '@/components/ui/button'
import { Loader2, ChevronDown, Save } from 'lucide-react'
import { cn } from '@/lib/utils'

type DocPhase = 'idle' | 'processing' | 'done' | 'error'

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function newDraftEntryId(): string {
  return `ent-${Date.now()}`
}

export default function IntakePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-6 py-12 text-sm text-muted-foreground">Loading…</div>}>
      <IntakePageContent />
    </Suspense>
  )
}

function IntakePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { state, dispatch } = useStore()
  const { workspaceId } = useAuth()

  const [docPhase, setDocPhase] = useState<DocPhase>('idle')
  const [draftEntryId, setDraftEntryId] = useState<string | null>(null)
  const [docLogs, setDocLogs] = useState<string[]>([])
  const [docError, setDocError] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<{ packingList: ExtractedDoc; invoice: ExtractedDoc } | null>(null)
  const [reconcile, setReconcile] = useState<ReconcileResult | null>(null)
  const [reviewDelta, setReviewDelta] = useState<ReviewDelta | null>(null)
  const priorIssuesRef = useRef<ReconcileIssue[] | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<DocFileMeta | null>(null)
  const [pendingTimeline, setPendingTimeline] = useState<ShipmentTimelineEvent[]>([])
  const [advancedExpanded, setAdvancedExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const resumingEntry = useMemo(() => {
    const entryId = searchParams.get('entryId')
    if (!entryId) return null
    return state.entries.find(e => e.id === entryId) ?? null
  }, [searchParams, state.entries])

  const intakeImporter = extracted
    ? extracted.invoice.importer ?? extracted.packingList.importer
    : null
  const intakeImporterProfile = useMemo(() => {
    if (!intakeImporter) return null
    // On re-review the entry being re-checked is already in the store —
    // exclude it so the panel only reflects prior shipments.
    const priorEntries = resumingEntry
      ? state.entries.filter(e => e.id !== resumingEntry.id)
      : state.entries
    return deriveImporterProfile(intakeImporter, priorEntries)
  }, [intakeImporter, state.entries, resumingEntry])

  const pushDocLog = useCallback((line: string) => {
    setDocLogs(prev => [...prev, line])
  }, [])

  async function uploadDoc(file: File, entryId: string): Promise<{ url?: string; key?: string }> {
    if (!workspaceId) throw new Error('Workspace not ready — please sign in again')
    const { url, key } = await uploadWorkspaceFile(workspaceId, entryId, file)
    pushDocLog(`✓ Uploaded ${file.name} → customs-docs/${key}`)
    return { url, key }
  }

  async function extractDoc(docType: DocType, file: File): Promise<ExtractedDoc> {
    const dataUrl = await readAsDataUrl(file)
    const res = await fetch('/api/documents/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docType, fileBase64: dataUrl, mimeType: file.type || 'application/pdf', filename: file.name }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error ?? `Extraction failed (${res.status})`)
    }
    const data = await res.json()
    if (data.logs?.length) data.logs.forEach((l: string) => pushDocLog(l))
    return data.extracted as ExtractedDoc
  }

  async function runDocumentFlow(payload: DocumentUploadPayload) {
    if (!workspaceId) {
      setDocError('Workspace not ready — please sign in again.')
      setDocPhase('error')
      return
    }

    const entryId = resumingEntry?.id ?? newDraftEntryId()
    setDraftEntryId(entryId)

    setDocPhase('processing')
    setDocError(null)
    setDocLogs([])
    setExtracted(null)
    setReconcile(null)
    setUploadedFiles(null)
    setPendingTimeline([])
    setAdvancedExpanded(false)
    setSaveError(null)

    try {
      pushDocLog('→ Uploading documents...')
      const [plFile, invFile] = [payload.required.packing_list, payload.required.commercial_invoice]
      const [plMeta, invMeta] = await Promise.all([uploadDoc(plFile, entryId), uploadDoc(invFile, entryId)])

      const fileMeta: DocFileMeta = {
        packingListKey: plMeta.key,
        packingListUrl: plMeta.url,
        invoiceKey: invMeta.key,
        invoiceUrl: invMeta.url,
      }

      pushDocLog('→ Reading document fields...')
      const [packingList, invoice] = await Promise.all([
        extractDoc('packing_list', plFile),
        extractDoc('commercial_invoice', invFile),
      ])
      setExtracted({ packingList, invoice })

      pushDocLog('→ Cross-checking Invoice vs Packing List...')
      const priorIssues =
        reconcile?.issues ??
        priorIssuesRef.current ??
        resumingEntry?.reviewSnapshot?.issues ??
        null

      const recRes = await fetch('/api/documents/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packingList, invoice }),
      })
      if (!recRes.ok) {
        const err = await recRes.json().catch(() => ({}))
        throw new Error(err.error ?? `Reconciliation failed (${recRes.status})`)
      }
      const recData = await recRes.json()
      if (recData.logs?.length) recData.logs.forEach((l: string) => pushDocLog(l))
      const result = recData.result as ReconcileResult
      setReconcile(result)

      if (priorIssues?.length) {
        setReviewDelta(computeIssueListDelta(priorIssues, result.issues))
      } else {
        setReviewDelta(null)
      }
      priorIssuesRef.current = result.issues

      await insertDocumentSet(packingList, invoice, result, fileMeta, workspaceId)
      pushDocLog('✓ Saved reconciliation to InsForge (document_sets)')

      setUploadedFiles(fileMeta)
      setDocPhase('done')
    } catch (err) {
      console.error('[runDocumentFlow]', err)
      setDocError(err instanceof Error ? err.message : 'Document processing failed')
      setDocPhase('error')
    }
  }

  function handleFollowUpLogged(labels: string[]) {
    setPendingTimeline(prev => [createFollowupDraftedEvent(labels), ...prev])
  }

  async function handleSaveShipment() {
    if (!extracted || !reconcile || !workspaceId) return

    const uploadedDocs = uploadedFiles ? docFileMetaToUploaded(uploadedFiles) : undefined
    const base = buildEntryFromDocs(
      extracted.packingList,
      extracted.invoice,
      reconcile,
      uploadedDocs,
      resumingEntry
        ? {
            id: resumingEntry.id,
            entryNo: resumingEntry.entryNo,
            createdAt: resumingEntry.createdAt,
            timeline: resumingEntry.timeline,
          }
        : draftEntryId
          ? { id: draftEntryId }
          : undefined,
    )

    const previousSnapshot = resumingEntry?.reviewSnapshot ?? null
    const reviewSnapshot = buildReviewSnapshot(reconcile.issues, base, { previousSnapshot })
    if (!reviewSnapshot.delta && reviewDelta) {
      reviewSnapshot.delta = reviewDelta
    }
    const primaryStatus = derivePrimaryStatus(reviewSnapshot, base) ?? 'ready_for_review'
    const now = new Date().toISOString()

    setSaving(true)
    setSaveError(null)
    try {
      if (resumingEntry) {
        const updated = {
          ...base,
          status: primaryStatus,
          reviewSnapshot,
          uploadedDocs: uploadedDocs ?? resumingEntry.uploadedDocs,
          updatedAt: now,
        }
        await saveEntryReviewUpdate(resumingEntry, updated)
        const reviewEvents = eventsForReviewSave(resumingEntry, updated)
        const timeline = prependTimelineEvents(
          prependTimelineEvents(resumingEntry.timeline, pendingTimeline),
          reviewEvents,
        )
        dispatch({ type: 'UPDATE_ENTRY', entry: { ...updated, timeline } })
      } else {
        const entry = {
          ...base,
          status: primaryStatus,
          reviewSnapshot,
          updatedAt: now,
        }
        const reviewEvents = eventsForReviewSave(null, entry)
        entry.timeline = prependTimelineEvents(pendingTimeline, reviewEvents)
        await insertEntry({ ...entry, workspaceId }, workspaceId)
        dispatch({ type: 'APPROVE_ENTRY', entry: { ...entry, workspaceId } })
      }
    } catch (err) {
      console.error('[handleSaveShipment]', err)
      setSaveError('Failed to save shipment. Please try again.')
      return
    } finally {
      setSaving(false)
    }
    router.push('/dashboard')
  }

  const docBusy = docPhase === 'processing'
  const hasIssues = (reconcile?.issues.length ?? 0) > 0

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wider text-primary/80">Document intake</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          {resumingEntry ? 'Document re-review' : 'Shipment document review'}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {resumingEntry
            ? `Re-checking ${resumingEntry.productName}. Review delta records resolved, pending, and newly detected items.`
            : 'Commercial invoice and packing list required. Cross-document validation, missing item detection, and readiness status.'}
        </p>
      </div>

      <DocumentUpload onAnalyze={runDocumentFlow} disabled={docBusy} />

      <AnimatePresence>
        {docLogs.length > 0 && docPhase !== 'done' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-6 rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm"
          >
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {docBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
              Reviewing documents
            </div>
            <div className="space-y-1 font-mono text-xs text-muted-foreground">
              {docLogs.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {docError && (
        <p className="mt-4 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
          {docError}
        </p>
      )}

      <AnimatePresence>
        {docPhase === 'done' && reconcile && extracted && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-10 space-y-4"
          >
            {intakeImporter && intakeImporterProfile && (
              <ImporterProfilePanel
                profile={intakeImporterProfile}
                importerName={intakeImporter}
                minShipmentsForHistory={1}
              />
            )}

            <ShipmentReviewSummary
              issues={reconcile.issues}
              packingList={extracted.packingList}
              invoice={extracted.invoice}
              delta={reviewDelta}
              onFollowUpLogged={handleFollowUpLogged}
              followUpLogged={pendingTimeline.some(e => e.type === 'followup_drafted')}
            />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border bg-card/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {hasIssues
                  ? 'Save to track follow-ups and re-checks in the review queue.'
                  : 'No blocking issues — save for broker review.'}
              </p>
              <Button onClick={handleSaveShipment} disabled={saving} className="gap-1.5 shrink-0">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving…' : resumingEntry ? 'Save re-review' : 'Save shipment'}
              </Button>
            </div>
            {saveError && (
              <p className="rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
                {saveError}
              </p>
            )}

            <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setAdvancedExpanded(v => !v)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">Technical details</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    OCR fields and full issue breakdown — secondary
                  </p>
                </div>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', advancedExpanded && 'rotate-180')} />
              </button>

              <AnimatePresence>
                {advancedExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden border-t border-border/60 px-5 pb-5 pt-4 space-y-6"
                  >
                    <ReconcilePanel issues={reconcile.issues} />
                    <div>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Extracted fields
                      </p>
                      <FieldTable fields={reconcile.fields} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
