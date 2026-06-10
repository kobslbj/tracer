import { insforge } from './insforge'
import { Entry, ExtractedDoc, ReconcileResult, DocFileMeta, UploadedDocs, EntryReviewSnapshot, ReviewSnapshotRecord, ShipmentTimelineEvent, BrokerCorrection, SupplementaryDoc } from './types'
import { stripDeltaFromSnapshot } from './review-delta'
import { eventsForReviewSave, prependTimelineEvents } from './shipment-timeline'

// Map DB row (snake_case) → Entry (camelCase)
function rowToEntry(row: Record<string, unknown>): Entry {
  return {
    id: row.id as string,
    entryNo: row.entry_no as string,
    port: row.port as Entry['port'],
    portOfDischarge: (row.port_of_discharge as string) ?? undefined,
    productName: row.product_name as string,
    description: row.description as string,
    supplier: (row.supplier as string) ?? undefined,
    importer: (row.importer as string) ?? undefined,
    originCountry: row.origin_country as string,
    quantity: row.quantity as number,
    valueUsd: Number(row.value_usd),
    incoterm: row.incoterm as string,
    htsCode: row.hts_code as string,
    dutyRate: Number(row.duty_rate),
    estimatedDutyUsd: Number(row.estimated_duty_usd),
    riskLevel: row.risk_level as Entry['riskLevel'],
    reviewRequired: row.review_required as boolean,
    reviewReason: row.review_reason as string,
    status: row.status as Entry['status'],
    requiredDocs: row.required_docs as string[],
    explanation: row.explanation as string,
    reviewSnapshot: (row.review_snapshot as EntryReviewSnapshot) ?? undefined,
    reviewHistory: (row.review_history as ReviewSnapshotRecord[]) ?? undefined,
    timeline: (row.timeline as ShipmentTimelineEvent[]) ?? undefined,
    brokerCorrections: (row.broker_corrections as BrokerCorrection[]) ?? undefined,
    supplementaryDocs: (row.supplementary_docs as SupplementaryDoc[]) ?? undefined,
    uploadedDocs: (row.uploaded_docs as UploadedDocs) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export async function fetchEntries(): Promise<Entry[]> {
  const { data, error } = await insforge.database
    .from('entries')
    .select('*')
    .order('created_at', { ascending: false })

  if (error || !data) return []
  return (data as Record<string, unknown>[]).map(rowToEntry)
}

export async function insertEntry(entry: Entry): Promise<void> {
  const { error } = await insforge.database.from('entries').insert([{
    id: entry.id,
    entry_no: entry.entryNo,
    port: entry.port,
    port_of_discharge: entry.portOfDischarge ?? null,
    product_name: entry.productName,
    description: entry.description,
    supplier: entry.supplier ?? null,
    importer: entry.importer ?? null,
    origin_country: entry.originCountry,
    quantity: entry.quantity,
    value_usd: entry.valueUsd,
    incoterm: entry.incoterm,
    hts_code: entry.htsCode,
    duty_rate: entry.dutyRate,
    estimated_duty_usd: entry.estimatedDutyUsd,
    risk_level: entry.riskLevel,
    review_required: entry.reviewRequired,
    review_reason: entry.reviewReason,
    status: entry.status,
    required_docs: entry.requiredDocs,
    explanation: entry.explanation,
    review_snapshot: entry.reviewSnapshot ?? null,
    review_history: entry.reviewHistory ?? [],
    timeline: entry.timeline ?? [],
    broker_corrections: entry.brokerCorrections ?? [],
    supplementary_docs: entry.supplementaryDocs ?? [],
    uploaded_docs: entry.uploadedDocs ?? {},
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  }])
  if (error) throw error
}

export async function updateEntryStatus(id: string, status: Entry['status']): Promise<void> {
  await insforge.database
    .from('entries')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
}

export async function updateEntry(
  id: string,
  patch: Partial<Pick<Entry, 'status' | 'reviewSnapshot' | 'reviewHistory' | 'uploadedDocs' | 'timeline' | 'brokerCorrections' | 'supplementaryDocs'>>,
): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.status !== undefined) row.status = patch.status
  if (patch.reviewSnapshot !== undefined) row.review_snapshot = patch.reviewSnapshot
  if (patch.reviewHistory !== undefined) row.review_history = patch.reviewHistory
  if (patch.uploadedDocs !== undefined) row.uploaded_docs = patch.uploadedDocs
  if (patch.timeline !== undefined) row.timeline = patch.timeline
  if (patch.brokerCorrections !== undefined) row.broker_corrections = patch.brokerCorrections
  if (patch.supplementaryDocs !== undefined) row.supplementary_docs = patch.supplementaryDocs
  await insforge.database.from('entries').update(row).eq('id', id)
}

