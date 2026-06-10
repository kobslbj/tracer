import { Entry, ExtractedDoc, ReconcileResult, UploadedDocs } from './types'

export function generateEntryNo(): string {
  return `ENT-${Math.floor(49300 + Math.random() * 1000)}`
}

function inferPort(discharge?: string): Entry['port'] {
  if (!discharge) return 'LAX'
  if (/jfk|new york/i.test(discharge)) return 'JFK'
  if (/seattle|sea/i.test(discharge)) return 'SEA'
  return 'LAX'
}

/** Build a minimal entry from OCR + reconcile — no HTS/duty pipeline. */
export function buildEntryFromDocs(
  pl: ExtractedDoc,
  inv: ExtractedDoc,
  reconcile: ReconcileResult,
  uploadedDocs?: UploadedDocs,
  existing?: Pick<Entry, 'id' | 'entryNo' | 'createdAt' | 'timeline'>,
): Entry {
  const overrides = entryOverridesFromDocs(pl, inv, reconcile)
  const product = overrides.productName ?? 'Shipment'
  const description = overrides.description ?? product
  const now = new Date().toISOString()

  return {
    id: existing?.id ?? `ent-${Date.now()}`,
    entryNo: existing?.entryNo ?? generateEntryNo(),
    port: inferPort(overrides.portOfDischarge),
    portOfDischarge: overrides.portOfDischarge,
    productName: product,
    description,
    supplier: overrides.supplier,
    importer: overrides.importer,
    originCountry: overrides.originCountry ?? '—',
    quantity: overrides.quantity ?? 1,
    valueUsd: overrides.valueUsd ?? 0,
    incoterm: overrides.incoterm ?? 'FOB',
    htsCode: '—',
    dutyRate: 0,
    estimatedDutyUsd: 0,
    riskLevel: 'Low',
    reviewRequired: false,
    reviewReason: '',
    status: 'Draft',
    requiredDocs: [],
    explanation: '',
    uploadedDocs,
    timeline: existing?.timeline,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

/** Merge OCR + reconcile results into entry fields the classify agent often gets wrong. */
export function entryOverridesFromDocs(
  pl: ExtractedDoc,
  inv: ExtractedDoc,
  reconcile: ReconcileResult,
) {
  const cooFromReconcile = reconcile.fields.find(f => f.key === 'coo')?.value.split(' (')[0]?.trim()
  const coo = cooFromReconcile
    || (pl.productDescription?.match(/south africa/i) ? 'South Africa' : null)
    || (pl.portOfLoading?.match(/south africa/i) ? 'South Africa' : null)

  const qtyMt = inv.quantityUnit === 'MT' ? inv.quantity
    : pl.packUnitKg && pl.quantity ? (pl.quantity * pl.packUnitKg) / 1000
    : pl.grossWeightKg ? pl.grossWeightKg / 1000
    : inv.quantity

  const quantity = inv.quantityUnit === 'MT' && inv.quantity != null
    ? inv.quantity
    : qtyMt != null ? Math.round(qtyMt) : undefined

  const product = inv.productDescription ?? pl.productDescription

  return {
    supplier: inv.supplier ?? pl.supplier ?? undefined,
    importer: inv.importer ?? pl.importer ?? undefined,
    originCountry: coo ?? undefined,
    portOfDischarge: inv.portOfDischarge ?? pl.portOfDischarge ?? undefined,
    valueUsd: inv.totalValue ?? pl.totalValue ?? undefined,
    quantity,
    incoterm: inv.incoterm ?? pl.incoterm ?? undefined,
    productName: product?.split(/[,\-]/)[0]?.trim().slice(0, 60) ?? undefined,
    description: product ?? undefined,
  }
}
