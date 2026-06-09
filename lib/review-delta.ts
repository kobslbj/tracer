import { EntryReviewSnapshot, ReconcileIssue, ReviewDelta, ReviewDeltaItem } from './types'
import { tagAllIssues } from './shipment-review'

const ISSUE_LABELS: Record<string, string> = {
  coo_certificate_missing: 'Certificate of Origin',
  coo_missing: 'Country of origin',
  coo_suspect: 'COO field mismatch',
  coo_port_hint: 'COO vs port of loading',
  importer_missing: 'Importer of record',
  supplier_missing: 'Supplier name',
  importer_address_missing: 'Importer address',
  supplier_address_missing: 'Supplier address',
  importer_mismatch: 'Importer name mismatch',
  supplier_mismatch: 'Supplier name mismatch',
  importer_address_mismatch: 'Importer address mismatch',
  supplier_address_mismatch: 'Supplier address mismatch',
  value_missing: 'Total customs value',
  value_mismatch: 'Total value mismatch',
  currency_missing: 'Currency',
  currency_mismatch: 'Currency mismatch',
  quantity_mismatch: 'Quantity mismatch',
  weight_mismatch: 'Gross weight mismatch',
  sku_mismatch: 'SKU count mismatch',
  review_required: 'Classification review',
}

export function issueTrackingKey(issue: ReconcileIssue): string {
  if (issue.code.startsWith('regulatory_')) {
    return `regulatory:${issue.message.trim().toLowerCase()}`
  }
  return `${issue.code}:${issue.field}`
}

export function issueTrackingLabel(issue: ReconcileIssue): string {
  if (issue.code.startsWith('regulatory_')) {
    return issue.message.split('—')[0]?.trim() || issue.message
  }
  return ISSUE_LABELS[issue.code] ?? issue.message
}

function itemsFromIssues(issues: ReconcileIssue[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const issue of tagAllIssues(issues)) {
    map.set(issueTrackingKey(issue), issueTrackingLabel(issue))
  }
  return map
}

function itemsFromMissing(snapshot: EntryReviewSnapshot): Map<string, string> {
  const map = new Map<string, string>()
  for (const item of snapshot.missingItems) {
    map.set(`missing:${item.label.toLowerCase()}`, item.label)
  }
  return map
}

function mergeTrackingMaps(...maps: Map<string, string>[]): Map<string, string> {
  const merged = new Map<string, string>()
  for (const map of maps) {
    for (const [k, v] of map) merged.set(k, v)
  }
  return merged
}

function toDeltaItems(keys: string[], lookup: Map<string, string>): ReviewDeltaItem[] {
  return keys.map(key => ({ key, label: lookup.get(key) ?? key }))
}

/** Compare two review snapshots — returns null when there is no meaningful prior state. */
export function computeReviewDelta(
  previous: EntryReviewSnapshot | null | undefined,
  current: EntryReviewSnapshot,
): ReviewDelta | null {
  if (!previous) return null

  const prevMap = mergeTrackingMaps(
    itemsFromIssues(previous.issues),
    itemsFromMissing(previous),
  )
  const currMap = mergeTrackingMaps(
    itemsFromIssues(current.issues),
    itemsFromMissing(current),
  )

  const prevKeys = [...prevMap.keys()]
  const currKeys = [...currMap.keys()]

  const resolvedKeys = prevKeys.filter(k => !currMap.has(k))
  const pendingKeys = currKeys.filter(k => prevMap.has(k))
  const newKeys = currKeys.filter(k => !prevMap.has(k))

  if (resolvedKeys.length === 0 && pendingKeys.length === 0 && newKeys.length === 0) {
    return null
  }

  return {
    resolved: toDeltaItems(resolvedKeys, prevMap),
    stillPending: toDeltaItems(pendingKeys, currMap),
    newlyDetected: toDeltaItems(newKeys, currMap),
    comparedAt: current.recordedAt ?? new Date().toISOString(),
    previousReviewAt: previous.recordedAt,
  }
}

/** Compare issue lists directly — useful before a full entry draft exists. */
export function computeIssueListDelta(
  previousIssues: ReconcileIssue[],
  currentIssues: ReconcileIssue[],
): ReviewDelta | null {
  const prevMap = itemsFromIssues(previousIssues)
  const currMap = itemsFromIssues(currentIssues)

  const prevKeys = [...prevMap.keys()]
  const currKeys = [...currMap.keys()]

  const resolvedKeys = prevKeys.filter(k => !currMap.has(k))
  const pendingKeys = currKeys.filter(k => prevMap.has(k))
  const newKeys = currKeys.filter(k => !prevMap.has(k))

  if (resolvedKeys.length === 0 && pendingKeys.length === 0 && newKeys.length === 0) {
    return null
  }

  const now = new Date().toISOString()
  return {
    resolved: toDeltaItems(resolvedKeys, prevMap),
    stillPending: toDeltaItems(pendingKeys, currMap),
    newlyDetected: toDeltaItems(newKeys, currMap),
    comparedAt: now,
  }
}

export function stripDeltaFromSnapshot(snapshot: EntryReviewSnapshot): EntryReviewSnapshot {
  const { delta, ...rest } = snapshot
  void delta
  return rest
}
