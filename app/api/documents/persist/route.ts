import { NextRequest, NextResponse } from 'next/server'
import { insforgeAdmin } from '@/lib/insforge-admin'
import { ExtractedDoc, ReconcileResult, DocFileMeta } from '@/lib/types'

function pick<T>(a: T | null, b: T | null): T | null {
  return a !== null && a !== undefined ? a : b
}

interface PersistRequest {
  packingList: ExtractedDoc
  invoice: ExtractedDoc
  result: ReconcileResult
  files: DocFileMeta
}

export async function POST(req: NextRequest) {
  try {
    const { packingList, invoice, result, files } = (await req.json()) as PersistRequest
    if (!packingList || !invoice || !result) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data, error } = await insforgeAdmin.database.from('document_sets').insert([{
      importer: pick(invoice.importer, packingList.importer),
      supplier: pick(invoice.supplier, packingList.supplier),
      coo: pick(packingList.coo, invoice.coo),
      total_value: pick(invoice.totalValue, packingList.totalValue),
      currency: pick(invoice.currency, packingList.currency),
      sku_count: pick(packingList.skuCount, invoice.skuCount),
      gross_weight_kg: pick(packingList.grossWeightKg, invoice.grossWeightKg),
      quantity: pick(packingList.quantity, invoice.quantity),
      issues: result.issues,
      packing_list_key: files?.packingListKey ?? null,
      packing_list_url: files?.packingListUrl ?? null,
      invoice_key: files?.invoiceKey ?? null,
      invoice_url: files?.invoiceUrl ?? null,
    }]).select()

    if (error) {
      console.error('[documents/persist] db error:', error)
      return NextResponse.json({ error: error.message ?? 'Database insert failed' }, { status: 500 })
    }

    const id = (data?.[0] as { id?: string })?.id ?? null
    return NextResponse.json({
      id,
      logs: ['✓ Saved reconciliation to InsForge (document_sets)'],
    })
  } catch (err) {
    console.error('[documents/persist]', err)
    return NextResponse.json({ error: 'Persist failed' }, { status: 500 })
  }
}
