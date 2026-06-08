import { NextRequest, NextResponse } from 'next/server'
import { chatVisionJSON, documentPart, VisionPart } from '@/lib/ai'
import { DocType, DOC_LABELS, ExtractedDoc } from '@/lib/types'

const SYSTEM_PROMPT = `You are a customs document OCR + extraction specialist. You are given a single shipping document (either a Packing List or a Commercial Invoice) as an image or PDF. Read it carefully and extract the fields below. Respond with valid JSON only — no markdown, no explanation.

Required JSON shape:
{
  "importer": string | null,        // importer / consignee / buyer / "ship to" company name
  "supplier": string | null,        // supplier / exporter / shipper / seller / manufacturer name
  "coo": string | null,             // country of origin (e.g. "China", "Taiwan"). null if not stated
  "totalValue": number | null,      // total monetary value as a plain number, no currency symbol or commas
  "currency": string | null,        // 3-letter ISO code (e.g. "USD"). null if not stated
  "skuCount": number | null,        // number of distinct line items / SKUs / part numbers
  "grossWeightKg": number | null,   // total gross weight converted to kilograms
  "quantity": number | null         // total quantity of units across all line items
}

Rules:
- Extract ONLY what is actually present in this document. Use null for any field the document does not contain — do NOT guess or infer.
- A Packing List usually has weights, SKU/carton counts and quantities but often NO monetary value or currency.
- A Commercial Invoice usually has values, currency, importer/supplier but often NO gross weight.
- Convert weights to kilograms (1 lb = 0.4536 kg) and return only the number.
- totalValue and quantity must be plain numbers (e.g. 4250, not "USD 4,250").`

interface ExtractRequest {
  docType: DocType
  fileBase64: string
  mimeType: string
  filename?: string
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
      { type: 'text', text: `Extract the customs fields from this ${label}.` },
      documentPart(dataUrl, mimeType, filename ?? `${docType}.${mimeType === 'application/pdf' ? 'pdf' : 'img'}`),
    ]

    logs.push('→ Running OCR + field extraction via vision model...')

    let parsed: Omit<ExtractedDoc, 'docType'>
    try {
      parsed = await chatVisionJSON<Omit<ExtractedDoc, 'docType'>>({
        system: SYSTEM_PROMPT,
        parts,
        maxTokens: 700,
      })
    } catch (err) {
      console.error('[documents/extract] model gateway error:', err)
      return NextResponse.json({ error: 'OCR service error' }, { status: 500 })
    }

    const extracted: ExtractedDoc = {
      docType,
      importer: parsed.importer ?? null,
      supplier: parsed.supplier ?? null,
      coo: parsed.coo ?? null,
      totalValue: typeof parsed.totalValue === 'number' ? parsed.totalValue : null,
      currency: parsed.currency ?? null,
      skuCount: typeof parsed.skuCount === 'number' ? parsed.skuCount : null,
      grossWeightKg: typeof parsed.grossWeightKg === 'number' ? parsed.grossWeightKg : null,
      quantity: typeof parsed.quantity === 'number' ? parsed.quantity : null,
    }

    const found = Object.entries(extracted)
      .filter(([k, v]) => k !== 'docType' && v !== null)
      .length
    logs.push(`✓ ${label} parsed · ${found} fields extracted`)

    return NextResponse.json({ extracted, logs })
  } catch (err) {
    console.error('[documents/extract]', err)
    return NextResponse.json({ error: 'Extraction failed' }, { status: 500 })
  }
}
