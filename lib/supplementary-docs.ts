import { SupplementaryDoc, ShipmentTimelineEvent } from './types'
import { createTimelineEvent } from './shipment-timeline'

export const SUPPORTING_DOC_TYPES = [
  'Certificate of Origin',
  'Phytosanitary certificate',
  'FDA prior notice',
  'Manufacturer declaration',
  'Commercial invoice (revised)',
  'Packing list (revised)',
  'Other',
] as const

export type SupportingDocType = (typeof SUPPORTING_DOC_TYPES)[number]

export function supplementaryDocLabel(doc: SupplementaryDoc): string {
  return doc.docType === 'Other' && doc.customLabel?.trim()
    ? doc.customLabel.trim()
    : doc.docType
}

export function createSupplementaryDoc(input: {
  docType: string
  customLabel?: string
  filename: string
  fileUrl: string
  fileKey: string
  note?: string
  resolvesItem?: string
}): SupplementaryDoc {
  return {
    id: crypto.randomUUID(),
    docType: input.docType,
    customLabel: input.customLabel?.trim() || undefined,
    filename: input.filename,
    fileUrl: input.fileUrl,
    fileKey: input.fileKey,
    note: input.note?.trim() || undefined,
    resolvesItem: input.resolvesItem?.trim() || undefined,
    uploadedAt: new Date().toISOString(),
  }
}

export function supportingDocumentAddedEvent(doc: SupplementaryDoc): ShipmentTimelineEvent {
  const label = supplementaryDocLabel(doc)
  const note = doc.note ? ` — ${doc.note}` : ''
  const resolves = doc.resolvesItem ? ` (resolves: ${doc.resolvesItem})` : ''
  return createTimelineEvent({
    type: 'supporting_document_added',
    actor: 'broker',
    summary: `Supporting document added — ${label}${resolves}${note}`,
    relatedItems: doc.resolvesItem ? [doc.resolvesItem] : [label],
  })
}
