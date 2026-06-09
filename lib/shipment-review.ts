import {
  ReconcileIssue,
  IssueConfidence,
  ShipmentReviewSummary,
  MissingReviewItem,
} from './types'

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

export function deriveShipmentSummary(issues: ReconcileIssue[]): ShipmentReviewSummary {
  const tagged = tagAllIssues(issues)
  const errors = tagged.filter(i => i.severity === 'error')
  const warnings = tagged.filter(i => i.severity === 'warning')
  const needsReview = tagged.some(i => i.confidence === 'needs_review')

  if (errors.length > 0) {
    return {
      filability: 'blocking',
      headline: `Cannot file — ${errors.length} item${errors.length > 1 ? 's' : ''} require${errors.length === 1 ? 's' : ''} resolution`,
      subline: warnings.length
        ? `${warnings.length} additional item${warnings.length > 1 ? 's' : ''} to verify`
        : 'Clear the items below before submission',
      overallConfidence: 'needs_review',
    }
  }

  if (warnings.length > 0 || needsReview) {
    return {
      filability: 'review_recommended',
      headline: 'Broker review required',
      subline: 'Verify the items below before filing',
      overallConfidence: needsReview ? 'needs_review' : 'medium',
    }
  }

  return {
    filability: 'ready',
    headline: 'Looks ready to file',
    subline: 'Documents consistent — broker confirmation required',
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
        label: issue.message.split('—')[0]?.trim() || issue.message,
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
