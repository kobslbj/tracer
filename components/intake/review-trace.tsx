'use client'

import { ReconcileIssue, ExtractedDoc } from '@/lib/types'
import { deriveIssueTier } from '@/lib/issue-display'
import { issueCitations } from '@/lib/citations'
import { cn } from '@/lib/utils'

interface ReviewTraceProps {
  issues: ReconcileIssue[]
  packingList: ExtractedDoc
  invoice: ExtractedDoc
}

interface TraceStep {
  label: string
  detail?: string
  tone: 'done' | 'flag' | 'neutral'
}

function buildSteps(issues: ReconcileIssue[], pl: ExtractedDoc, inv: ExtractedDoc): TraceStep[] {
  const product = inv.productDescription ?? pl.productDescription
  const steps: TraceStep[] = [
    { label: 'Commercial Invoice & Packing List uploaded', tone: 'done' },
  ]

  if (product) {
    steps.push({
      label: `Product identified: ${product.length > 60 ? product.slice(0, 57) + '…' : product}`,
      tone: 'neutral',
    })
  }

  const blocking = issues.filter(i => deriveIssueTier(i) === 'blocking')
  const verification = issues.filter(i => deriveIssueTier(i) === 'verification')

  if (blocking.length > 0) {
    steps.push({
      label: `${blocking.length} blocking issue${blocking.length > 1 ? 's' : ''} detected`,
      detail: blocking[0]?.message,
      tone: 'flag',
    })
  }

  const reg = verification.filter(i => i.code.startsWith('regulatory_'))
  if (reg.length > 0) {
    const cites = issueCitations(reg[0])
    steps.push({
      label: reg[0].message,
      detail: cites[0]?.quote ?? reg[0].evidence?.[0],
      tone: 'flag',
    })
  }

  const missing = issues.filter(i => i.code === 'coo_certificate_missing')
  if (missing.length > 0) {
    steps.push({ label: 'Certificate of Origin not attached', tone: 'flag' })
  }

  if (blocking.length === 0 && verification.length === 0) {
    steps.push({ label: 'Cross-document fields consistent', tone: 'done' })
  } else if (blocking.length === 0) {
    steps.push({ label: 'Broker verification recommended before filing', tone: 'neutral' })
  }

  return steps
}

export function ReviewTrace({ issues, packingList, invoice }: ReviewTraceProps) {
  const steps = buildSteps(issues, packingList, invoice)

  return (
    <div className="rounded-lg border border-border/70 bg-muted/5 px-3 py-2">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Review trace
      </p>
      <ol className="space-y-0">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2 pb-2 last:pb-0">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                  step.tone === 'done' && 'bg-emerald-400/80',
                  step.tone === 'flag' && 'bg-amber-400',
                  step.tone === 'neutral' && 'bg-muted-foreground/40',
                )}
              />
              {i < steps.length - 1 && (
                <span className="my-0.5 w-px flex-1 bg-border/60" />
              )}
            </div>
            <div className="min-w-0 pb-0.5">
              <p className="text-xs leading-snug text-foreground/90">{step.label}</p>
              {step.detail && (
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{step.detail}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
