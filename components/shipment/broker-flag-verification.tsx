'use client'

import { useState } from 'react'
import { BrokerCorrection, ReconcileIssue } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  correctionForIssue,
  createBrokerCorrection,
  brokerVerifiedEvent,
  regulatoryIssues,
} from '@/lib/broker-corrections'
import { issueTrackingKey } from '@/lib/review-delta'
import { matchRequirementPattern } from '@/lib/requirement-patterns'
import { saveBrokerCorrection } from '@/lib/insforge-db'
import { cn } from '@/lib/utils'
import { Check, X, ShieldCheck, Ban } from 'lucide-react'

interface BrokerFlagVerificationProps {
  entryId: string
  productDescription?: string
  issues: ReconcileIssue[]
  corrections: BrokerCorrection[]
  onUpdated: (corrections: BrokerCorrection[], timeline: import('@/lib/types').ShipmentTimelineEvent[]) => void
  timeline: import('@/lib/types').ShipmentTimelineEvent[]
}

export function BrokerFlagVerification({
  entryId,
  productDescription,
  issues,
  corrections,
  onUpdated,
  timeline,
}: BrokerFlagVerificationProps) {
  const flags = regulatoryIssues(issues)
  if (flags.length === 0) return null

  const pattern = matchRequirementPattern(productDescription)

  return (
    <div className="rounded-lg border border-border bg-muted/10 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Broker verification
      </p>
      <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
        Confirm or dismiss AI-suggested flags — your decisions build operational memory.
      </p>
      {pattern && (
        <p className="mb-3 text-[11px] text-muted-foreground/80">
          Pattern: {pattern.category} · commonly missing {pattern.commonlyMissing.join(', ')}
        </p>
      )}
      <ul className="space-y-2">
        {flags.map(issue => (
          <FlagRow
            key={issueTrackingKey(issue)}
            issue={issue}
            correction={correctionForIssue(issue, corrections)}
            entryId={entryId}
            corrections={corrections}
            timeline={timeline}
            onUpdated={onUpdated}
          />
        ))}
      </ul>
    </div>
  )
}

function FlagRow({
  issue,
  correction,
  entryId,
  corrections,
  timeline,
  onUpdated,
}: {
  issue: ReconcileIssue
  correction?: BrokerCorrection
  entryId: string
  corrections: BrokerCorrection[]
  timeline: import('@/lib/types').ShipmentTimelineEvent[]
  onUpdated: BrokerFlagVerificationProps['onUpdated']
}) {
  const [dismissing, setDismissing] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(action: 'confirmed' | 'dismissed', dismissReason?: string) {
    setSaving(true)
    try {
      const newCorrection = createBrokerCorrection(issue, action, dismissReason)
      const event = brokerVerifiedEvent(newCorrection)
      const result = await saveBrokerCorrection(entryId, corrections, timeline, newCorrection, event)
      onUpdated(result.corrections, result.timeline)
      setDismissing(false)
      setReason('')
    } finally {
      setSaving(false)
    }
  }

  if (correction?.action === 'dismissed') {
    return (
      <li className="rounded-md border border-border/40 bg-muted/5 px-3 py-2 text-xs">
        <div className="flex items-start gap-2">
          <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          <div>
            <p className="text-muted-foreground line-through">{issue.message}</p>
            <p className="mt-1 text-emerald-400/90">
              Not applicable
              {correction.reason ? ` — ${correction.reason}` : ''}
            </p>
          </div>
        </div>
      </li>
    )
  }

  if (correction?.action === 'confirmed') {
    return (
      <li className="rounded-md border border-emerald-800/40 bg-emerald-950/15 px-3 py-2 text-xs">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <div>
            <p className="text-foreground/90">{issue.message}</p>
            <p className="mt-1 text-emerald-400/90">Broker confirmed — track with supplier if docs needed</p>
          </div>
        </div>
      </li>
    )
  }

  return (
    <li className="rounded-md border border-amber-800/30 bg-amber-950/10 px-3 py-2.5 text-xs">
      <p className="font-medium text-foreground/90">{issue.message}</p>
      {issue.confidence && (
        <p className="mt-0.5 text-muted-foreground">AI confidence: {issue.confidence.replace('_', ' ')}</p>
      )}

      {dismissing ? (
        <div className="mt-2 space-y-2">
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder='e.g. "Dry roasted retail product — exempt"'
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={saving || !reason.trim()}
              onClick={() => submit('dismissed', reason)}
            >
              {saving ? 'Saving…' : 'Save dismissal'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDismissing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            disabled={saving}
            onClick={() => submit('confirmed')}
          >
            <Check className="h-3 w-3" />
            Confirm
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={cn('h-7 gap-1 text-xs text-muted-foreground')}
            disabled={saving}
            onClick={() => setDismissing(true)}
          >
            <X className="h-3 w-3" />
            Not applicable
          </Button>
        </div>
      )}
    </li>
  )
}
