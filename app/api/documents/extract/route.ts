import { NextRequest, NextResponse } from 'next/server'
import { chatVisionJSON, documentPart, VisionPart } from '@/lib/ai'
import { DocType, DOC_LABELS, ExtractedDoc } from '@/lib/types'
import { normalizeUnit } from '@/lib/trade-reconcile'

const SYSTEM_PROMPT = `You are a customs document OCR + extraction specialist. You are given a single shipping document (Packing List or Commercial Invoice). Read it carefully and extract fields. Respond with valid JSON only — no markdown.

Required JSON shape:
{
  "importer": string | null,
  "importerAddress": string | null,
  "supplier": string | null,
  "supplierAddress": string | null,
  "coo": string | null,
  "totalValue": number | null,
  "currency": string | null,
  "skuCount": number | null,
  "grossWeightKg": number | null,
  "netWeightKg": number | null,
  "quantity": number | null,
  "quantityUnit": string | null,
  "packUnitKg": number | null,
  "packUnitLabel": string | null,
  "packingSpecRaw": string | null,
  "productDescription": string | null,
  "portOfLoading": string | null,
  "portOfDischarge": string | null,
  "incoterm": string | null
}

Critical rules:

PARTIES (name vs address — extract separately):
- importer: Messrs / Buyer / Consignee company name ONLY (e.g. "MIT CEREAL CO., LTD").
- importerAddress: street address printed under Messrs — city, country included; do NOT include TEL/FAX/phone lines.
- supplier: document header Issuer / Exporter company name ONLY (e.g. "WEL & CO., LTD").
- supplierAddress: street address under the header issuer block — do NOT include TEL/FAX/phone lines.

QUANTITY + UNIT (most important):
- Always extract quantity AND quantityUnit separately. Never merge them.
- quantityUnit must be the printed unit: BAG, PKG, PCS, CTN, MT, KG, LTR, ROLL, etc.
- On Packing Lists, "NO. OF CNTR" or package counts are usually BAG/PKG counts, NOT metric tons.
- On Commercial Invoices, quantity is often in MT (metric tons) or KG.
- Example: "TOTAL 2,880" under NO. OF CNTR with "25 KG / PP Bag" → quantity: 2880, quantityUnit: "BAG", packUnitKg: 25, packUnitLabel: "PP Bag"
- Example: "QUANTITY 72.00 MT" → quantity: 72, quantityUnit: "MT"

PACKING SPEC:
- If a line like "1.00 * 25.00 KG / PP Bag" exists, set packingSpecRaw to that verbatim text, packUnitKg: 25, packUnitLabel: "PP Bag".

COO (country of origin):
- ONLY fill coo if the document has an explicit "Country of Origin" / "COO" field.
- Do NOT set coo from the supplier's address country — supplier location ≠ origin.
- Product description country hints (e.g. "South Africa Mung Bean") go in productDescription, NOT coo unless there is a formal COO certificate line.
- Port of loading (e.g. "DURBAN, SOUTH AFRICA") → portOfLoading.
- Port of discharge / destination (e.g. "KAOHSIUNG, TAIWAN", "CFR KEELUNG") → portOfDischarge.
- Trade term / incoterm (e.g. "CFR", "FOB", "CIF" plus destination if stated) → incoterm.

WEIGHTS:
- Convert all weights to kilograms. netWeightKg = total net; grossWeightKg = total gross.
- Use null for fields not present — do NOT guess.`

interface ExtractRequest {
  docType: DocType
  fileBase64: string
  mimeType: string
  filename?: string
}

function num(v: unknown): number | null {
  return typeof v === 'number' && !Number.isNaN(v) ? v : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export async function POST(req: NextRequest) {
  try {
    const { docType, fileBase64, mimeType, filename } = (await req.json()) as ExtractRequest

    if (!docType || (docType !== 'packing_list' && docType !== 'commercial_invoice')) {
      return NextResponse.json({ error: 'Invalid docType' }, { status: 400 })
    }
    if (!fileBase64 || !mimeType) {
      return NextResponse.json({ error: 'Missing file data' }, { status: 400 })
    }

    const label = DOC_LABELS[docType]
    const logs: string[] = []
    logs.push(`→ Reading ${label} (${mimeType})...`)

    const dataUrl = fileBase64.startsWith('data:')
      ? fileBase64
      : `data:${mimeType};base64,${fileBase64}`

    const parts: VisionPart[] = [
      { type: 'text', text: `Extract the customs fields from this ${label}. Pay special attention to quantity units and packing specifications.` },
      documentPart(dataUrl, mimeType, filename ?? `${docType}.${mimeType === 'application/pdf' ? 'pdf' : 'img'}`),
    ]

    logs.push('→ Running OCR + field extraction via vision model...')

    let parsed: Record<string, unknown>
    try {
      parsed = await chatVisionJSON<Record<string, unknown>>({
        system: SYSTEM_PROMPT,
        parts,
        maxTokens: 900,
      })
    } catch (err) {
      console.error('[documents/extract] model gateway error:', err)
      return NextResponse.json({ error: 'OCR service error' }, { status: 500 })
    }

    let packUnitKg = num(parsed.packUnitKg)
    const packingSpecRaw = str(parsed.packingSpecRaw)
    if (!packUnitKg && packingSpecRaw) {
      const m = packingSpecRaw.match(/(\d+(?:\.\d+)?)\s*(?:KG|KGS|KILO)/i)
      if (m) packUnitKg = parseFloat(m[1])
    }

    const extracted: ExtractedDoc = {
      docType,
      importer: str(parsed.importer),
      importerAddress: str(parsed.importerAddress),
      supplier: str(parsed.supplier),
      supplierAddress: str(parsed.supplierAddress),
      coo: str(parsed.coo),
      totalValue: num(parsed.totalValue),
      currency: str(parsed.currency),
      skuCount: num(parsed.skuCount),
      grossWeightKg: num(parsed.grossWeightKg),
      netWeightKg: num(parsed.netWeightKg),
      quantity: num(parsed.quantity),
      quantityUnit: normalizeUnit(str(parsed.quantityUnit)),
      packUnitKg,
      packUnitLabel: str(parsed.packUnitLabel),
      packingSpecRaw,
      productDescription: str(parsed.productDescription),
      portOfLoading: str(parsed.portOfLoading),
      portOfDischarge: str(parsed.portOfDischarge),
      incoterm: str(parsed.incoterm),
    }

    const unitHint = extracted.quantityUnit ? ` ${extracted.quantityUnit}` : ''
    const qtyHint = extracted.quantity != null ? `${extracted.quantity.toLocaleString()}${unitHint}` : '—'
    logs.push(`✓ ${label} parsed · qty ${qtyHint}${extracted.packUnitKg ? ` × ${extracted.packUnitKg} kg` : ''}`)

    return NextResponse.json({ extracted, logs })
  } catch (err) {
    console.error('[documents/extract]', err)
    return NextResponse.json({ error: 'Extraction failed' }, { status: 500 })
  }
}
