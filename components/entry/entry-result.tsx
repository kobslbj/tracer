'use client'

import { motion } from 'framer-motion'
import { Entry } from '@/lib/types'
import { EntryDraftCard } from './entry-draft-card'
import { RiskBadge } from '@/components/dashboard/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { CheckCircle, FileText, ArrowRight } from 'lucide-react'

interface EntryResultProps {
  entry: Entry
  onApprove: () => void
}

export function EntryResult({ entry, onApprove }: EntryResultProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-6"
    >
      {/* Summary header */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">{entry.productName}</h3>
            <p className="text-sm text-muted-foreground mt-1">{entry.description}</p>
          </div>
          <RiskBadge risk={entry.riskLevel} />
        </div>

        <Separator className="my-4 bg-border" />

        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">HTS Code</p>
            <p className="text-sm font-mono font-semibold text-foreground mt-0.5">{entry.htsCode}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Duty Rate</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">{entry.dutyRate}%</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Est. Duty</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">${entry.estimatedDutyUsd.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Explanation */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Classification Rationale
        </h4>
        <p className="text-sm text-foreground leading-relaxed">{entry.explanation}</p>
      </div>

      {/* Required docs */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <FileText className="w-3.5 h-3.5" />
          Required Documents
        </h4>
        <div className="flex flex-wrap gap-2">
          {entry.requiredDocs.map(doc => (
            <Badge
              key={doc}
              variant="outline"
              className="text-xs bg-muted/50 border-border text-foreground"
            >
              {doc}
            </Badge>
          ))}
        </div>
      </div>

      {/* Review warning */}
      {entry.reviewRequired && entry.reviewReason && (
        <div className="rounded-xl border border-amber-800/50 bg-amber-950/30 p-4">
          <div className="flex items-start gap-2.5">
            <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-amber-400">Manual Review Required</p>
              <p className="text-xs text-amber-300/80 mt-0.5">{entry.reviewReason}</p>
            </div>
          </div>
        </div>
      )}

      {/* Entry draft + approve */}
      <div className="grid grid-cols-2 gap-4 items-start">
        <EntryDraftCard entry={entry} />
        <div className="flex flex-col gap-3 pt-1">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Review the Replica-drafted entry. Once approved, it persists to InsForge Postgres and appears live on the dashboard via Realtime.
          </p>
          <Button
            onClick={onApprove}
            size="lg"
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 w-full"
          >
            <CheckCircle className="w-4 h-4" />
            Approve & File
            <ArrowRight className="w-4 h-4 ml-auto" />
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
