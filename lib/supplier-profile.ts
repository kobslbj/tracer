import { Entry, ShipmentTimelineEvent } from './types'
import { normalizePartyName } from './party-identity'
import {
  CoordinationState,
  deriveCoordinationState,
  sortTimeline,
  startOfDay,
} from './shipment-timeline'

// Demo-tunable thresholds
const FAST_REPLY_MAX_HOURS = 24
const MODERATE_REPLY_MAX_HOURS = 72
const FAST_FOLLOWUP_SILENCE_HOURS = 12
const UNRELIABLE_ESCALATE_SILENCE_HOURS = 24
const UNRELIABLE_BROKEN_PROMISES = 2
const COMMON_ITEM_MIN_SHIPMENTS = 2
const COMMON_ITEM_LIMIT = 3

const DAY_MS = 24 * 60 * 60 * 1000

export type ResponsivenessGrade = 'fast' | 'moderate' | 'slow' | 'unknown'

/** Cross-shipment supplier behavior derived from entry timelines + snapshots. */
export interface SupplierProfile {
  /** Display casing from the most recent entry. */
  supplierName: string
  shipmentCount: number
  avgReplyHours: number | null
  replySampleCount: number
  promisesKept: number
  promisesBroken: number
  promisesPending: number
  /** kept / (kept + broken) — null when no promise has resolved yet. */
  promiseKeptRate: number | null
  followUpsPerShipment: number | null
  /** Missing-item labels seen in >= 2 shipments, most frequent first. */
  commonMissingItems: string[]
  grade: ResponsivenessGrade
}

/** Identity key for cross-shipment matching — exact after normalization, no fuzzy match. */
export const normalizeSupplierName = normalizePartyName

// followup_sent is defined but never logged today, so reply gaps measure
// drafted→reply — an acceptable proxy that understates true latency.
function replyGapsHours(timeline: ShipmentTimelineEvent[]): number[] {
  const oldestFirst = sortTimeline(timeline).reverse()
  const gaps: number[] = []
  let pendingFollowUpAt: number | null = null
  for (const event of oldestFirst) {
    if (event.type === 'followup_drafted' || event.type === 'followup_sent') {
      pendingFollowUpAt = new Date(event.createdAt).getTime()
    } else if (event.type === 'supplier_replied' && pendingFollowUpAt !== null) {
      gaps.push((new Date(event.createdAt).getTime() - pendingFollowUpAt) / (1000 * 60 * 60))
      pendingFollowUpAt = null
    }
  }
  return gaps
}

function tallyPromises(timeline: ShipmentTimelineEvent[]): {
  kept: number
  broken: number
  pending: number
} {
  const oldestFirst = sortTimeline(timeline).reverse()
  const todayStart = startOfDay(new Date().toISOString())
  let kept = 0
  let broken = 0
  let pending = 0

  oldestFirst.forEach((event, i) => {
    if (event.type !== 'supplier_replied' || !event.promisedBy) return
    const deadline = startOfDay(event.promisedBy) + DAY_MS
    const fulfilled = oldestFirst.slice(i + 1).some(
      later =>
        (later.type === 'issue_resolved' || later.type === 'document_uploaded') &&
        new Date(later.createdAt).getTime() <= deadline,
    )
    if (fulfilled) kept++
    else if (startOfDay(event.promisedBy) < todayStart) broken++
    else pending++
  })

  return { kept, broken, pending }
}

/** Missing-item labels across current snapshot + archived history — patterns survive resolution. */
export function missingItemLabels(entry: Entry): Set<string> {
  const labels = new Set<string>()
  for (const item of entry.reviewSnapshot?.missingItems ?? []) labels.add(item.label)
  for (const record of entry.reviewHistory ?? []) {
    for (const item of record.snapshot.missingItems ?? []) labels.add(item.label)
  }
  return labels
}

function profileFromEntries(group: Entry[]): SupplierProfile {
  const newestFirst = [...group].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  const supplierName = newestFirst.find(e => e.supplier?.trim())?.supplier?.trim() ?? ''

  const gaps = group.flatMap(e => replyGapsHours(e.timeline ?? []))
  const avgReplyHours = gaps.length
    ? gaps.reduce((sum, g) => sum + g, 0) / gaps.length
    : null

  let promisesKept = 0
  let promisesBroken = 0
  let promisesPending = 0
  let followUps = 0
  for (const entry of group) {
    const { kept, broken, pending } = tallyPromises(entry.timeline ?? [])
    promisesKept += kept
    promisesBroken += broken
    promisesPending += pending
    followUps += (entry.timeline ?? []).filter(
      e => e.type === 'followup_drafted' || e.type === 'followup_sent',
    ).length
  }
  const promiseDenominator = promisesKept + promisesBroken

  const itemCounts = new Map<string, number>()
  for (const entry of group) {
    for (const label of missingItemLabels(entry)) {
      itemCounts.set(label, (itemCounts.get(label) ?? 0) + 1)
    }
  }
  const commonMissingItems = [...itemCounts.entries()]
    .filter(([, count]) => count >= COMMON_ITEM_MIN_SHIPMENTS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, COMMON_ITEM_LIMIT)
    .map(([label]) => label)

  const grade: ResponsivenessGrade =
    avgReplyHours === null ? 'unknown'
    : avgReplyHours <= FAST_REPLY_MAX_HOURS ? 'fast'
    : avgReplyHours <= MODERATE_REPLY_MAX_HOURS ? 'moderate'
    : 'slow'

  return {
    supplierName,
    shipmentCount: group.length,
    avgReplyHours,
    replySampleCount: gaps.length,
    promisesKept,
    promisesBroken,
    promisesPending,
    promiseKeptRate: promiseDenominator > 0 ? promisesKept / promiseDenominator : null,
    followUpsPerShipment: group.length > 0 ? followUps / group.length : null,
    commonMissingItems,
    grade,
  }
}

