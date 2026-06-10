import {
  Entry,
  EntryReviewSnapshot,
  PrimaryQueue,
  ReconcileIssue,
  TriageRow,
  IssueConfidence,
} from './types'
import { computeReviewDelta } from './review-delta'
import { entryUrgencyScore } from './issue-display'
import {
  deriveShipmentSummary,
  deriveMissingItems,
  deriveOperationalState,
  tagAllIssues,
} from './shipment-review'
import {
  deriveSupplierAwareCoordination,
  normalizeSupplierName,
  type SupplierProfile,
} from './supplier-profile'

export type ResolutionFilter = 'active' | 'ready_to_submit'

const AGENCY_KEYWORDS: Record<string, RegExp[]> = {
  FDA: [/fda/i, /food/i, /pharma/i, /drug/i, /cosmetic/i, /prior notice/i],
  APHIS: [/aphis/i, /agricultur/i, /phytosanitary/i, /plant/i, /animal/i],
  FCC: [/fcc/i, /radio/i, /rf device/i, /bluetooth/i, /wireless/i],
  NCC: [/ncc/i, /taiwan.*cert/i],
  CBP: [/cbp/i, /customs/i],
}

const TAG_FILTER_MAP: Record<string, (entry: Entry, snapshot: EntryReviewSnapshot) => boolean> = {
  high_risk: (entry) => entry.riskLevel === 'High',
  missing_coo: (_entry, snapshot) =>
    snapshot.missingItems.some(m => /coo|certificate of origin/i.test(m.label + ' ' + m.message)),
  fda: (_entry, snapshot) =>
    snapshot.agencyFlags.includes('FDA') ||
    snapshot.missingItems.some(m => /fda|food|pharma|drug|cosmetic/i.test(m.message)),
  agriculture: (_entry, snapshot) =>
    snapshot.agencyFlags.includes('APHIS') ||
    snapshot.missingItems.some(m => /aphis|agricultur|phytosanitary|plant|animal/i.test(m.message)),
  rf_devices: (_entry, snapshot) =>
    snapshot.agencyFlags.some(f => ['FCC', 'NCC'].includes(f)) ||
    snapshot.missingItems.some(m => /fcc|radio|rf|bluetooth|wireless|ncc/i.test(m.message)),
  pharma: (_entry, snapshot) => {
    const corpus = [
      ...snapshot.missingItems.map(m => m.label + ' ' + m.message),
      ...snapshot.agencyFlags,
      ...snapshot.flagReasons,
    ].join(' ')
    return /pharma|drug|api|batch|lot trace/i.test(corpus)
  },
  low_confidence: (_entry, snapshot) =>
    snapshot.htsConfidence === 'needs_review' ||
    snapshot.issues.some(i => i.confidence === 'needs_review'),
}

function matchAgency(text: string): string[] {
  const flags: string[] = []
  for (const [agency, patterns] of Object.entries(AGENCY_KEYWORDS)) {
    if (patterns.some(p => p.test(text))) flags.push(agency)
  }
  return flags
}

export function deriveAgencyFlags(
  issues: ReconcileIssue[],
  requiredDocs: string[],
): string[] {
  const corpus = [
    ...issues.map(i => i.message),
    ...requiredDocs,
  ].join(' ')
  return [...new Set(matchAgency(corpus))]
}

function deriveFlagReasons(issues: ReconcileIssue[], entry: Entry): string[] {
  const reasons: string[] = []
  const tagged = tagAllIssues(issues)

  if (entry.riskLevel === 'High') {
    reasons.push('High compliance risk classification')
  }
  if (entry.reviewRequired && entry.reviewReason) {
    reasons.push(entry.reviewReason)
  }

  for (const issue of tagged) {
    if (issue.code.startsWith('regulatory_')) {
      const short = issue.message.split('—')[0]?.trim() || issue.message
      if (!reasons.includes(short)) reasons.push(short)
    } else if (issue.severity === 'error') {
      if (!reasons.includes(issue.message)) reasons.push(issue.message)
    } else if (issue.confidence === 'needs_review') {
      const hint = `Uncertain: ${issue.field} — ${issue.message}`
      if (!reasons.includes(hint)) reasons.push(hint)
    }
  }

  if (reasons.length === 0 && entry.requiredDocs.length > 0) {
    reasons.push(`Possible ${entry.requiredDocs.slice(0, 2).join(', ')} requirement`)
  }

  return reasons.slice(0, 6)
}

