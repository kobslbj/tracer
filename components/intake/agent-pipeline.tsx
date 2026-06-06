'use client'

import { motion } from 'framer-motion'
import { Check, Loader2, AlertCircle } from 'lucide-react'
import { AgentPhase, AgentStatus } from '@/lib/types'
import { AgentCard } from './agent-card'
import { cn } from '@/lib/utils'

export interface PipelineAgent {
  key: keyof AgentStatus
  name: string
  description: string
  icon: React.ReactNode
  phase: AgentPhase
  logLines: string[]
}

function RailNode({ phase, icon }: { phase: AgentPhase; icon: React.ReactNode }) {
  const isRunning = phase === 'running'
  const isComplete = phase === 'complete'
  const isError = phase === 'error'

  return (
    <div className="relative z-10 shrink-0">
      {isRunning && (
        <motion.span
          className="absolute -inset-1 rounded-full border border-primary/40"
          animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <div
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full border bg-card transition-colors duration-300',
          isRunning && 'border-primary/60 text-primary shadow-[0_0_16px_-4px_var(--color-primary)]',
          isComplete && 'border-emerald-500/50 text-emerald-400',
          isError && 'border-red-500/50 text-red-400',
          phase === 'idle' && 'border-border text-muted-foreground'
        )}
      >
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isComplete ? (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 18 }}
          >
            <Check className="h-4 w-4" />
          </motion.span>
        ) : isError ? (
          <AlertCircle className="h-4 w-4" />
        ) : (
          icon
        )}
      </div>
    </div>
  )
}

function Beam({ active }: { active: boolean }) {
  return (
    <div className="absolute left-[18px] top-9 bottom-0 w-px -translate-x-1/2 overflow-hidden">
      {/* base rail */}
      <div className={cn('h-full w-px transition-opacity duration-500', active ? 'beam-rail opacity-100' : 'bg-border opacity-70')} />
      {/* travelling light */}
      {active && (
        <div
          className="absolute inset-x-0 top-0 h-10 w-px bg-linear-to-b from-transparent via-primary to-transparent"
          style={{ animation: 'beam-travel 1.4s linear infinite' }}
        />
      )}
    </div>
  )
}

export function AgentPipeline({ agents }: { agents: PipelineAgent[] }) {
  return (
    <div className="relative">
      {agents.map((agent, i) => {
        const isLast = i === agents.length - 1
        return (
          <div key={agent.key} className="relative pb-4 pl-12 last:pb-0">
            {!isLast && <Beam active={agent.phase === 'complete'} />}
            <div className="absolute left-0 top-0">
              <RailNode phase={agent.phase} icon={agent.icon} />
            </div>
            <AgentCard
              name={agent.name}
              description={agent.description}
              phase={agent.phase}
              logLines={agent.logLines}
            />
          </div>
        )
      })}
    </div>
  )
}
