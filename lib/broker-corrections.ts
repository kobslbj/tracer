import { BrokerCorrection, ReconcileIssue, ShipmentTimelineEvent } from './types'
import { issueTrackingKey } from './review-delta'
import { createTimelineEvent } from './shipment-timeline'

export function isRegulatoryIssue(issue: ReconcileIssue): boolean {
  return issue.code.startsWith('regulatory_')
}

/** Issues still active for operational workflow — excludes broker-dismissed flags. */
export function getActiveIssues(
  issues: ReconcileIssue[],
  corrections: BrokerCorrection[] = [],
): ReconcileIssue[] {
  const dismissed = new Set(
    corrections.filter(c => c.action === 'dismissed').map(c => c.issueKey),
  )
  return issues.filter(i => !dismissed.has(issueTrackingKey(i)))
}

export function correctionForIssue(
  issue: ReconcileIssue,
  corrections: BrokerCorrection[],
): BrokerCorrection | undefined {
  const key = issueTrackingKey(issue)
  return corrections.find(c => c.issueKey === key)
}

export function createBrokerCorrection(
  issue: ReconcileIssue,
  action: BrokerCorrection['action'],
  reason?: string,
): BrokerCorrection {
  return {
    id: crypto.randomUUID(),
    issueKey: issueTrackingKey(issue),
    issueCode: issue.code,
    issueMessage: issue.message,
    action,
    reason: reason?.trim() || undefined,
    createdAt: new Date().toISOString(),
  }
}

export function brokerVerifiedEvent(correction: BrokerCorrection): ShipmentTimelineEvent {
  const label = correction.issueMessage.split('—')[0]?.trim() || correction.issueMessage
  if (correction.action === 'dismissed') {
    const reason = correction.reason ? ` — ${correction.reason}` : ''
    return createTimelineEvent({
      type: 'broker_verified',
      actor: 'broker',
      summary: `Dismissed: ${label}${reason}`,
      relatedItems: [label],
    })
  }
  return createTimelineEvent({
    type: 'broker_verified',
    actor: 'broker',
    summary: `Confirmed: ${label}`,
    relatedItems: [label],
  })
}

export function regulatoryIssues(issues: ReconcileIssue[]): ReconcileIssue[] {
  return issues.filter(isRegulatoryIssue)
}

export function pendingRegulatoryIssues(
  issues: ReconcileIssue[],
  corrections: BrokerCorrection[],
): ReconcileIssue[] {
  return regulatoryIssues(issues).filter(i => !correctionForIssue(i, corrections))
}