function deriveSuggestedActions(
  missingItems: EntryReviewSnapshot['missingItems'],
  issues: ReconcileIssue[],
  entry: Entry,
): string[] {
  const actions: string[] = []

  for (const item of missingItems) {
    if (/coo|certificate of origin/i.test(item.label)) {
      actions.push('Awaiting COO from supplier')
    } else if (/phytosanitary/i.test(item.message)) {
      actions.push('Awaiting phytosanitary certificate')
    } else if (/fda/i.test(item.message)) {
      actions.push('Awaiting FDA prior notice — broker to verify')
    } else {
      actions.push(`Awaiting ${item.label} from supplier`)
    }
  }

  if (entry.reviewRequired) {
    actions.push('Awaiting broker classification verification')
  }

  const regulatory = issues.filter(i => i.code.startsWith('regulatory_'))
  for (const issue of regulatory) {
    const action = issue.message.includes('FCC')
      ? 'Awaiting FCC certification — broker to verify'
      : issue.message.includes('FDA')
        ? 'Awaiting FDA requirements — broker to verify'
        : null
    if (action && !actions.includes(action)) actions.push(action)
  }

  if (actions.length === 0 && entry.requiredDocs.length > 0) {
    actions.push(`Awaiting ${entry.requiredDocs[0]} confirmation`)
  }

  if (actions.length === 0) {
    actions.push('Awaiting broker review before filing')
  }

  return [...new Set(actions)].slice(0, 5)
}

function deriveHtsConfidence(issues: ReconcileIssue[], entry: Entry): IssueConfidence {
  if (entry.reviewRequired) return 'needs_review'
  const tagged = tagAllIssues(issues)
  if (tagged.some(i => i.confidence === 'needs_review')) return 'needs_review'
  if (entry.riskLevel === 'High') return 'medium'
  return 'high'
}

export function buildReviewSnapshot(
  issues: ReconcileIssue[],
  entry: Entry,
  options?: { previousSnapshot?: EntryReviewSnapshot | null },
): EntryReviewSnapshot {
  const tagged = tagAllIssues(issues)
  const summary = deriveShipmentSummary(tagged)
  const missingItems = deriveMissingItems(tagged)
  const agencyFlags = deriveAgencyFlags(tagged, entry.requiredDocs)

  const snapshot: EntryReviewSnapshot = {
    filability: summary.filability,
    missingItems,
    agencyFlags,
    flagReasons: deriveFlagReasons(tagged, entry),
    suggestedActions: deriveSuggestedActions(missingItems, tagged, entry),
    htsConfidence: deriveHtsConfidence(tagged, entry),
    issues: tagged,
    recordedAt: new Date().toISOString(),
  }

  if (options?.previousSnapshot) {
    snapshot.delta = computeReviewDelta(options.previousSnapshot, snapshot) ?? undefined
  }

  return snapshot
}

const MISMATCH_CODES = new Set([
  'quantity_mismatch',
  'value_mismatch',
  'currency_mismatch',
  'weight_mismatch',
])

function hasMismatchErrors(issues: ReconcileIssue[]): boolean {
  return issues.some(i => i.severity === 'error' && MISMATCH_CODES.has(i.code))
}

function hasWaitingOnDocs(snapshot: EntryReviewSnapshot): boolean {
  return (
    snapshot.missingItems.length > 0 ||
    snapshot.issues.some(i => i.code === 'coo_certificate_missing')
  )
}

/** Broker marked coordination complete (timeline event, not a CBP filing). */
export function isResolved(entry: Entry): boolean {
  return entry.timeline?.some(e => e.type === 'filing_ready') ?? false
}

