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
  followup_drafted: 'Follow-up generated',
  followup_sent: 'Follow-up sent',
  supplier_replied: 'Supplier replied',
  broker_verified: 'Broker reviewed flag',
  supporting_document_added: 'Supporting document added',
  filing_ready: 'Ready for broker review',
}

export function createTimelineEvent(input: {
  type: ShipmentEventType
  actor: ShipmentEventActor
  summary: string
  promisedBy?: string
  relatedItems?: string[]
  resolutionTimeHours?: number
}): ShipmentTimelineEvent {
  return {
    id: crypto.randomUUID(),
    type: input.type,
    actor: input.actor,
    summary: input.summary,
    promisedBy: input.promisedBy,
    relatedItems: input.relatedItems,
    resolutionTimeHours: input.resolutionTimeHours,
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

  const resolvedAt = Date.now()
  for (const item of updated.reviewSnapshot?.delta?.resolved ?? []) {
    const firstDetectedIso = firstDetectedAt(previous, item.label)
    const resolutionTimeHours = firstDetectedIso
      ? Math.max(0, (resolvedAt - new Date(firstDetectedIso).getTime()) / (1000 * 60 * 60))
      : undefined
    events.push(
      createTimelineEvent({
        type: 'issue_resolved',
        actor: 'ai',
        summary: `${item.label} resolved since last review`,
        relatedItems: [item.label],
        resolutionTimeHours,
      }),
    )
  }

  return events
}

/**
 * When a missing item was first detected — earliest review snapshot (in history)
 * that listed the label, falling back to when the shipment entered review.
 */
function firstDetectedAt(previous: Entry | null, label: string): string | null {
  if (!previous) return null
  let earliest: string | null = null

  const consider = (recordedAt: string | undefined, hasLabel: boolean) => {
    if (!hasLabel || !recordedAt) return
    if (!earliest || new Date(recordedAt) < new Date(earliest)) earliest = recordedAt
  }

  for (const record of previous.reviewHistory ?? []) {
    const hasLabel = (record.snapshot.missingItems ?? []).some(m => m.label === label)
    consider(record.recordedAt, hasLabel)
  }

  const currentHasLabel = (previous.reviewSnapshot?.missingItems ?? []).some(m => m.label === label)
  consider(previous.reviewSnapshot?.recordedAt ?? previous.updatedAt, currentHasLabel)

  return earliest ?? previous.createdAt
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

export function startOfDay(iso: string): number {
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

/** Compact duration without the "ago" suffix, e.g. "18h" or "3d". */
export function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`
  if (hours < 48) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}

const STALLED_AFTER_HOURS = 24

/**
 * Workflow state-transition timestamps derived from an entry — not DB metadata.
 * Surfaces "how long in queue", "last activity", and "waiting duration" as the
 * broker-native urgency signals.
 */
export interface WorkflowTimestamps {
  /** Time since the shipment entered the review queue, e.g. "18h ago". */
  enteredReviewAgo: string
  /** Time since the most recent workflow event, e.g. "2h ago" — null when no events. */
  lastActivityAgo: string | null
  /** Human label for the most recent event, e.g. "Supplier replied". */
  lastActivityLabel: string | null
  /** Hours waiting on the supplier — null when not waiting. */
  waitingHours: number | null
  /** Where the waiting clock started. */
  waitingSince: 'followup' | 'review' | null
  /** Urgency line, e.g. "Waiting on supplier · 18h" — null when not waiting. */
  waitingLine: string | null
  /** Still waiting and no activity for a while. */
  stalled: boolean
}

export function deriveWorkflowTimestamps(
  entry: Entry,
  waitingOn: string[],
): WorkflowTimestamps {
  const sorted = sortTimeline(entry.timeline ?? [])
  const lastEvent = sorted[0] ?? null

  const lastActivityIso = lastEvent?.createdAt ?? entry.updatedAt ?? null
  const lastActivityAgo = lastActivityIso ? formatRelativeTime(lastActivityIso) : null
  const lastActivityLabel = lastEvent ? EVENT_TYPE_LABELS[lastEvent.type] : null

  const waiting = waitingOn.length > 0
  let waitingHours: number | null = null
  let waitingSince: 'followup' | 'review' | null = null
  let waitingLine: string | null = null

  if (waiting) {
    const lastFollowUp = sorted.find(
      e => e.type === 'followup_drafted' || e.type === 'followup_sent',
    )
    if (lastFollowUp) {
      waitingHours = hoursSince(lastFollowUp.createdAt)
      waitingSince = 'followup'
    } else {
      waitingHours = hoursSince(entry.createdAt)
      waitingSince = 'review'
    }
    waitingLine = `Waiting on supplier · ${formatDuration(waitingHours)}`
  }

  const stalled =
    waiting &&
    lastActivityIso !== null &&
    hoursSince(lastActivityIso) >= STALLED_AFTER_HOURS

  return {
    enteredReviewAgo: formatRelativeTime(entry.createdAt),
    lastActivityAgo,
    lastActivityLabel,
    waitingHours,
    waitingSince,
    waitingLine,
    stalled,
  }
}

export function formatPromisedBy(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