export function buildSupplierProfileIndex(entries: Entry[]): Map<string, SupplierProfile> {
  const groups = new Map<string, Entry[]>()
  for (const entry of entries) {
    const key = normalizeSupplierName(entry.supplier ?? '')
    if (!key) continue
    const group = groups.get(key)
    if (group) group.push(entry)
    else groups.set(key, [entry])
  }
  const index = new Map<string, SupplierProfile>()
  for (const [key, group] of groups) {
    index.set(key, profileFromEntries(group))
  }
  return index
}

export function deriveSupplierProfile(
  supplierName: string,
  entries: Entry[],
): SupplierProfile | null {
  const key = normalizeSupplierName(supplierName)
  if (!key) return null
  const group = entries.filter(e => normalizeSupplierName(e.supplier ?? '') === key)
  if (group.length === 0) return null
  return profileFromEntries(group)
}

export function formatReplyTime(hours: number): string {
  if (hours < 48) return `${Math.max(1, Math.round(hours))}h`
  return `${Math.round(hours / 24)}-day`
}

/**
 * Coordination state with supplier-history-adjusted thresholds and wording.
 * Returns the plain per-shipment state when there is no supplier signal.
 */
export function deriveSupplierAwareCoordination(
  timeline: ShipmentTimelineEvent[] | undefined,
  waitingOn: string[],
  profile: SupplierProfile | null,
): CoordinationState {
  const base = deriveCoordinationState(timeline, waitingOn)
  if (!profile || (profile.replySampleCount === 0 && profile.promisesBroken === 0)) {
    return base
  }

  const name = profile.supplierName
  const replyAfterFollowUp =
    base.lastFollowUp && base.lastSupplierReply
      ? new Date(base.lastSupplierReply.createdAt) > new Date(base.lastFollowUp.createdAt)
      : false
  const silenceHours = base.hoursSinceLastFollowUp ?? 0
  const awaitingReply = waitingOn.length > 0 && !!base.lastFollowUp && !replyAfterFollowUp
  const unreliable =
    profile.promisesBroken >= UNRELIABLE_BROKEN_PROMISES || profile.grade === 'slow'

  let suggestEscalation = base.suggestEscalation
  if (unreliable && awaitingReply && silenceHours >= UNRELIABLE_ESCALATE_SILENCE_HOURS) {
    suggestEscalation = true
  }

  let suggestFollowUp = base.suggestFollowUp
  if (profile.grade === 'fast' && awaitingReply && silenceHours >= FAST_FOLLOWUP_SILENCE_HOURS) {
    suggestFollowUp = true
  }

  const avg = profile.avgReplyHours

  let coordinationLine = base.coordinationLine
  if (suggestEscalation) {
    coordinationLine =
      profile.promisesBroken > 0
        ? `No response after ${base.followUpCount} follow-up${base.followUpCount === 1 ? '' : 's'} — ${name} has broken ${profile.promisesBroken} promise${profile.promisesBroken === 1 ? '' : 's'} before, escalate to importer`
        : avg !== null
          ? `No response after ${base.followUpCount} follow-up${base.followUpCount === 1 ? '' : 's'} — ${name} averages ${formatReplyTime(avg)} replies, escalate to importer`
          : base.coordinationLine
  } else if (base.promiseOverdue && base.activePromise) {
    if (profile.promiseKeptRate !== null) {
      coordinationLine = `Supplier promise overdue — ${name} keeps ${Math.round(profile.promiseKeptRate * 100)}% of promises, draft follow-up now`
    }
  } else if (suggestFollowUp) {
    if (profile.grade === 'slow' && avg !== null) {
      coordinationLine = `${name} averages ${formatReplyTime(avg)} replies — follow up proactively`
    } else if (profile.grade === 'fast' && avg !== null) {
      coordinationLine = `No response in ${Math.round(silenceHours)}h — unusual for ${name} (usually replies within ${formatReplyTime(avg)})`
    }
  } else if (waitingOn.length > 0 && base.followUpCount === 0 && profile.grade === 'slow' && avg !== null) {
    coordinationLine = `${name} averages ${formatReplyTime(avg)} replies — send first follow-up early`
  }

  return { ...base, suggestFollowUp, suggestEscalation, coordinationLine }
}
