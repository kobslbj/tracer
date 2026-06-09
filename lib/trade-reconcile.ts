import { ExtractedDoc, ReconcileIssue } from './types'

const NUMERIC_TOLERANCE = 0.01

// ── Unit normalization ───────────────────────────────────────────────────────

const COUNT_UNITS = new Set([
  'BAG', 'BAGS', 'PKG', 'PKGS', 'PACKAGE', 'PACKAGES', 'PCS', 'PC', 'PIECE', 'PIECES',
  'CTN', 'CARTON', 'CARTONS', 'CNTR', 'UNIT', 'UNITS', 'ROLL', 'ROLLS', 'BALE', 'BALES',
])

const WEIGHT_UNITS: Record<string, number> = {
  KG: 1, KGS: 1, KILOGRAM: 1, KILOGRAMS: 1,
  MT: 1000, MTS: 1000, TON: 1000, TONNE: 1000, T: 1000,
  LB: 0.453592, LBS: 0.453592, POUND: 0.453592, POUNDS: 0.453592,
}

export function normalizeUnit(raw: string | null | undefined): string | null {
  if (!raw) return null
  const u = raw.trim().toUpperCase().replace(/\./g, '')
  if (u === 'MT' || u.startsWith('MT')) return 'MT'
  if (u === 'KG' || u.startsWith('KG')) return 'KG'
  // "NO. OF CNTR" on packing lists often means bag/package count, not containers
  if (u.includes('CNTR') && !u.includes('CONTAINER')) return 'BAG'
  return u
}

function parsePackUnitKg(raw: string | null): number | null {
  if (!raw) return null
  const m = raw.match(/(\d+(?:\.\d+)?)\s*(?:KG|KGS|KILO)/i)
  return m ? parseFloat(m[1]) : null
}

function supplierCountry(supplier: string | null): string | null {
  if (!supplier) return null
  const lower = supplier.toLowerCase()
  if (lower.includes('taiwan')) return 'Taiwan'
  if (lower.includes('china')) return 'China'
  if (lower.includes('south africa')) return 'South Africa'
  return null
}

/**
 * Fill gaps when OCR omits units / packing spec / product text.
 * Uses cross-document weight math (e.g. 2880 bags × 25kg = 72 MT).
 */
export function enrichExtracted(pl: ExtractedDoc, inv: ExtractedDoc): { pl: ExtractedDoc; inv: ExtractedDoc } {
  const outPl: ExtractedDoc = { ...pl }
  const outInv: ExtractedDoc = { ...inv }

  if (!outPl.packUnitKg) outPl.packUnitKg = parsePackUnitKg(outPl.packingSpecRaw)
  if (!outPl.packUnitLabel && outPl.packingSpecRaw?.toLowerCase().includes('bag')) {
    outPl.packUnitLabel = 'Bag'
  }

  const plWeight = outPl.netWeightKg ?? outPl.grossWeightKg
  const plQty = outPl.quantity
  const invQty = outInv.quantity

  // Invoice quantity is often MT when it's a small number matching PL total weight
  if (!outInv.quantityUnit && invQty !== null && plWeight !== null && invQty < 500) {
    if (Math.abs(plWeight - invQty * 1000) / Math.max(plWeight, 1) <= NUMERIC_TOLERANCE) {
      outInv.quantityUnit = 'MT'
    }
  }

  // Packing list large count + total weight → infer BAG + per-unit kg
  if (!outPl.quantityUnit && plQty !== null && plWeight !== null && plQty > (invQty ?? 0) * 10) {
    outPl.quantityUnit = 'BAG'
    if (!outPl.packUnitKg && plQty > 0) outPl.packUnitKg = plWeight / plQty
  }

  // Strip COO when it only mirrors supplier address country (common OCR mistake)
  const supplierCoo = supplierCountry(outPl.supplier ?? outInv.supplier)
  const productHint = extractCountryFromText(outPl.productDescription)
    ?? extractCountryFromText(outInv.productDescription)
  const portHint = extractCountryFromText(outPl.portOfLoading)
    ?? extractCountryFromText(outInv.portOfLoading)
  const originHint = productHint ?? portHint

  for (const doc of [outPl, outInv] as ExtractedDoc[]) {
    if (!doc.coo || !supplierCoo) continue
    if (doc.coo.toLowerCase() !== supplierCoo.toLowerCase()) continue
    if (originHint && originHint.toLowerCase() !== supplierCoo.toLowerCase()) {
      doc.coo = null
    }
  }

  return { pl: outPl, inv: outInv }
}

