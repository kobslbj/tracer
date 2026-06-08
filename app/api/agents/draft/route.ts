import { NextRequest, NextResponse } from 'next/server'
import { Entry, UploadedDocs } from '@/lib/types'

function generateEntryNo() {
  return `ENT-${Math.floor(49300 + Math.random() * 1000)}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      productName, description, htsCode, originCountry, port,
      quantity, valueUsd, incoterm,
      dutyRate, estimatedDutyUsd,
      riskLevel, reviewRequired, reviewReason, requiredDocs, explanation,
      uploadedDocs,
    } = body

    if (!htsCode || !productName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const logs: string[] = []
    logs.push('→ Compiling structured entry data...')
    logs.push('→ Generating CBP Form 3461 fields...')
    logs.push('→ Awaiting broker approval before filing...')

    const now = new Date().toISOString()
    const draft: Entry = {
      id: `ent-${Date.now()}`,
      entryNo: generateEntryNo(),
      port: port ?? 'LAX',
      productName,
      description: description ?? '',
      originCountry,
      quantity: quantity ?? 1,
      valueUsd,
      incoterm: incoterm ?? 'FOB',
      htsCode,
      dutyRate: dutyRate ?? 0,
      estimatedDutyUsd: estimatedDutyUsd ?? 0,
      riskLevel: riskLevel ?? 'Low',
      reviewRequired: reviewRequired ?? false,
      reviewReason: reviewReason ?? '',
      status: 'Draft' as const,
      requiredDocs: requiredDocs ?? [],
      explanation: explanation ?? '',
      uploadedDocs: (uploadedDocs as UploadedDocs) ?? undefined,
      createdAt: now,
      updatedAt: now,
    }

    logs.push('✓ Draft entry assembled · ready for review')
    return NextResponse.json({ draft, logs })
  } catch (err) {
    console.error('[agents/draft]', err)
    return NextResponse.json({ error: 'Draft assembly failed' }, { status: 500 })
  }
}
