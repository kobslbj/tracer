import { issueCitations } from '@/lib/citations'
import { ReconcileIssue, IssueConfidence } from './types'

/** Visual / triage tier — reduces cognitive load vs flat error/warning. */
export type IssueTier = 'blocking' | 'verification' | 'informational'

const BLOCKING_CODES = new Set([
  'importer_missing',
  'value_missing',
  'quantity_mismatch',
  'value_mismatch',
  'currency_mismatch',
  'coo_certificate_missing',
])

const VERIFICATION_CODES = new Set([
  'regulatory_possible',
  'coo_suspect',
  'coo_port_hint',
  'coo_missing',
  'review_required',
])

export function deriveIssueTier(issue: ReconcileIssue): IssueTier {
  if (issue.severity === 'error' || BLOCKING_CODES.has(issue.code)) {
    return 'blocking'
  }
  if (
    VERIFICATION_CODES.has(issue.code) ||
    issue.code.endsWith('_mismatch') ||
    issue.confidence === 'needs_review'
  ) {
    return 'verification'
  }
  return 'informational'
}

export function issueTitle(issue: ReconcileIssue): string {
  return issue.message
}

export function issueEvidence(issue: ReconcileIssue): string[] {
  if (issue.citations?.length) return []

  if (issue.evidence?.length) return issue.evidence

  if (issue.code.startsWith('regulatory_')) {
    const after = issue.message.split('—')[1]?.trim()
    return after ? [after] : []
  }

  if (issue.packingListValue !== undefined || issue.invoiceValue !== undefined) {
    const parts: string[] = []
    if (issue.packingListValue !== undefined) {
      parts.push(`Packing List: ${issue.packingListValue}`)
    }
    if (issue.invoiceValue !== undefined) {
      parts.push(`Commercial Invoice: ${issue.invoiceValue}`)
    }
    return parts
  }

  return []
}

export { issueCitations }

export function shouldShowConfidenceBadge(confidence?: IssueConfidence): boolean {
  return confidence === 'needs_review'
}

export function confidenceLabel(confidence: IssueConfidence): string {
  switch (confidence) {
    case 'needs_review':
      return 'Low confidence — verify manually'
    case 'medium':
      return 'Medium confidence'
    case 'high':
      return 'High confidence'
  }
}

export function entryUrgencyScore(issues: ReconcileIssue[], missingCount: number, agencyCount: number): number {
  const blocking = issues.filter(i => deriveIssueTier(i) === 'blocking').length
  const verification = issues.filter(i => deriveIssueTier(i) === 'verification').length
  const lowConf = issues.some(i => i.confidence === 'needs_review') ? 1 : 0
  return blocking * 10000 + missingCount * 1000 + agencyCount * 100 + verification * 10 + lowConf
}
