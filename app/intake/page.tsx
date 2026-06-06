'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '@/lib/store'
import { insertEntry } from '@/lib/insforge-db'
import { Entry, AgentStatus, AgentPhase, RiskLevel } from '@/lib/types'
import { ShipmentInput } from '@/components/intake/shipment-input'
import { AgentPipeline, PipelineAgent } from '@/components/intake/agent-pipeline'
import { EntryResult } from '@/components/entry/entry-result'
import { Tag, Calculator, ShieldCheck, FileText } from 'lucide-react'

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

export default function IntakePage() {
  const router = useRouter()
  const { state, dispatch } = useStore()
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

  async function runAgents(input: string) {
    dispatch({ type: 'RESET_AGENTS' })
    dispatch({ type: 'SET_PROCESSING', value: true })
    setLogLines({ hts: [], duty: [], compliance: [], entry: [] })
    setShowAgents(true)

    // Track phases locally so the catch handler can fail in-flight agents
    // without depending on a stale state closure.
    const localPhase: Record<keyof AgentStatus, AgentPhase> = {
      hts: 'idle', duty: 'idle', compliance: 'idle', entry: 'idle',
    }
    const setPhase = (agent: keyof AgentStatus, phase: AgentPhase) => {
      localPhase[agent] = phase
      dispatch({ type: 'SET_AGENT_STATUS', agent, phase })
    }

    try {
      // 1. HTS Classification (sequential — duty & compliance depend on it)
      setPhase('hts', 'running')
      const classify = await callAgent<{
        htsCode: string; productName: string; description: string
        originCountry: string; port: 'LAX' | 'JFK' | 'SEA'
        quantity: number; valueUsd: number; incoterm: string
      }>('/api/agents/classify', { input }, 'hts')
      setPhase('hts', 'complete')

      // 2. Duty + Compliance in parallel
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

      // 3. Draft assembly
      setPhase('entry', 'running')
      const { draft } = await callAgent<{ draft: Entry }>('/api/agents/draft', {
        ...classify,
        dutyRate: duty.dutyRate,
        estimatedDutyUsd: duty.estimatedDutyUsd,
        riskLevel: compliance.riskLevel,
        reviewRequired: compliance.reviewRequired,
        reviewReason: compliance.reviewReason,
        requiredDocs: compliance.requiredDocs,
        explanation: compliance.explanation,
      }, 'entry')
      setPhase('entry', 'complete')

      dispatch({ type: 'SET_DRAFT', draft })
    } catch (err) {
      console.error('[runAgents]', err)
      // Mark any in-flight agent as errored so the UI stops spinning.
      ;(['hts', 'duty', 'compliance', 'entry'] as const).forEach(agent => {
        if (localPhase[agent] === 'running') setPhase(agent, 'error')
      })
    } finally {
      dispatch({ type: 'SET_PROCESSING', value: false })
    }
  }

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

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Autonomous customs operations for brokers</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Describe a shipment and let the AI agent pipeline classify, price duty, screen compliance and draft the CBP entry.
        </p>
      </div>

      <ShipmentInput onSubmit={runAgents} disabled={state.isProcessing} />

      <AnimatePresence>
        {showAgents && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-10 space-y-8"
          >
            <div>
              <div className="mb-5 flex items-center gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Agent Pipeline
                </h2>
                <span className="h-px flex-1 bg-linear-to-r from-border to-transparent" />
              </div>
              <AgentPipeline agents={pipelineAgents} />
            </div>

            {allComplete && state.currentDraft && (
              <div>
                <div className="mb-5 flex items-center gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Classification Result
                  </h2>
                  <span className="h-px flex-1 bg-linear-to-r from-border to-transparent" />
                </div>
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
