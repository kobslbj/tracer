'use client'

import { motion } from 'framer-motion'
import { Check, Loader2, AlertCircle } from 'lucide-react'
import { AgentPhase } from '@/lib/types'
import { AgentLog } from './agent-log'
import { cn } from '@/lib/utils'

interface ReplicaCardProps {
  name: string
  description: string
  phase: AgentPhase
  logLines: string[]
  icon: React.ReactNode
}

export function ReplicaCard({ name, description, phase, logLines, icon }: ReplicaCardProps) {
  const isRunning = phase === 'running'
  const isComplete = phase === 'complete'
  const isError = phase === 'error'

  return (
    <div
      className={cn(
        'relative rounded-xl border bg-card p-4 transition-colors duration-300',
        isRunning && 'border-primary/40',
        isComplete && 'border-emerald-500/40',
        isError && 'border-red-500/40',
        phase === 'idle' && 'border-border opacity-50'
      )}
    >
      {/* Pulse ring when running */}
      {isRunning && (
        <motion.div
          className="absolute inset-0 rounded-xl border-2 border-primary/30"
          animate={{ scale: [1, 1.02, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <div
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center',
              isRunning && 'bg-primary/20 text-primary',
              isComplete && 'bg-emerald-500/20 text-emerald-400',
              isError && 'bg-red-500/20 text-red-400',
              phase === 'idle' && 'bg-muted text-muted-foreground'
            )}
          >
            {isRunning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isComplete ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                <Check className="w-4 h-4" />
              </motion.div>
            ) : isError ? (
              <AlertCircle className="w-4 h-4" />
            ) : (
              icon
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">{name}</h3>
            <span
              className={cn(
                'text-xs font-medium',
                isRunning && 'text-primary',
                isComplete && 'text-emerald-400',
                isError && 'text-red-400',
                phase === 'idle' && 'text-muted-foreground'
              )}
            >
              {phase === 'idle' ? 'Standby' : phase === 'running' ? 'Active...' : phase === 'complete' ? 'Done' : 'Error'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          <AgentLog lines={logLines} />
        </div>
      </div>
    </div>
  )
}
