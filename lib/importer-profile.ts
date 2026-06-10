import { Entry } from './types'
import { normalizePartyName } from './party-identity'
import { missingItemLabels } from './supplier-profile'

// Demo-tunable thresholds
const RECENT_WINDOW = 7
const PATTERN_MIN_SHIPMENTS = 2
const PATTERN_LIMIT = 3
const UPFRONT_ACTION_LIMIT = 2

/** A document repeatedly missing across this importer's recent shipments. */
export interface MissingDocPattern {
  label: string
  /** Shipments (all-time) where the label appeared as missing. */
  occurrences: number
  /** Shipments within the recent window where the label appeared. */
  recentOccurrences: number
  /** min(shipmentCount, RECENT_WINDOW) — denominator for "N of last M". */
  windowSize: number
}

export interface AgencyPattern {
  agency: string
  occurrences: number
}

/** Cross-shipment importer behavior — operational memory, derived live from entries. */
export interface ImporterProfile {
  /** Display casing from the most recent entry. */
  importerName: string
  shipmentCount: number
  /** Repeated missing docs in the recent window, most frequent first. */
  missingDocPatterns: MissingDocPattern[]
  /** Agency flags seen in >= 2 shipments, most frequent first. */
  agencyPatterns: AgencyPattern[]
  /** Suppliers this importer typically buys from, most frequent first. */
  typicalSuppliers: string[]
  /** Products this importer typically brings in, most frequent first. */
  commonProducts: string[]
  /** Broker-actionable hints derived from missing-doc patterns. */
  suggestedUpfrontActions: string[]
}

export const normalizeImporterName = normalizePartyName

function agencyFlagsForEntry(entry: Entry): Set<string> {
  const flags = new Set<string>()
  for (const flag of entry.reviewSnapshot?.agencyFlags ?? []) flags.add(flag)
  for (const record of entry.reviewHistory ?? []) {
    for (const flag of record.snapshot.agencyFlags ?? []) flags.add(flag)
  }
  return flags
}

/** Count display-cased values by normalized key, most frequent first. */
function topValues(values: (string | undefined)[], limit: number): string[] {
  const counts = new Map<string, { display: string; count: number }>()
  for (const value of values) {
    const display = value?.trim()
    if (!display) continue
    const key = normalizePartyName(display)
    const existing = counts.get(key)
    if (existing) existing.count++
    else counts.set(key, { display, count: 1 })
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(v => v.display)
}

function profileFromEntries(group: Entry[]): ImporterProfile {
  const newestFirst = [...group].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  const importerName = newestFirst.find(e => e.importer?.trim())?.importer?.trim() ?? ''

  const windowSize = Math.min(RECENT_WINDOW, group.length)
  const recentWindow = newestFirst.slice(0, windowSize)
  const labelSets = new Map<Entry, Set<string>>(
    newestFirst.map(entry => [entry, missingItemLabels(entry)]),
  )

  const allLabels = new Set<string>()
  for (const labels of labelSets.values()) {
    for (const label of labels) allLabels.add(label)
  }
  const missingDocPatterns: MissingDocPattern[] = [...allLabels]
    .map(label => ({
      label,
      occurrences: newestFirst.filter(e => labelSets.get(e)?.has(label)).length,
      recentOccurrences: recentWindow.filter(e => labelSets.get(e)?.has(label)).length,
      windowSize,
    }))
    .filter(p => p.recentOccurrences >= PATTERN_MIN_SHIPMENTS)
    .sort((a, b) => b.recentOccurrences - a.recentOccurrences)
    .slice(0, PATTERN_LIMIT)

  const agencyCounts = new Map<string, number>()
  for (const entry of group) {
    for (const agency of agencyFlagsForEntry(entry)) {
      agencyCounts.set(agency, (agencyCounts.get(agency) ?? 0) + 1)
    }
  }
  const agencyPatterns: AgencyPattern[] = [...agencyCounts.entries()]
    .filter(([, count]) => count >= PATTERN_MIN_SHIPMENTS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, PATTERN_LIMIT)
    .map(([agency, occurrences]) => ({ agency, occurrences }))

  const suggestedUpfrontActions = missingDocPatterns
    .slice(0, UPFRONT_ACTION_LIMIT)
    .map(p => `Request ${p.label} from supplier upfront`)

  return {
    importerName,
    shipmentCount: group.length,
    missingDocPatterns,
    agencyPatterns,
    typicalSuppliers: topValues(group.map(e => e.supplier), PATTERN_LIMIT),
    commonProducts: topValues(group.map(e => e.productName), PATTERN_LIMIT),
    suggestedUpfrontActions,
  }
}

export function buildImporterProfileIndex(entries: Entry[]): Map<string, ImporterProfile> {
  const groups = new Map<string, Entry[]>()
  for (const entry of entries) {
    const key = normalizeImporterName(entry.importer ?? '')
    if (!key) continue
    const group = groups.get(key)
    if (group) group.push(entry)
    else groups.set(key, [entry])
  }
  const index = new Map<string, ImporterProfile>()
  for (const [key, group] of groups) {
    index.set(key, profileFromEntries(group))
  }
  return index
}

export function deriveImporterProfile(
  importerName: string,
  entries: Entry[],
): ImporterProfile | null {
  const key = normalizeImporterName(importerName)
  if (!key) return null
  const group = entries.filter(e => normalizeImporterName(e.importer ?? '') === key)
  if (group.length === 0) return null
  return profileFromEntries(group)
}

// Qualitative phrasing on purpose — exact "N of last M" counts read like a
// legal determination and overstate confidence in OCR-derived history.
export function formatMissingPattern(p: MissingDocPattern): string {
  const majority = p.windowSize > 0 && p.recentOccurrences / p.windowSize >= 0.6
  return majority
    ? `${p.label} frequently missing in recent shipments`
    : `Repeated missing ${p.label} across recent reviews`
}

export function formatAgencyPattern(p: AgencyPattern): string {
  return `${p.agency} documentation commonly requested for similar shipments`
}
