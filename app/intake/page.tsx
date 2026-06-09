'use client'

import { useState, useCallback, useRef, Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '@/lib/store'
import { insertEntry, saveEntryReviewUpdate } from '@/lib/insforge-db'
import { buildReviewSnapshot, derivePrimaryStatus } from '@/lib/entry-triage'
import { computeIssueListDelta } from '@/lib/review-delta'
import { eventsForReviewSave, prependTimelineEvents } from '@/lib/shipment-timeline'
import { docFileMetaToUploaded } from '@/lib/doc-links'
import { entryOverridesFromDocs } from '@/lib/entry-from-docs'
import {
  Entry, AgentStatus, AgentPhase, RiskLevel,
  DocType, ExtractedDoc, ReconcileResult, DocFileMeta, OptionalDocType, ReviewDelta,
  ReconcileIssue,
} from '@/lib/types'
import { ShipmentInput } from '@/components/intake/shipment-input'
import { DocumentUpload, DocumentUploadPayload } from '@/components/intake/document-upload'
import { FieldTable } from '@/components/intake/field-table'
import { ReconcilePanel } from '@/components/intake/reconcile-panel'
import { ShipmentReviewSummary } from '@/components/intake/shipment-review-summary'
import { ReviewTrace } from '@/components/intake/review-trace'
import { AgentPipeline, PipelineAgent } from '@/components/intake/agent-pipeline'
import { EntryResult } from '@/components/entry/entry-result'
import { Tag, Calculator, ShieldCheck, FileText, Loader2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const agentConfig: Record<keyof AgentStatus, { name: string; description: string; icon: React.ReactNode }> = {
  hts: {
    name: 'Classification review',
    description: 'Potential HTS issues',
    icon: <Tag className="w-4 h-4" />,
  },
  duty: {
    name: 'Tariff review',
    description: 'Estimated duties',
    icon: <Calculator className="w-4 h-4" />,
  },
  compliance: {
    name: 'Import compliance review',
    description: 'Regulatory flags',
    icon: <ShieldCheck className="w-4 h-4" />,
  },
  entry: {
    name: 'Entry draft',
    description: 'Pre-filing summary',
    icon: <FileText className="w-4 h-4" />,
  },
}

type DocPhase = 'idle' | 'processing' | 'done' | 'error'

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function buildShipmentDescription(pl: ExtractedDoc, inv: ExtractedDoc): string {
  const supplier = inv.supplier ?? pl.supplier ?? 'an overseas supplier'
  const product = inv.productDescription ?? pl.productDescription
  const coo = pl.productDescription?.match(/south africa/i) ? 'South Africa'
    : pl.portOfLoading?.match(/south africa/i) ? 'South Africa'
    : pl.coo ?? inv.coo ?? 'an unspecified country'
  const importer = inv.importer ?? pl.importer
  const weight = pl.grossWeightKg ?? pl.netWeightKg ?? inv.grossWeightKg
  const value = inv.totalValue ?? pl.totalValue
  const currency = inv.currency ?? pl.currency ?? 'USD'
  const qtyMt = inv.quantityUnit === 'MT' ? inv.quantity
    : pl.packUnitKg && pl.quantity ? (pl.quantity * pl.packUnitKg) / 1000
    : pl.grossWeightKg ? pl.grossWeightKg / 1000
    : null

  const parts = [
    product ?? `Shipment from ${supplier}`,
    `country of origin ${coo}`,
    importer ? `imported by ${importer}` : null,
    qtyMt != null ? `${qtyMt} MT` : null,
    weight != null ? `gross weight ${weight.toLocaleString()} kg` : null,
    value != null ? `total declared value ${currency} ${value.toLocaleString()}` : null,
    inv.portOfDischarge ?? pl.portOfDischarge
      ? `port of discharge ${inv.portOfDischarge ?? pl.portOfDischarge}`
      : null,
    inv.incoterm ?? pl.incoterm ? `incoterm ${inv.incoterm ?? pl.incoterm}` : null,
  ].filter(Boolean)

  return parts.join(', ') + '.'
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
  const [showManualInput, setShowManualInput] = useState(false)

  const [docPhase, setDocPhase] = useState<DocPhase>('idle')
  const [docLogs, setDocLogs] = useState<string[]>([])
  const [docError, setDocError] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<{ packingList: ExtractedDoc; invoice: ExtractedDoc } | null>(null)
  const [reconcile, setReconcile] = useState<ReconcileResult | null>(null)
  const [reviewDelta, setReviewDelta] = useState<ReviewDelta | null>(null)
  const priorIssuesRef = useRef<ReconcileIssue[] | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<DocFileMeta | null>(null)

  const resumingEntry = useMemo(() => {
    const entryId = searchParams.get('entryId')
    if (!entryId) return null
    return state.entries.find(e => e.id === entryId) ?? null
  }, [searchParams, state.entries])

  const pushDocLog = useCallback((line: string) => {
    setDocLogs(prev => [...prev, line])
  }, [])

  const [logLines, setLogLines] = useState<Record<keyof AgentStatus, string[]>>({
    hts: [], duty: [], compliance: [], entry: [],
  })
  const [showAgents, setShowAgents] = useState(false)
  const [draftExpanded, setDraftExpanded] = useState(false)
  const [draftStarted, setDraftStarted] = useState(false)
  const [advancedExpanded, setAdvancedExpanded] = useState(false)

  const appendLog = useCallback((agent: keyof AgentStatus, lines: string[]) => {
    setLogLines(prev => ({ ...prev, [agent]: [...prev[agent], ...lines] }))
  }, [])

  async function callAgent<T>(url: string, body: Record<string, unknown>, agent: keyof AgentStatus): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      const message = err.error ?? `${url} failed with ${res.status}`
      appendLog(agent, [`✗ ${message}`])
      throw new Error(message)
    }
    const data = await res.json()
    if (data.logs?.length) appendLog(agent, data.logs)
    return data as T
  }

  async function runAgents(
    input: string,
    files?: DocFileMeta,
    docCtx?: { packingList: ExtractedDoc; invoice: ExtractedDoc; reconcile: ReconcileResult },
  ) {
    dispatch({ type: 'RESET_AGENTS' })
    dispatch({ type: 'SET_PROCESSING', value: true })
    setLogLines({ hts: [], duty: [], compliance: [], entry: [] })
    setShowAgents(true)
    setDraftStarted(true)

    const localPhase: Record<keyof AgentStatus, AgentPhase> = {
      hts: 'idle', duty: 'idle', compliance: 'idle', entry: 'idle',
    }
    const setPhase = (agent: keyof AgentStatus, phase: AgentPhase) => {
      localPhase[agent] = phase
      dispatch({ type: 'SET_AGENT_STATUS', agent, phase })
    }

    try {
      setPhase('hts', 'running')
      const classify = await callAgent<{
        htsCode: string; productName: string; description: string
        originCountry: string; port: 'LAX' | 'JFK' | 'SEA'
        quantity: number; valueUsd: number; incoterm: string
      }>('/api/agents/classify', { input }, 'hts')
      setPhase('hts', 'complete')

      setPhase('duty', 'running')
      setPhase('compliance', 'running')
      const [duty, compliance] = await Promise.all([
        callAgent<{ dutyRate: number; estimatedDutyUsd: number; dutyBasis: string }>('/api/agents/duty', {
          htsCode: classify.htsCode,
          originCountry: classify.originCountry,
          valueUsd: classify.valueUsd,
          incoterm: classify.incoterm,
        }, 'duty').then(r => { setPhase('duty', 'complete'); return r }),
        callAgent<{ riskLevel: RiskLevel; reviewRequired: boolean; reviewReason: string; requiredDocs: string[]; explanation: string }>('/api/agents/compliance', {
          htsCode: classify.htsCode,
          originCountry: classify.originCountry,
          productName: classify.productName,
          description: classify.description,
        }, 'compliance').then(r => { setPhase('compliance', 'complete'); return r }),
      ])

      setPhase('entry', 'running')
      const docOverrides = docCtx ? entryOverridesFromDocs(docCtx.packingList, docCtx.invoice, docCtx.reconcile) : {}
      const { draft } = await callAgent<{ draft: Entry }>('/api/agents/draft', {
        ...classify,
        ...docOverrides,
        dutyRate: duty.dutyRate,
        estimatedDutyUsd: duty.estimatedDutyUsd,
        riskLevel: compliance.riskLevel,
        reviewRequired: compliance.reviewRequired,
        reviewReason: compliance.reviewReason,
        requiredDocs: compliance.requiredDocs,
        explanation: compliance.explanation,
        uploadedDocs: files ? docFileMetaToUploaded(files) : undefined,
      }, 'entry')
      setPhase('entry', 'complete')

      dispatch({ type: 'SET_DRAFT', draft })
    } catch (err) {
      console.error('[runAgents]', err)
      ;(['hts', 'duty', 'compliance', 'entry'] as const).forEach(agent => {
        if (localPhase[agent] === 'running') setPhase(agent, 'error')
      })
    } finally {
      dispatch({ type: 'SET_PROCESSING', value: false })
    }
  }

  async function uploadDoc(file: File): Promise<{ url?: string; key?: string }> {
    const dataUrl = await readAsDataUrl(file)
    const res = await fetch('/api/documents/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileBase64: dataUrl,
        mimeType: file.type || 'application/pdf',
        filename: file.name,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error ?? `Storage upload failed (${res.status})`)
    }
    const data = await res.json()
    if (data.logs?.length) data.logs.forEach((l: string) => pushDocLog(l))
    return { url: data.url, key: data.key }
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
    setDocPhase('processing')
    setDocError(null)
    setDocLogs([])
    setExtracted(null)
    setReconcile(null)
    setUploadedFiles(null)
    setShowAgents(false)
    setDraftExpanded(false)
    setDraftStarted(false)
    setAdvancedExpanded(false)

    try {
      pushDocLog('→ Uploading documents...')
      const [plFile, invFile] = [payload.required.packing_list, payload.required.commercial_invoice]
      const [plMeta, invMeta] = await Promise.all([uploadDoc(plFile), uploadDoc(invFile)])

      const fileMeta: DocFileMeta = {
        packingListKey: plMeta.key,
        packingListUrl: plMeta.url,
        invoiceKey: invMeta.key,
        invoiceUrl: invMeta.url,
      }

      const optionalKeys: OptionalDocType[] = ['spec_sheet', 'product_image']
      for (const key of optionalKeys) {
        const file = payload.optional[key]
        if (!file) continue
        pushDocLog(`→ Storing optional ${key.replace('_', ' ')}...`)
        const meta = await uploadDoc(file)
        if (key === 'spec_sheet') {
          fileMeta.specSheetKey = meta.key
          fileMeta.specSheetUrl = meta.url
        } else {
          fileMeta.productImageKey = meta.key
          fileMeta.productImageUrl = meta.url
        }
      }

      const [packingList, invoice] = await Promise.all([
        extractDoc('packing_list', plFile),
        extractDoc('commercial_invoice', invFile),
      ])
      setExtracted({ packingList, invoice })

      pushDocLog('→ Cross-checking documents...')
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

      const persistRes = await fetch('/api/documents/persist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packingList, invoice, result, files: fileMeta }),
      })
      if (!persistRes.ok) {
        const err = await persistRes.json().catch(() => ({}))
        throw new Error(err.error ?? `Failed to save document set (${persistRes.status})`)
      }
      const persistData = await persistRes.json()
      if (persistData.logs?.length) persistData.logs.forEach((l: string) => pushDocLog(l))

      setUploadedFiles(fileMeta)
      setDocPhase('done')
    } catch (err) {
      console.error('[runDocumentFlow]', err)
      setDocError(err instanceof Error ? err.message : 'Document processing failed')
      setDocPhase('error')
    }
  }

  function handleExpandDraft() {
    const next = !draftExpanded
    setDraftExpanded(next)
    if (next && !draftStarted && extracted && reconcile) {
      const description = buildShipmentDescription(extracted.packingList, extracted.invoice)
      runAgents(description, uploadedFiles ?? undefined, {
        packingList: extracted.packingList,
        invoice: extracted.invoice,
        reconcile,
      })
    }
  }

  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleSaveForReview() {
    if (!state.currentDraft) return
    const draft = state.currentDraft
    const issues = reconcile?.issues ?? []
    const previousSnapshot = resumingEntry?.reviewSnapshot ?? null
    const reviewSnapshot = buildReviewSnapshot(issues, draft, { previousSnapshot })
    if (!reviewSnapshot.delta && reviewDelta) {
      reviewSnapshot.delta = reviewDelta
    }
    const primaryStatus = derivePrimaryStatus(reviewSnapshot, draft) ?? 'ready_for_review'
    const now = new Date().toISOString()

    setSaveError(null)
    try {
      if (resumingEntry) {
        const updated: Entry = {
          ...draft,
          id: resumingEntry.id,
          entryNo: resumingEntry.entryNo,
          createdAt: resumingEntry.createdAt,
          status: primaryStatus,
          reviewSnapshot,
          uploadedDocs: uploadedFiles ? docFileMetaToUploaded(uploadedFiles) : resumingEntry.uploadedDocs,
          updatedAt: now,
        }
        await saveEntryReviewUpdate(resumingEntry, updated)
        const timeline = prependTimelineEvents(
          resumingEntry.timeline,
          eventsForReviewSave(resumingEntry, updated),
        )
        dispatch({ type: 'UPDATE_ENTRY', entry: { ...updated, timeline } })
      } else {
        const entry: Entry = {
          ...draft,
          status: primaryStatus,
          reviewSnapshot,
          uploadedDocs: uploadedFiles ? docFileMetaToUploaded(uploadedFiles) : undefined,
          updatedAt: now,
        }
        entry.timeline = eventsForReviewSave(null, entry)
        await insertEntry(entry)
        dispatch({ type: 'APPROVE_ENTRY', entry })
      }
    } catch (err) {
      console.error('[handleSaveForReview]', err)
      setSaveError('Failed to save entry. Please try again.')
      return
    }
    router.push('/dashboard')
  }

  const agentKeys = ['hts', 'duty', 'compliance', 'entry'] as const
  const allComplete = agentKeys.every(k => state.agentStatus[k] === 'complete')
  const blockingCount = reconcile?.issues.filter(i => i.severity === 'error').length ?? 0

  const pipelineAgents: PipelineAgent[] = agentKeys.map(key => ({
    key,
    name: agentConfig[key].name,
    description: agentConfig[key].description,
    icon: agentConfig[key].icon,
    phase: state.agentStatus[key],
    logLines: logLines[key],
  }))

  const docBusy = docPhase === 'processing'

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {resumingEntry ? 'Continue shipment review' : 'AI copilot for customs document review'}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {resumingEntry
            ? `Re-upload documents for ${resumingEntry.productName} — changes since last review will be tracked.`
            : 'Upload shipment documents to detect missing paperwork, compliance risks, and filing issues before submission.'}
        </p>
      </div>

      <DocumentUpload onAnalyze={runDocumentFlow} disabled={docBusy || state.isProcessing} />

      <p className="mt-4 text-center text-xs text-muted-foreground">
        No documents yet?{' '}
        <button
          type="button"
          onClick={() => setShowManualInput(v => !v)}
          disabled={docBusy || state.isProcessing}
          className="text-primary underline-offset-2 hover:underline disabled:opacity-50"
        >
          Describe shipment manually
        </button>
      </p>

      <AnimatePresence>
        {showManualInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden"
          >
            <ShipmentInput
              onSubmit={input => {
                setShowManualInput(false)
                runAgents(input)
              }}
              disabled={state.isProcessing || docBusy}
            />
          </motion.div>
        )}
      </AnimatePresence>

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
              Processing
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
            <ShipmentReviewSummary
              issues={reconcile.issues}
              packingList={extracted.packingList}
              invoice={extracted.invoice}
              delta={reviewDelta}
            />

            <ReviewTrace
              issues={reconcile.issues}
              packingList={extracted.packingList}
              invoice={extracted.invoice}
            />

            <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setAdvancedExpanded(v => !v)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">Advanced review</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Full issue breakdown, extracted fields, and cross-document comparison
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
                    className="overflow-hidden border-t border-border/60 px-5 pb-5 pt-4 space-y-8"
                  >
                    <ReconcilePanel issues={reconcile.issues} />
                    <div>
                      <SectionHeader title="Extracted fields" />
                      <FieldTable fields={reconcile.fields} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm">
              <button
                type="button"
                onClick={handleExpandDraft}
                disabled={state.isProcessing}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">Pre-submission review</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    HTS estimate, duty summary, and filing readiness — optional
                  </p>
                </div>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', draftExpanded && 'rotate-180')} />
              </button>

              <AnimatePresence>
                {draftExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden border-t border-border/60 px-5 pb-5 pt-4"
                  >
                    {showAgents && (
                      <div className="space-y-6">
                        <AgentPipeline agents={pipelineAgents} />
                        {allComplete && state.currentDraft && (
                          <EntryResult
                            entry={state.currentDraft}
                            onApprove={handleSaveForReview}
                            saveBlocked={blockingCount > 0}
                          />
                        )}
                        {saveError && (
                          <p className="rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
                            {saveError}
                          </p>
                        )}
                      </div>
                    )}
                    {!showAgents && state.isProcessing && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating pre-filing draft…
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual describe path — pipeline shown directly */}
      <AnimatePresence>
        {showAgents && !extracted && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-10 space-y-8"
          >
            <SectionHeader title="Pre-submission review (optional)" />
            <AgentPipeline agents={pipelineAgents} />
            {allComplete && state.currentDraft && (
              <EntryResult entry={state.currentDraft} onApprove={handleSaveForReview} />
            )}
            {saveError && (
              <p className="rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
                {saveError}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-5 flex items-center gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <span className="h-px flex-1 bg-linear-to-r from-border to-transparent" />
    </div>
  )
}