export interface NormalizedQuantity {
  kg: number | null
  mt: number | null
  display: string
  trail: string
}

/** Convert a document's quantity + unit (+ packing spec / weights) to kilograms. */
export function normalizeQuantity(doc: ExtractedDoc): NormalizedQuantity {
  const q = doc.quantity
  const unit = normalizeUnit(doc.quantityUnit)
  const parts: string[] = []

  if (q === null) {
    return { kg: null, mt: null, display: '—', trail: 'no quantity' }
  }

  const display = unit ? `${q.toLocaleString()} ${unit}` : q.toLocaleString()

  // Weight-native units (invoice often quotes MT)
  if (unit && WEIGHT_UNITS[unit]) {
    const kg = q * WEIGHT_UNITS[unit]
    parts.push(`${display} → ${kg.toLocaleString()} kg`)
    return { kg, mt: kg / 1000, display, trail: parts.join('') }
  }

  // Count units with per-unit weight from packing spec (e.g. 2880 BAG × 25 kg)
  if (unit && COUNT_UNITS.has(unit) && doc.packUnitKg) {
    const kg = q * doc.packUnitKg
    parts.push(`${display} × ${doc.packUnitKg} kg/${doc.packUnitLabel ?? 'unit'} = ${kg.toLocaleString()} kg`)
    return { kg, mt: kg / 1000, display, trail: parts.join('') }
  }

  // Fallback: use declared net/gross weight on the same document
  const weight = doc.netWeightKg ?? doc.grossWeightKg
  if (weight !== null && unit && COUNT_UNITS.has(unit)) {
    const implied = weight / q
    parts.push(`${display}; document weight ${weight.toLocaleString()} kg (≈ ${implied.toFixed(2)} kg/unit)`)
    return { kg: weight, mt: weight / 1000, display, trail: parts.join('') }
  }

  if (doc.netWeightKg !== null) {
    parts.push(`weight ${doc.netWeightKg.toLocaleString()} kg`)
    return { kg: doc.netWeightKg, mt: doc.netWeightKg / 1000, display, trail: parts.join('') }
  }
  if (doc.grossWeightKg !== null) {
    parts.push(`gross ${doc.grossWeightKg.toLocaleString()} kg`)
    return { kg: doc.grossWeightKg, mt: doc.grossWeightKg / 1000, display, trail: parts.join('') }
  }

  return { kg: null, mt: null, display, trail: `${display} (unit not convertible)` }
}

export interface QuantityReconcileResult {
  match: boolean
  plNorm: NormalizedQuantity
  invNorm: NormalizedQuantity
  message: string
}

