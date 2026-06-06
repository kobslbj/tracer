'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '@/lib/store'
import { classifyShipment } from '@/lib/mock-classifier'
import { insertEntry } from '@/lib/insforge-db'
import { Entry, AgentStatus } from '@/lib/types'
import { ShipmentInput } from '@/components/intake/shipment-input'
import { AgentCard } from '@/components/intake/replica-card'
import { EntryResult } from '@/components/entry/entry-result'
import { Tag, Calculator, ShieldCheck, FileText } from 'lucide-react'

const agentLogs: Record<keyof AgentStatus, string[][]> = {
  hts: [
    ['→ Parsing product description...'],
    ['→ Querying InsForge vector store (hts_knowledge)...', '→ Retrieving candidate tariff classifications...'],
    ['→ Matching chapter headings · verifying Schedule B...'],
    ['✓ HTS code confirmed · GRI rules applied'],
  ],
  duty: [
    ['→ Loading duty schedule...'],
    ['→ Checking Section 301 USTR lists (List 3 / List 4A)...', '→ Querying tariff DB...'],
    ['→ Calculating ad valorem duty · applying incoterm adjustments...'],
    ['✓ Duty rate confirmed · estimated liability calculated'],
  ],
  compliance: [
    ['→ Screening CBP CATAIR restrictions...'],
    ['→ Checking ECCN · FDA / DOT hazmat flags...'],
    ['→ Verifying import restrictions · watchlist check...'],
    ['✓ Risk level assessed · required docs generated'],
  ],
  entry: [
    ['→ Compiling structured entry data...'],
    ['→ Writing to InsForge Postgres (entries table)...', '→ Generating CBP Form 3461 fields...'],
    ['→ Triggering realtime notify_entry_change()...'],
    ['✓ Entry persisted to InsForge DB · broadcast complete'],
  ],
}

interface AgentTiming {
  agent: keyof AgentStatus
  startDelay: number
  duration: number
}

const timings: AgentTiming[] = [
  { agent: 'hts', startDelay: 200, duration: 2000 },
  { agent: 'duty', startDelay: 800, duration: 1800 },
  { agent: 'compliance', startDelay: 1200, duration: 2200 },
  { agent: 'entry', startDelay: 3400, duration: 1200 },
]

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

function generateEntryNo() {
  return `ENT-${Math.floor(49300 + Math.random() * 1000)}`
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

  async function runAgents(input: string) {
    dispatch({ type: 'RESET_AGENTS' })
    dispatch({ type: 'SET_PROCESSING', value: true })
    setLogLines({ hts: [], duty: [], compliance: [], entry: [] })
    setShowAgents(true)

    const classifyPromise = classifyShipment(input)

    timings.forEach(({ agent, startDelay, duration }) => {
      setTimeout(() => {
        dispatch({ type: 'SET_AGENT_STATUS', agent, phase: 'running' })

        const logBatches = agentLogs[agent]
        logBatches.forEach((batch, i) => {
          setTimeout(() => appendLog(agent, batch), (duration / logBatches.length) * i)
        })

        setTimeout(() => {
          dispatch({ type: 'SET_AGENT_STATUS', agent, phase: 'complete' })
        }, duration)
      }, startDelay)
    })

    const lastTiming = timings[timings.length - 1]
    const totalMs = lastTiming.startDelay + lastTiming.duration + 300

    const [result] = await Promise.all([
      classifyPromise,
      new Promise(resolve => setTimeout(resolve, totalMs)),
    ])

    const estimatedDutyUsd = Math.round(result.valueUsd * result.dutyRate / 100)

    const draft: Entry = {
      id: `ent-${Date.now()}`,
      entryNo: generateEntryNo(),
      port: result.port,
      productName: result.productName,
      description: result.description,
      originCountry: result.originCountry,
      quantity: result.quantity,
      valueUsd: result.valueUsd,
      incoterm: result.incoterm,
      htsCode: result.htsCode,
      dutyRate: result.dutyRate,
      estimatedDutyUsd,
      riskLevel: result.riskLevel,
      reviewRequired: result.reviewRequired,
      reviewReason: result.reviewReason,
      status: 'Draft',
      requiredDocs: result.requiredDocs,
      explanation: result.explanation,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    dispatch({ type: 'SET_DRAFT', draft })
    dispatch({ type: 'SET_PROCESSING', value: false })
  }

  async function handleApprove() {
    if (!state.currentDraft) return
    const entry = { ...state.currentDraft, status: 'Review' as const, updatedAt: new Date().toISOString() }
    await insertEntry(entry)
    dispatch({ type: 'APPROVE_ENTRY', entry: state.currentDraft })
    router.push('/dashboard')
  }

  const allComplete = (['hts', 'duty', 'compliance', 'entry'] as const).every(
    k => state.agentStatus[k] === 'complete'
  )

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">New Shipment</h1>
      </div>

      <ShipmentInput onSubmit={runAgents} disabled={state.isProcessing} />

      <AnimatePresence>
        {showAgents && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-8 space-y-6"
          >
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Agent Pipeline
                </h2>
                <span className="text-xs text-muted-foreground">· running in parallel</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(['hts', 'duty', 'compliance', 'entry'] as const).map(agent => (
                  <AgentCard
                    key={agent}
                    name={agentConfig[agent].name}
                    description={agentConfig[agent].description}
                    phase={state.agentStatus[agent]}
                    logLines={logLines[agent]}
                    icon={agentConfig[agent].icon}
                  />
                ))}
              </div>
            </div>

            {allComplete && state.currentDraft && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                  Classification Result
                </h2>
                <EntryResult entry={state.currentDraft} onApprove={handleApprove} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