/** Single primary inbox bucket — priority-ordered, mutually exclusive. */
export function derivePrimaryStatus(
  snapshot: EntryReviewSnapshot,
  _entry: Entry,
): PrimaryQueue | null {
  if (isResolved(_entry)) return null
  if (hasMismatchErrors(snapshot.issues)) return 'needs_attention'
  if (hasWaitingOnDocs(snapshot) || snapshot.filability === 'blocking') {
    return 'waiting_on_docs'
  }
  return 'ready_for_review'
}

/** Operational tags only — no agency/compliance flag chips. */
export function deriveTags(_entry: Entry, snapshot: EntryReviewSnapshot): string[] {
  const op = deriveOperationalState(snapshot.issues, _entry.brokerCorrections)
  const tags: string[] = []

  if (op.waitingOn.some(w => /coo|certificate of origin/i.test(w))) {
    tags.push('COO pending')
  }
  if (op.waitingOn.some(w => /supplier|confirmation|mismatch/i.test(w))) {
    tags.push('Supplier pending')
  }
  if (op.waitingOn.length > 0 && tags.length === 0) {
    tags.push('Waiting on docs')
  }

  return tags.slice(0, 2)
}

export function legacyTriageFromEntry(entry: Entry): EntryReviewSnapshot {
  const issues: ReconcileIssue[] = []

  if (entry.reviewRequired) {
    issues.push({
      code: 'review_required',
      field: 'classification',
      severity: 'warning',
      message: entry.reviewReason || 'Manual review recommended',
      confidence: 'needs_review',
    })
  }

  for (const doc of entry.requiredDocs) {
    issues.push({
      code: 'regulatory_possible',
      field: 'documents',
      severity: 'warning',
      message: `Possible ${doc} requirement`,
      confidence: 'medium',
    })
  }

  return buildReviewSnapshot(issues, entry)
}

export function getReviewSnapshot(entry: Entry): EntryReviewSnapshot {
  return entry.reviewSnapshot ?? legacyTriageFromEntry(entry)
}

export function deriveTriageRow(
  entry: Entry,
  supplierIndex?: Map<string, SupplierProfile>,
): TriageRow {
  const snapshot = getReviewSnapshot(entry)
  const resolved = isResolved(entry)
  const primaryStatus = resolved ? null : derivePrimaryStatus(snapshot, entry)
  const op = deriveOperationalState(snapshot.issues, entry.brokerCorrections)
  const primaryAction = op.currentBlocker ?? op.nextAction

  const timeline = entry.timeline ?? []
  const waitingOn = snapshot.missingItems.map(m => m.label)
  const profile = entry.supplier
    ? supplierIndex?.get(normalizeSupplierName(entry.supplier)) ?? null
    : null
  const coordination = deriveSupplierAwareCoordination(timeline, waitingOn, profile)
  // Suppress only the generic base placeholder — supplier-aware upgrades pass through.
  const coordinationLine =
    timeline.length > 0 && coordination.coordinationLine !== 'No follow-up logged yet'
      ? coordination.coordinationLine
      : null

  return {
    entryId: entry.id,
    shipment: entry.productName,
    primaryStatus,
    tags: deriveTags(entry, snapshot),
    actionNeeded: primaryAction,
    isResolved: resolved,
    coordinationLine,
  }
}

export function isQueueEntry(entry: Entry): boolean {
  return entry.status !== 'Draft'
}

export function matchesTagFilter(
  entry: Entry,
  filter: string,
): boolean {
  const snapshot = getReviewSnapshot(entry)
  const matcher = TAG_FILTER_MAP[filter]
  return matcher ? matcher(entry, snapshot) : true
}

export function matchesAllTagFilters(entry: Entry, filters: string[]): boolean {
  return filters.every(f => matchesTagFilter(entry, f))
}

export function matchesResolutionFilter(
  entry: Entry,
  resolution: ResolutionFilter,
): boolean {
  if (resolution === 'active') return !isResolved(entry)
  return isResolved(entry)
}

export const PRIMARY_QUEUE_LABELS: Record<PrimaryQueue, string> = {
  needs_attention: 'Needs Attention',
  waiting_on_docs: 'Waiting on Docs',
  ready_for_review: 'Ready for Review',
}