/** Semantic quantity check — compares normalized kg, not raw numbers. */
export function reconcileQuantities(pl: ExtractedDoc, inv: ExtractedDoc): QuantityReconcileResult {
  const enriched = enrichExtracted(pl, inv)
  let plNorm = normalizeQuantity(enriched.pl)
  let invNorm = normalizeQuantity(enriched.inv)

  // Cross-document fallback: PL total weight vs INV quantity-as-MT
  let plKg = plNorm.kg ?? enriched.pl.netWeightKg ?? enriched.pl.grossWeightKg
  let invKg = invNorm.kg
  if (invKg === null && enriched.inv.quantity !== null) {
    const asMt = enriched.inv.quantityUnit === 'MT' || enriched.inv.quantity < 500
    if (asMt) invKg = enriched.inv.quantity * 1000
  }
  if (plKg === null && enriched.pl.quantity !== null) {
    const w = enriched.pl.netWeightKg ?? enriched.pl.grossWeightKg
    if (w !== null) plKg = w
    else if (enriched.pl.packUnitKg) plKg = enriched.pl.quantity * enriched.pl.packUnitKg
  }

  if (plKg !== null && invKg !== null) {
    const denom = Math.max(plKg, invKg, 1)
    const diff = Math.abs(plKg - invKg) / denom
    const match = diff <= NUMERIC_TOLERANCE
    const plMt = plKg / 1000
    const invMt = invKg / 1000

    if (match) {
      const plDisplay = enriched.pl.quantityUnit
        ? `${enriched.pl.quantity?.toLocaleString()} ${enriched.pl.quantityUnit}`
        : `${enriched.pl.quantity?.toLocaleString()} (→ ${plMt.toFixed(2)} MT from weight)`
      const invDisplay = enriched.inv.quantityUnit
        ? `${enriched.inv.quantity?.toLocaleString()} ${enriched.inv.quantityUnit}`
        : `${enriched.inv.quantity?.toLocaleString()} MT (inferred)`
      plNorm = { kg: plKg, mt: plMt, display: plDisplay, trail: `${plDisplay} = ${plKg.toLocaleString()} kg` }
      invNorm = { kg: invKg, mt: invMt, display: invDisplay, trail: `${invDisplay} = ${invKg.toLocaleString()} kg` }
      return {
        match: true,
        plNorm,
        invNorm,
        message: `Quantities reconcile: ${formatReconciledTrail(enriched.pl, enriched.inv, plMt)} (${plKg.toLocaleString()} kg)`,
      }
    }
  }

  if (plNorm.kg === null || invNorm.kg === null) {
    return {
      match: false,
      plNorm,
      invNorm,
      message: 'Cannot reconcile quantities — missing unit, packing spec, or weight data.',
    }
  }

  const denom = Math.max(plNorm.kg, invNorm.kg, 1)
  const diff = Math.abs(plNorm.kg - invNorm.kg) / denom
  const match = diff <= NUMERIC_TOLERANCE

  const message = match
    ? `Quantities reconcile: ${plNorm.trail} = ${invNorm.trail} (${plNorm.kg.toLocaleString()} kg / ${plNorm.mt?.toFixed(2)} MT)`
    : `Normalized quantities differ: PL ${plNorm.trail} vs INV ${invNorm.trail}`

  return { match, plNorm, invNorm, message }
}

export function formatQuantityDisplay(doc: ExtractedDoc): string {
  const norm = normalizeQuantity(doc)
  if (norm.kg !== null && doc.quantityUnit && COUNT_UNITS.has(normalizeUnit(doc.quantityUnit) ?? '')) {
    return `${norm.display} → ${norm.mt?.toFixed(2)} MT`
  }
  return norm.display
}

/** Concise cross-document equivalence, e.g. "2,880 BAG × 25 kg = 72 MT". */
function formatReconciledTrail(pl: ExtractedDoc, inv: ExtractedDoc, mt: number): string {
  const plUnit = normalizeUnit(pl.quantityUnit)
  const invUnit = normalizeUnit(inv.quantityUnit)
  const plQty = pl.quantity !== null
    ? `${pl.quantity.toLocaleString()}${plUnit ? ` ${plUnit}` : ''}`
    : null
  const invQty = inv.quantity !== null
    ? `${inv.quantity.toLocaleString()}${invUnit ? ` ${invUnit}` : ''}`
    : null

  if (plQty && invQty && plUnit !== invUnit) {
    if (pl.packUnitKg && plUnit && COUNT_UNITS.has(plUnit)) {
      const label = pl.packUnitLabel ?? 'unit'
      return `${plQty} × ${pl.packUnitKg} kg/${label} = ${invQty}`
    }
    return `${plQty} = ${invQty}`
  }

  if (plQty) return plQty
  if (invQty) return invQty
  return `${mt.toFixed(2)} MT`
}

/** UI display for reconciled quantity — avoids repeating kg/MT in the trail. */
export function formatReconciledQuantity(
  pl: ExtractedDoc,
  inv: ExtractedDoc,
  result: QuantityReconcileResult,
): string {
  if (!result.match || result.plNorm.mt == null) {
    return `${formatQuantityDisplay(pl)} / ${formatQuantityDisplay(inv)}`
  }

  const mt = result.plNorm.mt.toFixed(2)
  const trail = formatReconciledTrail(pl, inv, result.plNorm.mt)
  const plUnit = normalizeUnit(pl.quantityUnit)
  const invUnit = normalizeUnit(inv.quantityUnit)

  if (plUnit !== invUnit && pl.quantity !== null && inv.quantity !== null) {
    return `${mt} MT (${trail})`
  }

  return `${mt} MT`
}

