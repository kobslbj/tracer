import { NextRequest, NextResponse } from 'next/server'
import { chatJSON } from '@/lib/ai'
import {
  ExtractedDoc,
  ReconcileIssue,
  ReconcileField,
  ReconcileResult,
  FieldStatus,
} from '@/lib/types'

// Relative tolerance for numeric comparisons (weights/values rarely match to
// the cent across two documents). Counts are compared exactly.
const NUMERIC_TOLERANCE = 0.01

interface ReconcileRequest {
  packingList: ExtractedDoc
  invoice: ExtractedDoc
}

function pick<T>(a: T | null, b: T | null): T | null {
  return a !== null && a !== undefined ? a : b
}

function textsDiffer(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() !== b.trim().toLowerCase()
}

function numbersDiffer(a: number | null, b: number | null, exact: boolean): boolean {
  if (a === null || b === null) return false
  if (exact) return a !== b
  const denom = Math.max(Math.abs(a), Math.abs(b), 1)
  return Math.abs(a - b) / denom > NUMERIC_TOLERANCE
}

function fmtNum(n: number | null): string {
  if (n === null) return '—'
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function deterministicReconcile(pl: ExtractedDoc, inv: ExtractedDoc): ReconcileResult {
  const issues: ReconcileIssue[] = []

  const importer = pick(inv.importer, pl.importer)
  const supplier = pick(inv.supplier, pl.supplier)
  const coo = pick(pl.coo, inv.coo)
  const totalValue = pick(inv.totalValue, pl.totalValue)
  const currency = pick(inv.currency, pl.currency)
  const skuCount = pick(pl.skuCount, inv.skuCount)
  const grossWeightKg = pick(pl.grossWeightKg, inv.grossWeightKg)
  const quantity = pick(pl.quantity, inv.quantity)

  // ── Missing critical info ──────────────────────────────────────────────────
  if (!coo) {
    issues.push({
      code: 'coo_missing',
      field: 'coo',
      severity: 'error',
      message: 'Country of origin (COO) is missing from both documents. Required for entry classification and Section 301 screening.',
    })
  }
  if (!importer) {
    issues.push({ code: 'importer_missing', field: 'importer', severity: 'error', message: 'Importer of record could not be identified on either document.' })
  }
  if (!supplier) {
    issues.push({ code: 'supplier_missing', field: 'supplier', severity: 'warning', message: 'Supplier / exporter name not found.' })
  }
  if (totalValue === null) {
    issues.push({ code: 'value_missing', field: 'totalValue', severity: 'error', message: 'No total customs value found on the Commercial Invoice.' })
  }
  if (totalValue !== null && !currency) {
    issues.push({ code: 'currency_missing', field: 'currency', severity: 'warning', message: 'Total value is present but no currency is stated. Assuming USD is unsafe for duty calculation.' })
  }

  // ── Inconsistencies between the two documents ──────────────────────────────
  if (textsDiffer(pl.coo, inv.coo)) {
    issues.push({
      code: 'coo_mismatch', field: 'coo', severity: 'error',
      message: 'Country of origin differs between the Packing List and Commercial Invoice.',
      packingListValue: pl.coo ?? '—', invoiceValue: inv.coo ?? '—',
    })
  }
  if (textsDiffer(pl.importer, inv.importer)) {
    issues.push({
      code: 'importer_mismatch', field: 'importer', severity: 'warning',
      message: 'Importer name does not match across documents.',
      packingListValue: pl.importer ?? '—', invoiceValue: inv.importer ?? '—',
    })
  }
  if (textsDiffer(pl.supplier, inv.supplier)) {
    issues.push({
      code: 'supplier_mismatch', field: 'supplier', severity: 'warning',
      message: 'Supplier / exporter name does not match across documents.',
      packingListValue: pl.supplier ?? '—', invoiceValue: inv.supplier ?? '—',
    })
  }
  if (numbersDiffer(pl.totalValue, inv.totalValue, false)) {
    issues.push({
      code: 'value_mismatch', field: 'totalValue', severity: 'error',
      message: 'Declared total value is inconsistent between the two documents.',
      packingListValue: fmtNum(pl.totalValue), invoiceValue: fmtNum(inv.totalValue),
    })
  }
  if (currency && textsDiffer(pl.currency, inv.currency)) {
    issues.push({
      code: 'currency_mismatch', field: 'currency', severity: 'error',
      message: 'Currency differs between documents.',
      packingListValue: pl.currency ?? '—', invoiceValue: inv.currency ?? '—',
    })
  }
  if (numbersDiffer(pl.grossWeightKg, inv.grossWeightKg, false)) {
    issues.push({
      code: 'weight_mismatch', field: 'grossWeightKg', severity: 'warning',
      message: 'Gross weight does not match between the Packing List and Commercial Invoice.',
      packingListValue: `${fmtNum(pl.grossWeightKg)} kg`, invoiceValue: `${fmtNum(inv.grossWeightKg)} kg`,
    })
  }
  if (numbersDiffer(pl.quantity, inv.quantity, true)) {
    issues.push({
      code: 'quantity_mismatch', field: 'quantity', severity: 'error',
      message: 'Total quantity of units does not match between documents.',
      packingListValue: fmtNum(pl.quantity), invoiceValue: fmtNum(inv.quantity),
    })
  }
  if (numbersDiffer(pl.skuCount, inv.skuCount, true)) {
    issues.push({
      code: 'sku_mismatch', field: 'skuCount', severity: 'warning',
      message: 'SKU / line-item count does not match between documents.',
      packingListValue: fmtNum(pl.skuCount), invoiceValue: fmtNum(inv.skuCount),
    })
  }

  const mismatchFields = new Set(issues.filter(i => i.code.endsWith('_mismatch')).map(i => i.field))
  const fieldStatus = (key: string, value: unknown): FieldStatus => {
    if (value === null || value === undefined || value === '') return 'missing'
    if (mismatchFields.has(key)) return 'mismatch'
    return 'ok'
  }

  const fields: ReconcileField[] = [
    { key: 'importer', label: 'Importer', value: importer ?? '—', status: fieldStatus('importer', importer) },
    { key: 'supplier', label: 'Supplier', value: supplier ?? '—', status: fieldStatus('supplier', supplier) },
    { key: 'coo', label: 'COO', value: coo ?? '—', status: fieldStatus('coo', coo) },
    { key: 'totalValue', label: 'Total Value', value: totalValue !== null ? `${currency ? currency + ' ' : ''}${fmtNum(totalValue)}` : '—', status: fieldStatus('totalValue', totalValue) },
    { key: 'currency', label: 'Currency', value: currency ?? '—', status: fieldStatus('currency', currency) },
    { key: 'skuCount', label: 'SKU Count', value: fmtNum(skuCount), status: fieldStatus('skuCount', skuCount) },
    { key: 'grossWeightKg', label: 'Gross Weight', value: grossWeightKg !== null ? `${fmtNum(grossWeightKg)} kg` : '—', status: fieldStatus('grossWeightKg', grossWeightKg) },
    { key: 'quantity', label: 'Quantity', value: fmtNum(quantity), status: fieldStatus('quantity', quantity) },
  ]

  return { fields, issues }
}

const REG_SYSTEM_PROMPT = `You are a US customs compliance reviewer. Given the structured fields extracted from a shipment's Packing List and Commercial Invoice, identify regulatory / partner-government-agency documents that are likely REQUIRED for this shipment but show NO evidence of being present. Respond with valid JSON only.

JSON shape:
{ "missingDocs": [ { "doc": string, "reason": string } ] }

Guidance:
- Consider documents such as FDA Prior Notice, FCC/NCC declarations, MSDS/SDS (hazardous goods, batteries, chemicals), DOT/IATA dangerous goods declaration, FDA/USDA certificates, CE/UL where relevant.
- Base your reasoning on the supplier/importer names, country of origin, and value where they hint at the product type. Only flag documents with a plausible regulatory basis.
- Return at most 4 items. If nothing is clearly required, return { "missingDocs": [] }.
- "reason" must be one short sentence.`

async function regulatoryDocs(pl: ExtractedDoc, inv: ExtractedDoc): Promise<ReconcileIssue[]> {
  try {
    const result = await chatJSON<{ missingDocs?: { doc: string; reason: string }[] }>({
      system: REG_SYSTEM_PROMPT,
      user: `Packing List fields:\n${JSON.stringify(pl, null, 2)}\n\nCommercial Invoice fields:\n${JSON.stringify(inv, null, 2)}`,
      maxTokens: 500,
    })
    return (result.missingDocs ?? []).slice(0, 4).map(d => ({
      code: 'regulatory_missing',
      field: 'documents',
      severity: 'warning' as const,
      message: `Missing ${d.doc}: ${d.reason}`,
    }))
  } catch (err) {
    console.warn('[documents/reconcile] regulatory check skipped:', err)
    return []
  }
}

export async function POST(req: NextRequest) {
  try {
    const { packingList, invoice } = (await req.json()) as ReconcileRequest
    if (!packingList || !invoice) {
      return NextResponse.json({ error: 'Both packingList and invoice are required' }, { status: 400 })
    }

    const logs: string[] = []
    logs.push('→ Cross-checking Packing List against Commercial Invoice...')

    const result = deterministicReconcile(packingList, invoice)
    logs.push(`→ ${result.issues.length} consistency check(s) flagged`)

    logs.push('→ Screening for required regulatory documents...')
    const regIssues = await regulatoryDocs(packingList, invoice)
    result.issues.push(...regIssues)

    const errors = result.issues.filter(i => i.severity === 'error').length
    logs.push(`✓ Reconciliation complete · ${errors} blocking issue(s), ${result.issues.length - errors} warning(s)`)

    return NextResponse.json({ result, logs })
  } catch (err) {
    console.error('[documents/reconcile]', err)
    return NextResponse.json({ error: 'Reconciliation failed' }, { status: 500 })
  }
}
