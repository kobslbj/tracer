'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createSupplierReplyEvent } from '@/lib/shipment-timeline'
import { ShipmentTimelineEvent } from '@/lib/types'
import { appendTimelineEvents } from '@/lib/insforge-db'

interface LogSupplierReplyProps {
  entryId: string
  timeline: ShipmentTimelineEvent[] | undefined
  onTimelineUpdated: (timeline: ShipmentTimelineEvent[]) => void
}

export function LogSupplierReply({
  entryId,
  timeline,
  onTimelineUpdated,
}: LogSupplierReplyProps) {
  const [message, setMessage] = useState('')
  const [promisedBy, setPromisedBy] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setSaving(true)
    try {
      const event = createSupplierReplyEvent(
        message,
        promisedBy.trim() || undefined,
      )
      const updated = await appendTimelineEvents(entryId, timeline, [event])
      onTimelineUpdated(updated)
      setMessage('')
      setPromisedBy('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-muted/5 px-3 py-2">
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder='e.g. "Will send COO tomorrow morning"'
        rows={2}
        className="mb-2 w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={promisedBy}
          onChange={e => setPromisedBy(e.target.value)}
          title="Promised by (optional)"
          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <Button type="submit" size="sm" className="h-7 text-xs" disabled={saving || !message.trim()}>
          {saving ? 'Saving…' : 'Log reply'}
        </Button>
      </div>
    </form>
  )
}