// ── COO inference (supplier country ≠ country of origin) ───────────────────────

const COUNTRY_ALIASES: Record<string, string> = {
  'south africa': 'South Africa',
  'taiwan': 'Taiwan',
  'china': 'China',
  'usa': 'United States',
  'united states': 'United States',
  'uk': 'United Kingdom',
  'japan': 'Japan',
  'korea': 'South Korea',
  'south korea': 'South Korea',
}

function titleCaseCountry(s: string): string {
  return COUNTRY_ALIASES[s.toLowerCase()] ?? s.replace(/\b\w/g, c => c.toUpperCase())
}

function extractCountryFromText(text: string | null): string | null {
  if (!text) return null
  const lower = text.toLowerCase()
  for (const [key, label] of Object.entries(COUNTRY_ALIASES)) {
    if (lower.includes(key)) return label
  }
  // "DURBAN, SOUTH AFRICA" style
  const m = text.match(/,\s*([A-Za-z\s]+)$/)
  if (m) return titleCaseCountry(m[1].trim())
  return null
}

export interface CooResolution {
  coo: string | null
  source: string
  issues: ReconcileIssue[]
}

/**
 * Resolve country of origin using trade-document semantics — NOT supplier address.
 * Priority: explicit COO field > product description > port of loading.
 */
export function resolveCoo(pl: ExtractedDoc, inv: ExtractedDoc): CooResolution {
  const issues: ReconcileIssue[] = []
  const explicit = pickNonEmpty(pl.coo, inv.coo)
  const fromProduct = extractCountryFromText(pl.productDescription) ?? extractCountryFromText(inv.productDescription)
  const fromPort = extractCountryFromText(pl.portOfLoading) ?? extractCountryFromText(inv.portOfLoading)

  let coo: string | null = null
  let source = 'unknown'

  if (fromProduct) {
    coo = fromProduct
    source = 'product description'
  } else if (fromPort) {
    coo = fromPort
    source = 'port of loading'
  } else if (explicit) {
    coo = explicit
    source = 'document COO field'
  }

  // Flag when explicit COO likely confuses supplier country with origin
  if (explicit && fromProduct && textsDiffer(explicit, fromProduct)) {
    issues.push({
      code: 'coo_suspect',
      field: 'coo',
      severity: 'warning',
      message: `COO field says "${explicit}" but product description indicates "${fromProduct}". Supplier country is not the same as country of origin — verify before filing.`,
      packingListValue: pl.coo ?? '—',
      invoiceValue: inv.coo ?? '—',
    })
    coo = fromProduct
    source = 'product description (overrides suspect COO field)'
  }

  if (!coo) {
    issues.push({
      code: 'coo_missing',
      field: 'coo',
      severity: 'error',
      message: 'Country of origin could not be determined. No explicit COO, product origin, or port-of-loading country found.',
    })
  } else if (fromPort && textsDiffer(coo, fromPort) && source !== 'port of loading') {
    issues.push({
      code: 'coo_port_hint',
      field: 'coo',
      severity: 'warning',
      message: `Port of loading (${pl.portOfLoading ?? inv.portOfLoading}) suggests origin "${fromPort}" — confirm COO matches.`,
    })
  }

  return { coo, source, issues }
}

function pickNonEmpty(a: string | null, b: string | null): string | null {
  return a?.trim() ? a : b?.trim() ? b : null
}

function textsDiffer(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() !== b.trim().toLowerCase()
}

// ── Address normalization ────────────────────────────────────────────────────

/** Strip contact info and punctuation noise so OCR variants compare cleanly. */
export function normalizeAddress(raw: string | null): string | null {
  if (!raw?.trim()) return null
  const stripped = raw
    .replace(/\b(tel|fax|phone|telephone)\b.*$/gi, '')
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return stripped || null
}

/** True when both addresses are present and differ after normalization. */
export function addressesDiffer(a: string | null, b: string | null): boolean {
  const na = normalizeAddress(a)
  const nb = normalizeAddress(b)
  if (!na || !nb) return false
  return na !== nb
}

export function fmtNum(n: number | null): string {
  if (n === null) return '—'
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}
