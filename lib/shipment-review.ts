import {
  ReconcileIssue,
  IssueConfidence,
  ShipmentReviewSummary,
  MissingReviewItem,
  BrokerCorrection,
} from './types'
import { getActiveIssues } from './broker-corrections'

/** Assign confidence from issue code when not already set. */
export function confidenceForIssueCode(code: string): IssueConfidence {
  if (code === 'coo_suspect' || code === 'coo_port_hint' || code === 'coo_missing') {
    return 'needs_review'
  }
  if (code === 'regulatory_possible') return 'medium'
  if (code === 'supplier_missing' || code === 'currency_missing') return 'medium'
  if (
    code.endsWith('_mismatch') ||
    code.endsWith('_missing') ||
    code === 'value_missing' ||
    code === 'importer_missing' ||
    code === 'coo_certificate_missing'
  ) {
    return 'high'
  }
  return 'medium'
}

export function tagIssueConfidence(issue: ReconcileIssue): ReconcileIssue {
  return {
    ...issue,
    confidence: issue.confidence ?? confidenceForIssueCode(issue.code),
  }
}

export function tagAllIssues(issues: ReconcileIssue[]): ReconcileIssue[] {
  return issues.map(tagIssueConfidence)
}

function shortWaitingLabel(label: string, message: string): string {
  const corpus = `${label} ${message}`
  if (/coo|certificate of origin/i.test(corpus)) return 'Certificate of Origin'
  if (/fda/i.test(corpus)) return 'FDA documentation'
  if (/aphis/i.test(corpus)) return 'APHIS documentation'
  if (/phytosanitary/i.test(corpus)) return 'Phytosanitary certificate'
  if (label.length > 48) return label.slice(0, 45) + '…'
  return label
}

function mismatchWaitingLabel(issue: ReconcileIssue): string {
  if (issue.code === 'quantity_mismatch') return 'Quantity confirmation'
  if (issue.code === 'value_mismatch') return 'Value confirmation'
  if (issue.code === 'currency_mismatch') return 'Currency confirmation'
  return `${issue.field} mismatch`
}

/**
 * Who must act for a waiting item to resolve. Documents and certificates come
 * from the supplier; field mismatches need the supplier to confirm or correct.
 */
export function waitingItemOwnership(label: string): string {
  return /confirmation/i.test(label) ? 'Supplier to confirm' : 'Supplier to provide'
}

export interface OperationalState {
  waitingOn: string[]
  currentBlocker: string | null
  nextAction: string
  canProceed: boolean
  secondaryNotes: { label: string; detail: string }[]
  verificationMismatches: ReconcileIssue[]
}

/** Broker-facing workflow state — workflow over compliance flags. */
export function deriveOperationalState(
  issues: ReconcileIssue[],
  corrections: BrokerCorrection[] = [],
): OperationalState {
  const tagged = tagAllIssues(getActiveIssues(issues, corrections))
  const missing = deriveMissingItems(tagged)
  const errorMismatches = tagged.filter(i => i.code.includes('mismatch') && i.severity === 'error')
  const warningMismatches = tagged.filter(i => i.code.includes('mismatch') && i.severity !== 'error')

  const waitingOn = [
    ...missing.map(m => shortWaitingLabel(m.label, m.message)),
    ...errorMismatches.map(mismatchWaitingLabel),
  ].filter((v, i, a) => a.indexOf(v) === i)

  let currentBlocker: string | null = null
  if (waitingOn.length === 1) {
    const item = waitingOn[0]
    currentBlocker = /coo|certificate of origin/i.test(item)
      ? 'Awaiting COO from supplier'
      : `Awaiting ${item.toLowerCase()} from supplier`
  } else if (waitingOn.length > 1) {
    currentBlocker = `Waiting on supplier for ${waitingOn.length} items before broker can proceed`
  }

  const secondaryNotes = tagged
    .filter(i =>
      i.code.startsWith('regulatory_') ||
      (i.severity === 'warning' && !i.code.includes('mismatch') && !i.code.includes('_missing')),
    )
    .map(i => ({
      label: shortWaitingLabel(i.message.split('—')[0]?.trim() || i.message, i.message),
      detail: i.message,
    }))
    .filter((n, i, a) => a.findIndex(x => x.label === n.label) === i)

  const hasBlocking = tagged.some(i => i.severity === 'error') || missing.length > 0

  return {
    waitingOn,
    currentBlocker,
    nextAction: waitingOn.length > 0 ? 'Generate follow-up email' : 'Save for broker review',
    canProceed: !hasBlocking,
    secondaryNotes,
    verificationMismatches: warningMismatches,
  }
}

export function deriveShipmentSummary(
  issues: ReconcileIssue[],
  corrections: BrokerCorrection[] = [],
): ShipmentReviewSummary {
  const active = getActiveIssues(issues, corrections)
  const tagged = tagAllIssues(active)
  const errors = tagged.filter(i => i.severity === 'error')
  const warnings = tagged.filter(i => i.severity === 'warning')
  const needsReview = tagged.some(i => i.confidence === 'needs_review')
  const op = deriveOperationalState(issues, corrections)

  if (errors.length > 0 || op.waitingOn.length > 0) {
    return {
      filability: 'blocking',
      headline: op.currentBlocker ?? 'Broker cannot proceed yet',
      subline: op.waitingOn.length
        ? `Waiting on: ${op.waitingOn.join(', ')}`
        : 'Resolve blockers before filing prep',
      overallConfidence: 'needs_review',
    }
  }

  if (warnings.length > 0 || needsReview) {
    return {
      filability: 'review_recommended',
      headline: 'Broker review recommended',
      subline: 'No hard blockers — confirm details before filing prep',
      overallConfidence: needsReview ? 'needs_review' : 'medium',
    }
  }

  return {
    filability: 'ready',
    headline: 'Ready for broker review',
    subline: 'No open blockers — broker confirms before filing prep',
    overallConfidence: 'high',
  }
}

export function deriveMissingItems(issues: ReconcileIssue[]): MissingReviewItem[] {
  const tagged = tagAllIssues(issues)
  const items: MissingReviewItem[] = []

  for (const issue of tagged) {
    if (issue.code === 'coo_certificate_missing') {
      items.push({
        label: 'Certificate of Origin',
        message: issue.message,
        confidence: issue.confidence ?? 'high',
      })
    } else if (issue.code.startsWith('regulatory_')) {
      items.push({
        label: shortWaitingLabel(issue.message.split('—')[0]?.trim() || issue.message, issue.message),
        message: issue.message,
        confidence: issue.confidence ?? 'medium',
      })
    } else if (
      issue.code.includes('_missing') &&
      !['importer', 'supplier'].includes(issue.field)
    ) {
      items.push({
        label: issue.field === 'documents' ? 'Supporting document' : issue.field,
        message: issue.message,
        confidence: issue.confidence ?? 'high',
      })
    }
  }

  const seen = new Set<string>()
  return items.filter(item => {
    const key = item.label
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function checklistFromMissingItems(
  items: MissingReviewItem[],
  importer: string,
  product: string,
): string {
  return [
    'Importer document checklist',
    `Importer: ${importer}`,
    `Product: ${product}`,
    '',
    'Items to verify or obtain:',
    ...items.map(m => `- [ ] ${m.label}`),
  ].join('\n')
}
