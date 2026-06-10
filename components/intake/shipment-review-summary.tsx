'use client'

import { useState, useMemo } from 'react'
import { ReconcileIssue, ExtractedDoc, ReviewDelta } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { deriveOperationalState, tagAllIssues } from '@/lib/shipment-review'
import { Mail, Check } from 'lucide-react'
import { ReviewDeltaPanel } from './review-delta-panel'
import { OperationalWorkflowPanel } from './operational-workflow-panel'
import { generateFollowUpEmail, fallbackFollowUpEmail } from '@/lib/resolution-actions'

interface ShipmentReviewSummaryProps {
  issues: ReconcileIssue[]
  packingList: ExtractedDoc
  invoice: ExtractedDoc
  delta?: ReviewDelta | null
  onFollowUpLogged?: (labels: string[]) => void
  followUpLogged?: boolean
}

export function ShipmentReviewSummary({
  issues,
  packingList,
  invoice,
  delta,
  onFollowUpLogged,
  followUpLogged,
}: ShipmentReviewSummaryProps) {
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [loadingEmail, setLoadingEmail] = useState(false)

  const tagged = useMemo(() => tagAllIssues(issues), [issues])
  const op = useMemo(() => deriveOperationalState(tagged), [tagged])

  const supplier = invoice.supplier ?? packingList.supplier ?? 'Supplier'
  const importer = invoice.importer ?? packingList.importer ?? 'Importer'
  const product = invoice.productDescription ?? packingList.productDescription ?? 'the shipment'

  const followUpLabels = op.waitingOn
  const showFollowUp = followUpLabels.length > 0

  async function handleGenerateFollowUp() {
    if (followUpLabels.length === 0) return
    setLoadingEmail(true)
    try {
      let email: string
      const missingItems = op.waitingOn.map(label => ({ label, message: label, confidence: 'high' as const }))
      try {
        email = await generateFollowUpEmail(
          { supplier, importer, product, missingItems },
          followUpLabels,
        )
      } catch {
        email = fallbackFollowUpEmail(
          { supplier, importer, product, missingItems },
          followUpLabels,
        )
      }
      await navigator.clipboard.writeText(email)
      onFollowUpLogged?.(followUpLabels)
      setCopiedEmail(true)
      setTimeout(() => setCopiedEmail(false), 2500)
    } finally {
      setLoadingEmail(false)
    }
  }

  return (
    <div className="space-y-3">
      {delta && <ReviewDeltaPanel delta={delta} />}

      <OperationalWorkflowPanel issues={issues}>
        {showFollowUp && (
          <Button
            onClick={handleGenerateFollowUp}
            disabled={loadingEmail}
            className="gap-1.5"
          >
            {copiedEmail ? <Check className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
            {loadingEmail
              ? 'Generating…'
              : copiedEmail
                ? (followUpLogged ? 'Follow-up generated — saves on shipment save' : 'Copied to clipboard')
                : 'Generate follow-up email'}
          </Button>
        )}
      </OperationalWorkflowPanel>
    </div>
  )
}
