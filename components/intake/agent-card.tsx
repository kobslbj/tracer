'use client'

import { AgentPhase } from '@/lib/types'
import { AgentLog } from './agent-log'
import { cn } from '@/lib/utils'

interface AgentCardProps {
  name: string
  description: string
  phase: AgentPhase
  logLines: string[]
}

const phaseLabel: Record<AgentPhase, string> = {
  idle: 'Queued',
  running: 'Running',
  complete: 'Done',
  error: 'Error',
}

export function AgentCard({ name, description, phase, logLines }: AgentCardProps) {
  const isRunning = phase === 'running'
  const isComplete = phase === 'complete'
  const isError = phase === 'error'

  return (
    <div
      className={cn(
        'rounded-xl border bg-card/60 p-4 backdrop-blur-sm transition-all duration-300',
        isRunning && 'border-primary/35 shadow-[0_0_24px_-12px_var(--color-primary)]',
        isComplete && 'border-emerald-500/25',
        isError && 'border-red-500/35',
        phase === 'idle' && 'border-border/70 opacity-55'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{name}</h3>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
            isRunning && 'bg-primary/10 text-primary',
            isComplete && 'bg-emerald-500/10 text-emerald-400',
            isError && 'bg-red-500/10 text-red-400',
            phase === 'idle' && 'bg-muted/60 text-muted-foreground'
          )}
        >
          {isRunning && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
          {phaseLabel[phase]}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      <AgentLog lines={logLines} />
    </div>
  )
}
