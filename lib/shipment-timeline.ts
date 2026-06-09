import {
  Entry,
  ShipmentTimelineEvent,
  ShipmentEventType,
  ShipmentEventActor,
} from './types'

const MAX_TIMELINE = 50

export const EVENT_TYPE_LABELS: Record<ShipmentEventType, string> = {
  document_uploaded: 'Documents uploaded',
  review_completed: 'Review completed',
  issue_resolved: 'Issue resolved',
  followup_drafted: 'Follow-up drafted',
  followup_sent: 'Follow-up sent',
  supplier_replied: 'Supplier replied',
  broker_verified: 'Broker verified',
  filing_ready: 'Ready to submit',
}

export function createTimelineEvent(input: {
  type: ShipmentEventType
  actor: ShipmentEventActor
  summary: string
  promisedBy?: string
  relatedItems?: string[]
}): ShipmentTimelineEvent {
  return {
    id: crypto.randomUUID(),
    type: input.type,
    actor: input.actor,
    summary: input.summary,
    promisedBy: input.promisedBy,
    relatedItems: input.relatedItems,
    createdAt: new Date().toISOString(),
  }
}

export function sortTimeline(events: ShipmentTimelineEvent[]): ShipmentTimelineEvent[] {
  return [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

export function prependTimelineEvents(
  existing: ShipmentTimelineEvent[] | undefined,
  newEvents: ShipmentTimelineEvent[],
): ShipmentTimelineEvent[] {
  if (newEvents.length === 0) return existing ?? []
  return [...newEvents, ...(existing ?? [])].slice(0, MAX_TIMELINE)
}

/** Build timeline events when a review is saved or updated. */
export function eventsForReviewSave(previous: Entry | null, updated: Entry): ShipmentTimelineEvent[] {
  const events: ShipmentTimelineEvent[] = []
  const isReReview = !!previous?.reviewSnapshot

  if (!previous) {
    events.push(
      createTimelineEvent({
        type: 'document_uploaded',
        actor: 'broker',
        summary: 'Commercial Invoice and Packing List uploaded',
      }),
    )
  } else if (updated.uploadedDocs && JSON.stringify(updated.uploadedDocs) !== JSON.stringify(previous.uploadedDocs)) {
    events.push(
      createTimelineEvent({
        type: 'document_uploaded',
        actor: 'broker',
        summary: 'Documents re-uploaded for review',
      }),
    )
  }

  const pending = updated.reviewSnapshot?.missingItems.map(m => m.label) ?? []
  events.push(
    createTimelineEvent({
      type: 'review_completed',
      actor: 'ai',
      summary: isReReview
        ? `Re-review saved — ${pending.length} item${pending.length === 1 ? '' : 's'} pending resolution`
        : `Initial review completed — ${pending.length} item${pending.length === 1 ? '' : 's'} pending resolution`,
      relatedItems: pending.length ? pending : undefined,
    }),
  )

  for (const item of updated.reviewSnapshot?.delta?.resolved ?? []) {
    events.push(
      createTimelineEvent({
        type: 'issue_resolved',
        actor: 'ai',
        summary: `${item.label} resolved since last review`,
        relatedItems: [item.label],
      }),
    )
  }

  return events
}

export function createFollowupDraftedEvent(relatedItems: string[]): ShipmentTimelineEvent {
  const items = relatedItems.join(', ')
  return createTimelineEvent({
    type: 'followup_drafted',
    actor: 'broker',
    summary: `Follow-up drafted — waiting on ${items}`,
    relatedItems,
  })
}

export function createSupplierReplyEvent(
  message: string,
  promisedBy?: string,
): ShipmentTimelineEvent {
  const trimmed = message.trim()
  const summary = trimmed.length > 120 ? trimmed.slice(0, 117) + '…' : trimmed
  return createTimelineEvent({
    type: 'supplier_replied',
    actor: 'supplier',
    summary,
    promisedBy,
  })
}

export interface CoordinationState {
  waitingOn: string[]
  followUpCount: number
  lastFollowUp: ShipmentTimelineEvent | null
  lastSupplierReply: ShipmentTimelineEvent | null
  activePromise: ShipmentTimelineEvent | null
  promiseOverdue: boolean
  hoursSinceLastFollowUp: number | null
  hoursSinceSupplierReply: number | null
  suggestFollowUp: boolean
  suggestEscalation: boolean
  coordinationLine: string | null
}

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60)
}

function startOfDay(iso: string): number {
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function deriveCoordinationState(
  timeline: ShipmentTimelineEvent[] | undefined,
  waitingOn: string[],
): CoordinationState {
  const sorted = sortTimeline(timeline ?? [])
  const followUps = sorted.filter(e => e.type === 'followup_drafted' || e.type === 'followup_sent')
  const supplierReplies = sorted.filter(e => e.type === 'supplier_replied')

  const lastFollowUp = followUps[0] ?? null
  const lastSupplierReply = supplierReplies[0] ?? null

  const activePromise = supplierReplies.find(e => e.promisedBy) ?? null
  const promiseOverdue = activePromise?.promisedBy
    ? startOfDay(activePromise.promisedBy) < startOfDay(new Date().toISOString())
    : false

  const hoursSinceLastFollowUp = lastFollowUp ? hoursSince(lastFollowUp.createdAt) : null
  const hoursSinceSupplierReply = lastSupplierReply ? hoursSince(lastSupplierReply.createdAt) : null

  const replyAfterFollowUp =
    lastFollowUp && lastSupplierReply
      ? new Date(lastSupplierReply.createdAt) > new Date(lastFollowUp.createdAt)
      : false

  const suggestFollowUp =
    waitingOn.length > 0 &&
    !!lastFollowUp &&
    !replyAfterFollowUp &&
    (hoursSinceLastFollowUp ?? 0) >= 18

  const suggestEscalation =
    waitingOn.length > 0 &&
    followUps.length >= 2 &&
    !replyAfterFollowUp &&
    (hoursSinceLastFollowUp ?? 0) >= 48

  let coordinationLine: string | null = null
  if (suggestEscalation) {
    coordinationLine = `No supplier response after ${followUps.length} follow-ups — consider escalating to importer`
  } else if (promiseOverdue && activePromise) {
    coordinationLine = `Supplier promise overdue — draft follow-up?`
  } else if (suggestFollowUp && lastFollowUp) {
    coordinationLine = `No supplier response since follow-up ${Math.round(hoursSinceLastFollowUp!)}h ago — draft follow-up?`
  } else if (waitingOn.length > 0 && followUps.length === 0) {
    coordinationLine = 'No follow-up logged yet'
  }

  return {
    waitingOn,
    followUpCount: followUps.length,
    lastFollowUp,
    lastSupplierReply,
    activePromise,
    promiseOverdue,
    hoursSinceLastFollowUp,
    hoursSinceSupplierReply,
    suggestFollowUp,
    suggestEscalation,
    coordinationLine,
  }
}

export function formatRelativeTime(iso: string): string {
  const h = hoursSince(iso)
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`
  if (h < 48) return `${Math.round(h)}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

export function formatPromisedBy(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
