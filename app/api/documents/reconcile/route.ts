import { NextRequest, NextResponse } from 'next/server'
import { chatJSON } from '@/lib/ai'
import {
  ExtractedDoc,
  ReconcileIssue,
  ReconcileField,
  ReconcileResult,
  FieldStatus,
} from '@/lib/types'
import {
  enrichExtracted,
  resolveCoo,
  reconcileQuantities,
  formatQuantityDisplay,
  fmtNum,
} from '@/lib/trade-reconcile'

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

function numbersDiffer(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return false
  const denom = Math.max(Math.abs(a), Math.abs(b), 1)
  return Math.abs(a - b) / denom > NUMERIC_TOLERANCE
}

function deterministicReconcile(rawPl: ExtractedDoc, rawInv: ExtractedDoc): ReconcileResult {
  const { pl, inv } = enrichExtracted(rawPl, rawInv)
  const issues: ReconcileIssue[] = []

  const importer = pick(inv.importer, pl.importer)
  const supplier = pick(inv.supplier, pl.supplier)
  const totalValue = pick(inv.totalValue, pl.totalValue)
  const currency = pick(inv.currency, pl.currency)
  const skuCount = pick(pl.skuCount, inv.skuCount)
  const grossWeightKg = pick(pl.grossWeightKg, inv.grossWeightKg)

  // ── COO: semantic resolution, not supplier country ─────────────────────────
  const cooResult = resolveCoo(pl, inv)
  const coo = cooResult.coo
  issues.push(...cooResult.issues)

  // ── Quantity: unit-normalized reconciliation ─────────────────────────────
  const qtyResult = reconcileQuantities(pl, inv)
  const quantityStatus: FieldStatus = qtyResult.match ? 'ok' : (qtyResult.plNorm.kg === null ? 'missing' : 'mismatch')

  if (!qtyResult.match && qtyResult.plNorm.kg !== null && qtyResult.invNorm.kg !== null) {
    issues.push({
      code: 'quantity_mismatch',
      field: 'quantity',
      severity: 'error',
      message: qtyResult.message,
      packingListValue: qtyResult.plNorm.display,
      invoiceValue: qtyResult.invNorm.display,
    })
  }
  // When units differ but normalize to the same weight, field table shows "Matched"
  // with the conversion trail — no false-positive quantity_mismatch issue.

  // ── Missing critical info ──────────────────────────────────────────────────
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
    issues.push({ code: 'currency_missing', field: 'currency', severity: 'warning', message: 'Total value is present but no currency is stated.' })
  }

  // Certificate of Origin — deterministic, country-agnostic
  issues.push({
    code: 'coo_certificate_missing',
    field: 'documents',
    severity: 'warning',
    message: coo
      ? `No Certificate of Origin attached. Verify origin documentation for ${coo} goods before filing.`
      : 'No Certificate of Origin attached. Origin could not be confirmed from available documents.',
  })

  // ── Cross-document field mismatches ──────────────────────────────────────
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
  if (numbersDiffer(pl.totalValue, inv.totalValue)) {
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
  if (numbersDiffer(pl.grossWeightKg, inv.grossWeightKg)) {
    // Only flag if invoice actually has a gross weight; invoice often omits it
    if (inv.grossWeightKg !== null) {
      issues.push({
        code: 'weight_mismatch', field: 'grossWeightKg', severity: 'warning',
        message: 'Gross weight does not match between documents.',
        packingListValue: `${fmtNum(pl.grossWeightKg)} kg`, invoiceValue: `${fmtNum(inv.grossWeightKg)} kg`,
      })
    }
  }
  if (numbersDiffer(pl.skuCount, inv.skuCount)) {
    issues.push({
      code: 'sku_mismatch', field: 'skuCount', severity: 'warning',
      message: 'SKU / line-item count does not match between documents.',
      packingListValue: fmtNum(pl.skuCount), invoiceValue: fmtNum(inv.skuCount),
    })
  }

  const mismatchFields = new Set(
    issues.filter(i => i.code.endsWith('_mismatch') || i.code === 'coo_suspect').map(i => i.field),
  )
  const fieldStatus = (key: string, value: unknown, override?: FieldStatus): FieldStatus => {
    if (override) return override
    if (value === null || value === undefined || value === '') return 'missing'
    if (mismatchFields.has(key)) return 'mismatch'
    return 'ok'
  }

  const plQtyDisplay = formatQuantityDisplay(pl)
  const invQtyDisplay = formatQuantityDisplay(inv)
  const reconciledQty = qtyResult.match && qtyResult.plNorm.mt != null
    ? `${qtyResult.plNorm.mt.toFixed(2)} MT (${qtyResult.message.split(': ')[1] ?? 'normalized match'})`
    : `${plQtyDisplay} / ${invQtyDisplay}`

  const fields: ReconcileField[] = [
    { key: 'importer', label: 'Importer', value: importer ?? '—', status: fieldStatus('importer', importer) },
    { key: 'supplier', label: 'Supplier', value: supplier ?? '—', status: fieldStatus('supplier', supplier) },
    { key: 'coo', label: 'COO', value: coo ? `${coo} (${cooResult.source})` : '—', status: fieldStatus('coo', coo) },
    { key: 'product', label: 'Product', value: pick(inv.productDescription, pl.productDescription) ?? '—', status: 'ok' },
    { key: 'totalValue', label: 'Total Value', value: totalValue !== null ? `${currency ? currency + ' ' : ''}${fmtNum(totalValue)}` : '—', status: fieldStatus('totalValue', totalValue) },
    { key: 'currency', label: 'Currency', value: currency ?? '—', status: fieldStatus('currency', currency) },
    { key: 'quantity', label: 'Quantity (reconciled)', value: reconciledQty, status: quantityStatus },
    { key: 'grossWeightKg', label: 'Gross Weight', value: grossWeightKg !== null ? `${fmtNum(grossWeightKg)} kg` : '—', status: fieldStatus('grossWeightKg', grossWeightKg) },
    { key: 'skuCount', label: 'SKU Count', value: fmtNum(skuCount), status: fieldStatus('skuCount', skuCount) },
  ]

  return { fields, issues }
}

