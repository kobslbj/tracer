import { ExtractedDoc, ReconcileResult } from './types'

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
    originCountry: coo ?? undefined,
    portOfDischarge: inv.portOfDischarge ?? pl.portOfDischarge ?? undefined,
    valueUsd: inv.totalValue ?? pl.totalValue ?? undefined,
    quantity,
    incoterm: inv.incoterm ?? pl.incoterm ?? undefined,
    productName: product?.split(/[,\-]/)[0]?.trim().slice(0, 60) ?? undefined,
    description: product ?? undefined,
  }
}