export async function saveSupplementaryDoc(
  entryId: string,
  existing: SupplementaryDoc[],
  timeline: ShipmentTimelineEvent[],
  doc: SupplementaryDoc,
  event: ShipmentTimelineEvent,
): Promise<{ docs: SupplementaryDoc[]; timeline: ShipmentTimelineEvent[] }> {
  const updatedDocs = [doc, ...existing]
  const updatedTimeline = await appendTimelineEvents(entryId, timeline, [event])
  await updateEntry(entryId, { supplementaryDocs: updatedDocs })
  return { docs: updatedDocs, timeline: updatedTimeline }
}

export async function saveBrokerCorrection(
  entryId: string,
  corrections: BrokerCorrection[],
  timeline: ShipmentTimelineEvent[],
  newCorrection: BrokerCorrection,
  newTimelineEvent: ShipmentTimelineEvent,
): Promise<{ corrections: BrokerCorrection[]; timeline: ShipmentTimelineEvent[] }> {
  const updatedCorrections = [newCorrection, ...corrections.filter(c => c.issueKey !== newCorrection.issueKey)]
  const updatedTimeline = await appendTimelineEvents(entryId, timeline, [newTimelineEvent])
  await updateEntry(entryId, { brokerCorrections: updatedCorrections })
  return { corrections: updatedCorrections, timeline: updatedTimeline }
}

export async function appendTimelineEvents(
  entryId: string,
  existing: ShipmentTimelineEvent[] | undefined,
  newEvents: ShipmentTimelineEvent[],
): Promise<ShipmentTimelineEvent[]> {
  const timeline = prependTimelineEvents(existing, newEvents)
  await updateEntry(entryId, { timeline })
  return timeline
}

/** Replace entry review state — archives prior snapshot into history. */
export async function saveEntryReviewUpdate(
  previous: Entry,
  updated: Entry,
): Promise<void> {
  const history: ReviewSnapshotRecord[] = [...(previous.reviewHistory ?? [])]
  if (previous.reviewSnapshot) {
    history.unshift({
      snapshot: stripDeltaFromSnapshot(previous.reviewSnapshot),
      recordedAt: previous.reviewSnapshot.recordedAt ?? previous.updatedAt,
    })
  }

  const timeline = prependTimelineEvents(
    previous.timeline,
    eventsForReviewSave(previous, updated),
  )

  const { error } = await insforge.database.from('entries').update({
    status: updated.status,
    review_snapshot: updated.reviewSnapshot ?? null,
    review_history: history.slice(0, 10),
    timeline,
    broker_corrections: updated.brokerCorrections ?? previous.brokerCorrections ?? [],
    supplementary_docs: updated.supplementaryDocs ?? previous.supplementaryDocs ?? [],
    uploaded_docs: updated.uploadedDocs ?? {},
    updated_at: updated.updatedAt,
    // Refresh key fields that may change on re-review
    product_name: updated.productName,
    description: updated.description,
    supplier: updated.supplier ?? null,
    importer: updated.importer ?? null,
    origin_country: updated.originCountry,
    quantity: updated.quantity,
    value_usd: updated.valueUsd,
    hts_code: updated.htsCode,
    duty_rate: updated.dutyRate,
    estimated_duty_usd: updated.estimatedDutyUsd,
    risk_level: updated.riskLevel,
    review_required: updated.reviewRequired,
    review_reason: updated.reviewReason,
    required_docs: updated.requiredDocs,
    explanation: updated.explanation,
    port_of_discharge: updated.portOfDischarge ?? null,
  }).eq('id', previous.id)

  if (error) throw error
}

function pick<T>(a: T | null, b: T | null): T | null {
  return a !== null && a !== undefined ? a : b
}

/**
 * Persist a reconciled document set (the merged fields, the cross-check issues,
 * and the InsForge Storage references for both uploaded files) to the
 * `document_sets` table. Returns the new row id.
 */
export async function insertDocumentSet(
  packingList: ExtractedDoc,
  invoice: ExtractedDoc,
  result: ReconcileResult,
  files: DocFileMeta,
): Promise<string | null> {
  const { data, error } = await insforge.database.from('document_sets').insert([{
    importer: pick(invoice.importer, packingList.importer),
    supplier: pick(invoice.supplier, packingList.supplier),
    coo: pick(packingList.coo, invoice.coo),
    total_value: pick(invoice.totalValue, packingList.totalValue),
    currency: pick(invoice.currency, packingList.currency),
    sku_count: pick(packingList.skuCount, invoice.skuCount),
    gross_weight_kg: pick(packingList.grossWeightKg, invoice.grossWeightKg),
    quantity: pick(packingList.quantity, invoice.quantity),
    issues: result.issues,
    packing_list_key: files.packingListKey ?? null,
    packing_list_url: files.packingListUrl ?? null,
    invoice_key: files.invoiceKey ?? null,
    invoice_url: files.invoiceUrl ?? null,
  }]).select()

  if (error) throw error
  return (data?.[0] as { id?: string })?.id ?? null
}