const REG_SYSTEM_PROMPT = `You are a cautious US customs compliance screener. Given structured fields from a Packing List and Commercial Invoice, flag ONLY regulatory documents that MIGHT be required — use tentative language, never assert requirements as fact.

JSON shape:
{ "possibleDocs": [ { "doc": string, "reason": string } ] }

Rules:
- Use the actual productDescription field — do NOT relabel products (e.g. do not call mung beans "cereal").
- For food/agricultural items, say "Possible FDA-regulated food product — recommend verifying Prior Notice requirements" NOT "FDA Prior Notice is required".
- For origin documentation, reference the resolved COO if provided, not the supplier country.
- Never claim a specific HTS, exemption status, or that a filing is definitively required.
- Return at most 3 items. If uncertain, return { "possibleDocs": [] }.
- "reason" must be one cautious sentence starting with "Possible" or "Recommend verifying".`

async function regulatoryDocs(pl: ExtractedDoc, inv: ExtractedDoc, coo: string | null): Promise<ReconcileIssue[]> {
  try {
    const result = await chatJSON<{ possibleDocs?: { doc: string; reason: string }[] }>({
      system: REG_SYSTEM_PROMPT,
      user: `Resolved COO: ${coo ?? 'unknown'}\n\nPacking List:\n${JSON.stringify(pl, null, 2)}\n\nCommercial Invoice:\n${JSON.stringify(inv, null, 2)}`,
      maxTokens: 500,
      temperature: 0,
    })
    return (result.possibleDocs ?? []).slice(0, 3).map(d => ({
      code: 'regulatory_possible',
      field: 'documents',
      severity: 'warning' as const,
      message: `${d.doc}: ${d.reason}`,
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
    logs.push('→ Normalizing quantity units (BAG/MT/KG) before comparison...')

    const result = deterministicReconcile(packingList, invoice)
    const coo = result.fields.find(f => f.key === 'coo')?.value.split(' (')[0] ?? null
    logs.push(`→ ${result.issues.length} consistency check(s) flagged`)

    logs.push('→ Screening for possible regulatory documents...')
    const regIssues = await regulatoryDocs(packingList, invoice, coo)
    result.issues.push(...regIssues)

    const errors = result.issues.filter(i => i.severity === 'error').length
    logs.push(`✓ Reconciliation complete · ${errors} blocking issue(s), ${result.issues.length - errors} warning(s)`)

    return NextResponse.json({ result, logs })
  } catch (err) {
    console.error('[documents/reconcile]', err)
    return NextResponse.json({ error: 'Reconciliation failed' }, { status: 500 })
  }
}
