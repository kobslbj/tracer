'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '@/lib/store'
import { insertEntry } from '@/lib/insforge-db'
import { docFileMetaToUploaded } from '@/lib/doc-links'
import { entryOverridesFromDocs } from '@/lib/entry-from-docs'
import {
  Entry, AgentStatus, AgentPhase, RiskLevel,
  DocType, ExtractedDoc, ReconcileResult, DocFileMeta,
} from '@/lib/types'
import { ShipmentInput } from '@/components/intake/shipment-input'
import { DocumentUpload } from '@/components/intake/document-upload'
import { FieldTable } from '@/components/intake/field-table'
import { ReconcilePanel } from '@/components/intake/reconcile-panel'
import { AgentPipeline, PipelineAgent } from '@/components/intake/agent-pipeline'
import { EntryResult } from '@/components/entry/entry-result'
import { Tag, Calculator, ShieldCheck, FileText, Loader2, ArrowRight, MessageSquareText, ScanLine } from 'lucide-react'

const agentConfig: Record<keyof AgentStatus, { name: string; description: string; icon: React.ReactNode }> = {
  hts: {
    name: 'Classification Agent',
    description: 'HTS Schedule B · GRI rules · vector knowledge base',
    icon: <Tag className="w-4 h-4" />,
  },
  duty: {
    name: 'Duty Agent',
    description: 'Section 301 tariff lookups · ad valorem calculation',
    icon: <Calculator className="w-4 h-4" />,
  },
  compliance: {
    name: 'Compliance Agent',
    description: 'CBP CATAIR · ECCN · hazmat screening',
    icon: <ShieldCheck className="w-4 h-4" />,
  },
  entry: {
    name: 'Draft Agent',
    description: 'Writes to InsForge Postgres · triggers realtime broadcast',
    icon: <FileText className="w-4 h-4" />,
  },
}

type Mode = 'describe' | 'upload'
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
  const router = useRouter()
  const { state, dispatch } = useStore()
  const [mode, setMode] = useState<Mode>('describe')

  // ── Document OCR + reconcile state ─────────────────────────────────────────
  const [docPhase, setDocPhase] = useState<DocPhase>('idle')
  const [docLogs, setDocLogs] = useState<string[]>([])
  const [docError, setDocError] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<{ packingList: ExtractedDoc; invoice: ExtractedDoc } | null>(null)
  const [reconcile, setReconcile] = useState<ReconcileResult | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<DocFileMeta | null>(null)

  const pushDocLog = useCallback((line: string) => {
    setDocLogs(prev => [...prev, line])
  }, [])

  // ── Agent pipeline state ───────────────────────────────────────────────────
  const [logLines, setLogLines] = useState<Record<keyof AgentStatus, string[]>>({
    hts: [], duty: [], compliance: [], entry: [],
  })
  const [showAgents, setShowAgents] = useState(false)

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

  // ── Document flow orchestration ────────────────────────────────────────────
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

  async function runDocumentFlow(files: Record<DocType, File>) {
    setDocPhase('processing')
    setDocError(null)
    setDocLogs([])
    setExtracted(null)
    setReconcile(null)
    setUploadedFiles(null)

    try {
      pushDocLog('→ Uploading documents to InsForge Storage...')
      const [plFile, invFile] = [files.packing_list, files.commercial_invoice]
      const [plMeta, invMeta] = await Promise.all([uploadDoc(plFile), uploadDoc(invFile)])

      const [packingList, invoice] = await Promise.all([
        extractDoc('packing_list', plFile),
        extractDoc('commercial_invoice', invFile),
      ])
      setExtracted({ packingList, invoice })

      pushDocLog('→ Reconciling Packing List against Commercial Invoice...')
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

      const fileMeta: DocFileMeta = {
        packingListKey: plMeta.key, packingListUrl: plMeta.url,
        invoiceKey: invMeta.key, invoiceUrl: invMeta.url,
      }
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

  function runPipelineFromDocs() {
    if (!extracted) return
    const description = buildShipmentDescription(extracted.packingList, extracted.invoice)
    runAgents(description, uploadedFiles ?? undefined, {
      packingList: extracted.packingList,
      invoice: extracted.invoice,
      reconcile: reconcile!,
    })
  }

  // ── Approve & file ─────────────────────────────────────────────────────────
  const [approveError, setApproveError] = useState<string | null>(null)

  async function handleApprove() {
    if (!state.currentDraft) return
    const entry = { ...state.currentDraft, status: 'Review' as const, updatedAt: new Date().toISOString() }
    setApproveError(null)
    try {
      await insertEntry(entry)
    } catch (err) {
      console.error('[handleApprove] failed to persist entry:', err)
      setApproveError('Failed to file entry to InsForge. Please try again.')
      return
    }
    dispatch({ type: 'APPROVE_ENTRY', entry: state.currentDraft })
    router.push('/dashboard')
  }

  const agentKeys = ['hts', 'duty', 'compliance', 'entry'] as const
  const allComplete = agentKeys.every(k => state.agentStatus[k] === 'complete')

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
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Autonomous customs operations for brokers</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Describe a shipment, or upload the Packing List and Commercial Invoice to extract and reconcile entry data automatically.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="mb-5 inline-flex rounded-lg border border-border bg-card/60 p-1 backdrop-blur-sm">
        {([
          { id: 'describe' as Mode, label: 'Describe shipment', icon: <MessageSquareText className="h-3.5 w-3.5" /> },
          { id: 'upload' as Mode, label: 'Upload documents', icon: <ScanLine className="h-3.5 w-3.5" /> },
        ]).map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setMode(t.id)}
            disabled={state.isProcessing || docBusy}
            className={cnToggle(mode === t.id)}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {mode === 'describe' ? (
        <ShipmentInput onSubmit={runAgents} disabled={state.isProcessing} />
      ) : (
        <div className="space-y-8">
          <DocumentUpload onAnalyze={runDocumentFlow} disabled={docBusy} />

          {/* Processing log */}
          <AnimatePresence>
            {docLogs.length > 0 && docPhase !== 'done' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm"
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
            <p className="rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
              {docError}
            </p>
          )}

          {/* Results */}
          <AnimatePresence>
            {docPhase === 'done' && reconcile && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                <div>
                  <SectionHeader title="Extracted Fields" />
                  <FieldTable fields={reconcile.fields} />
                </div>

                <div>
                  <SectionHeader title="Reconciliation" />
                  <ReconcilePanel issues={reconcile.issues} />
                </div>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm">
                  <p className="text-sm text-muted-foreground">
                    Continue with the extracted data — run the AI agent pipeline to classify, price duty, screen compliance and draft the entry.
                  </p>
                  <button
                    onClick={runPipelineFromDocs}
                    disabled={state.isProcessing}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[0_0_18px_-6px_var(--color-primary)] transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    Run classification pipeline
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Agent pipeline + draft */}
      <AnimatePresence>
        {showAgents && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-10 space-y-8"
          >
            <div>
              <SectionHeader title="Agent Pipeline" />
              <AgentPipeline agents={pipelineAgents} />
            </div>

            {allComplete && state.currentDraft && (
              <div>
                <SectionHeader title="Classification Result" />
                <EntryResult entry={state.currentDraft} onApprove={handleApprove} />
                {approveError && (
                  <p className="mt-3 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
                    {approveError}
                  </p>
                )}
              </div>
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

function cnToggle(active: boolean): string {
  return [
    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50',
    active ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:text-foreground',
  ].join(' ')
}