export const TAG_FILTER_CHIPS = [
  { id: 'high_risk', label: 'High Risk' },
  { id: 'missing_coo', label: 'Missing COO' },
  { id: 'fda', label: 'FDA' },
  { id: 'agriculture', label: 'Agriculture' },
  { id: 'rf_devices', label: 'RF Devices' },
  { id: 'pharma', label: 'Pharma' },
  { id: 'low_confidence', label: 'Low Confidence' },
] as const

export const RESOLUTION_FILTER_CHIPS = [
  { id: 'active' as const, label: 'Active' },
  { id: 'ready_to_submit' as const, label: 'Ready to Submit' },
] as const

export interface ActiveIssueStats {
  needsAttention: number
  waitingOnDocs: number
  readyForReview: number
}

export function deriveActiveIssueStats(entries: Entry[]): ActiveIssueStats {
  const active = entries.filter(e => isQueueEntry(e) && !isResolved(e))
  return {
    needsAttention: active.filter(e => deriveTriageRow(e).primaryStatus === 'needs_attention').length,
    waitingOnDocs: active.filter(e => deriveTriageRow(e).primaryStatus === 'waiting_on_docs').length,
    readyForReview: active.filter(e => deriveTriageRow(e).primaryStatus === 'ready_for_review').length,
  }
}

export function deriveTagCounts(entries: Entry[]): Record<string, number> {
  const active = entries.filter(e => isQueueEntry(e) && !isResolved(e))
  const counts: Record<string, number> = {}
  for (const chip of TAG_FILTER_CHIPS) {
    counts[chip.id] = active.filter(e => matchesTagFilter(e, chip.id)).length
  }
  return counts
}

const TAG_EMPTY_LABELS: Record<string, string> = {
  high_risk: 'High Risk',
  missing_coo: 'Missing COO',
  fda: 'FDA',
  agriculture: 'Agriculture',
  rf_devices: 'RF Devices',
  pharma: 'Pharma',
  low_confidence: 'Low Confidence',
}

export function deriveEmptyStateMessage(
  resolution: ResolutionFilter,
  activeTab: PrimaryQueue,
  tagFilters: string[],
): string {
  if (resolution === 'ready_to_submit') {
    return 'No shipments ready for broker submission review.'
  }

  if (tagFilters.length === 1) {
    const label = TAG_EMPTY_LABELS[tagFilters[0]] ?? tagFilters[0]
    return `No shipments currently flagged as ${label}.`
  }

  if (tagFilters.length > 1) {
    return 'No shipments match the selected tags in this queue.'
  }

  switch (activeTab) {
    case 'needs_attention':
      return 'No shipments currently need attention.'
    case 'waiting_on_docs':
      return 'No shipments waiting on documents.'
    case 'ready_for_review':
      return 'No shipments ready for review.'
    default:
      return 'No shipments in this queue.'
  }
}

export interface ResolutionMetrics {
  reviewedToday: number
  readyToSubmit: number
}

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

export function deriveResolutionMetrics(entries: Entry[]): ResolutionMetrics {
  const resolved = entries.filter(e => isResolved(e))
  return {
    reviewedToday: resolved.filter(e => isToday(e.updatedAt)).length,
    readyToSubmit: resolved.length,
  }
}

export function sortEntriesForQueue(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    const sa = getReviewSnapshot(a)
    const sb = getReviewSnapshot(b)
    const pa = entryUrgencyScore(sa.issues, sa.missingItems.length, sa.agencyFlags.length)
    const pb = entryUrgencyScore(sb.issues, sb.missingItems.length, sb.agencyFlags.length)
    if (pa !== pb) return pb - pa
    const riskOrder = { High: 0, Medium: 1, Low: 2 }
    const ra = riskOrder[a.riskLevel]
    const rb = riskOrder[b.riskLevel]
    if (ra !== rb) return ra - rb
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
}

/** @deprecated Use derivePrimaryStatus */
export function deriveQueueStatus(
  snapshot: EntryReviewSnapshot,
  entry: Entry,
): PrimaryQueue {
  return derivePrimaryStatus(snapshot, entry) ?? 'ready_for_review'
}
