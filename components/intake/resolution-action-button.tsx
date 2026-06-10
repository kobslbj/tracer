'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Check, ClipboardCopy, Mail } from 'lucide-react'
import {
  ResolutionActionContext,
  isRequestCooAction,
  missingItemsForAction,
  buildChecklistAttachment,
  generateFollowUpEmail,
  fallbackFollowUpEmail,
} from '@/lib/resolution-actions'
import { createFollowupDraftedEvent } from '@/lib/shipment-timeline'
import { ShipmentTimelineEvent } from '@/lib/types'
import { appendTimelineEvents } from '@/lib/insforge-db'

interface ResolutionActionButtonProps {
  action: string
  context: ResolutionActionContext
  size?: 'sm' | 'default'
  entryId?: string
  timeline?: ShipmentTimelineEvent[]
  onTimelineUpdated?: (timeline: ShipmentTimelineEvent[]) => void
}

export function ResolutionActionButton({
  action,
  context,
  size = 'sm',
  entryId,
  timeline,
  onTimelineUpdated,
}: ResolutionActionButtonProps) {
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const actionable =
    action === 'Generate follow-up email' ||
    isRequestCooAction(action) ||
    context.missingItems.length > 0

  async function handleClick() {
    setLoading(true)
    try {
      const itemLabels = missingItemsForAction(action, context.missingItems)
      let email: string
      try {
        email = await generateFollowUpEmail(context, itemLabels)
      } catch {
        email = fallbackFollowUpEmail(context, itemLabels)
      }

      const checklist = buildChecklistAttachment({
        ...context,
        missingItems: context.missingItems.filter(m => itemLabels.includes(m.label)),
      })

      const bundle = [
        email,
        '',
        '---',
        'Attachment checklist (copy to supplier thread):',
        checklist,
      ].join('\n')

      await navigator.clipboard.writeText(bundle)

      if (entryId && onTimelineUpdated) {
        const event = createFollowupDraftedEvent(itemLabels)
        const updated = await appendTimelineEvents(entryId, timeline, [event])
        onTimelineUpdated(updated)
      }

      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } finally {
      setLoading(false)
    }
  }

  if (!actionable) {
    return (
      <Button variant="outline" size={size} className="h-7 text-xs" disabled>
        {action}
      </Button>
    )
  }

  return (
    <Button
      variant="outline"
      size={size}
      className="h-7 gap-1.5 text-xs"
      disabled={loading}
      onClick={handleClick}
    >
      {copied ? (
        <Check className="h-3 w-3" />
      ) : isRequestCooAction(action) ? (
        <Mail className="h-3 w-3" />
      ) : (
        <ClipboardCopy className="h-3 w-3" />
      )}
      {loading
        ? 'Generating…'
        : copied
          ? (entryId ? 'Follow-up generated' : 'Copied to clipboard')
          : (action === 'Generate follow-up email' ? 'Generate follow-up email' : action)}
    </Button>
  )
}
