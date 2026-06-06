'use client'

import { Entry } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { RiskBadge, StatusBadge } from '@/components/dashboard/status-badge'
import { FileText, DollarSign, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EntryModalProps {
  entry: Entry | null
  open: boolean
  onClose: () => void
}

function MetricCard({ icon, label, value, mono = false }: {
  icon: React.ReactNode
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className={`text-sm font-semibold text-foreground ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}

function FieldRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-xs font-medium text-foreground">{value}</span>
    </div>
  )
}

const STATUS_FLOW = [
  { key: 'Draft', desc: 'AI-drafted, not yet approved' },
  { key: 'Review', desc: 'Awaiting broker approval' },
  { key: 'Filing', desc: 'Submitting to CBP' },
  { key: 'Cleared', desc: 'Released by customs' },
] as const

function StatusFlow({ status }: { status: Entry['status'] }) {
  const currentIdx = STATUS_FLOW.findIndex(s => s.key === status)
  const current = STATUS_FLOW[Math.max(currentIdx, 0)]
  const next = STATUS_FLOW[currentIdx + 1]

  return (
    <div className="mb-5 rounded-lg border border-border bg-muted/10 p-4">
      <div className="mb-3 flex items-center gap-2">
        {STATUS_FLOW.map((s, i) => {
          const done = i < currentIdx
          const active = i === currentIdx
          return (
            <div key={s.key} className="flex flex-1 items-center gap-2 last:flex-none">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'h-2 w-2 rounded-full transition-colors',
                    done && 'bg-emerald-400/70',
                    active && 'bg-primary shadow-[0_0_8px_-1px_var(--color-primary)]',
                    !done && !active && 'bg-muted-foreground/30'
                  )}
                />
                <span
                  className={cn(
                    'text-xs font-medium',
                    active ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {s.key}
                </span>
              </div>
              {i < STATUS_FLOW.length - 1 && (
                <span className={cn('h-px flex-1', done ? 'bg-emerald-400/40' : 'bg-border')} />
              )}
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {current.desc}
        {next && (
          <span className="text-muted-foreground/60"> · next: {next.key}</span>
        )}
      </p>
    </div>
  )
}

export function EntryModal({ entry, open, onClose }: EntryModalProps) {
  if (!entry) return null

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl border-border bg-card p-0">
        {/* Header */}
        <DialogHeader className="border-b border-border px-6 py-5">
          <div className="flex items-start justify-between gap-4 pr-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{entry.entryNo}</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-xs text-muted-foreground">{entry.port}</span>
              </div>
              <DialogTitle className="mt-1 text-lg font-semibold text-foreground">
                {entry.productName}
              </DialogTitle>
              <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{entry.description}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <RiskBadge risk={entry.riskLevel} />
              <StatusBadge status={entry.status} />
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5" style={{ maxHeight: 'calc(85vh - 140px)' }}>
          {/* Status flow */}
          <StatusFlow status={entry.status} />

          {/* Key metrics */}
          <div className="mb-5 grid grid-cols-3 gap-3">
            <MetricCard
              icon={<Tag className="h-3 w-3" />}
              label="HTS Code"
              value={entry.htsCode}
              mono
            />
            <MetricCard
              icon={<DollarSign className="h-3 w-3" />}
              label="Duty Rate"
              value={`${entry.dutyRate}%`}
            />
            <MetricCard
              icon={<DollarSign className="h-3 w-3" />}
              label="Estimated Duty"
              value={`$${entry.estimatedDutyUsd.toLocaleString()}`}
            />
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-2 gap-4">
            {/* Left: shipment details */}
            <div className="rounded-lg border border-border bg-muted/10 px-4 py-2">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Shipment Details
              </p>
              <FieldRow label="Origin Country" value={entry.originCountry} />
              <FieldRow label="Port of Entry" value={entry.port} />
              <FieldRow label="Incoterm" value={entry.incoterm} />
              <FieldRow label="Quantity" value={entry.quantity.toLocaleString()} />
              <FieldRow label="Shipment Value" value={`$${entry.valueUsd.toLocaleString()}`} />
            </div>

            {/* Right: classification rationale */}
            <div className="rounded-lg border border-border bg-muted/10 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Classification Rationale
              </p>
              <p className="text-xs leading-relaxed text-foreground/80">
                {entry.explanation || '—'}
              </p>
            </div>
          </div>

          {/* Required docs */}
          {entry.requiredDocs?.length > 0 && (
            <div className="mt-4 rounded-lg border border-border bg-muted/10 p-4">
              <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                Required Documents
              </p>
              <div className="flex flex-wrap gap-2">
                {entry.requiredDocs.map(doc => (
                  <Badge key={doc} variant="outline" className="border-border bg-muted/50 text-xs text-foreground">
                    {doc}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Review warning */}
          {entry.reviewRequired && entry.reviewReason && (
            <div className="mt-4 rounded-lg border border-amber-800/50 bg-amber-950/30 p-4">
              <div className="flex items-start gap-2.5">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                <div>
                  <p className="text-xs font-semibold text-amber-400">Manual Review Required</p>
                  <p className="mt-0.5 text-xs text-amber-300/80">{entry.reviewReason}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
