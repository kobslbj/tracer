import { MissingReviewItem } from './types'
import { checklistFromMissingItems } from './shipment-review'

export interface ResolutionActionContext {
  supplier: string
  importer: string
  product: string
  missingItems: MissingReviewItem[]
}

export function isRequestCooAction(action: string): boolean {
  return /request coo|certificate of origin/i.test(action)
}

export function missingItemsForAction(
  action: string,
  missing: MissingReviewItem[],
): string[] {
  if (isRequestCooAction(action)) {
    return missing
      .filter(m => /coo|certificate of origin/i.test(m.label))
      .map(m => m.label)
  }
  const match = missing.find(m => action.toLowerCase().includes(m.label.toLowerCase()))
  return match ? [match.label] : missing.map(m => m.label)
}

export function buildChecklistAttachment(ctx: ResolutionActionContext): string {
  return checklistFromMissingItems(ctx.missingItems, ctx.importer, ctx.product)
}

export async function generateFollowUpEmail(
  ctx: ResolutionActionContext,
  itemLabels: string[],
): Promise<string> {
  const res = await fetch('/api/documents/follow-up', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      supplier: ctx.supplier,
      importer: ctx.importer,
      product: ctx.product,
      missingItems: itemLabels,
    }),
  })
  if (!res.ok) throw new Error('Failed to generate email')
  const data = await res.json()
  return data.email as string
}

export function fallbackFollowUpEmail(ctx: ResolutionActionContext, itemLabels: string[]): string {
  return [
    `Subject: Documents to confirm for ${ctx.product}`,
    '',
    `Dear ${ctx.supplier},`,
    '',
    `We are preparing the import entry for ${ctx.importer} and the following items may be needed — please confirm or provide at your earliest convenience:`,
    '',
    ...itemLabels.map(l => `- ${l}`),
    '',
    'Thank you,',
  ].join('\n')
}
