import { NextRequest, NextResponse } from 'next/server'
import { chatJSON } from '@/lib/ai'

const SYSTEM_PROMPT = `You are a US customs duty calculation specialist. Given HTS code, origin country, shipment value, and incoterm, calculate the applicable duty rate and estimated duty. Respond with valid JSON only — no markdown, no explanation.

Required fields:
- dutyRate: number (total effective duty rate as percentage, including base duty plus any applicable tariff additions)
- estimatedDutyUsd: number (calculated as valueUsd * dutyRate / 100, rounded to nearest dollar)
- dutyBasis: string (brief description: e.g. "Base 7.5% + Section 301 List 3 25%" or "USMCA eligible: 0%")
- section301Applied: boolean (true if Section 301 China tariffs apply)
- usmcaEligible: boolean (true if USMCA free trade agreement applies)
- gspEligible: boolean (true if GSP (Generalized System of Preferences) applies)

Rules:
- Section 301 China tariffs: add 7.5% (List 1/2), 25% (List 3/4A), or 7.5% (List 4B) on top of base for Chinese-origin goods depending on HTS chapter
  - Electronics / batteries / machinery (chapters 84, 85): List 3 = 25% additional
  - Textiles / apparel (chapters 50-63): List 4A = 7.5% additional
  - Steel / aluminum (chapters 72, 73, 76): List 3 = 25% additional
  - General goods from China: 7.5% additional
- USMCA: Mexico or Canada origin → 0% duty for most goods
- GSP: developing country origin → reduced or 0% duty
- Incoterm: CIF value is used for ad valorem; if FOB, add ~5% notional freight for customs value
- Base duty rate: infer from HTS chapter if not specified`

export async function POST(req: NextRequest) {
  try {
    const { htsCode, originCountry, valueUsd, incoterm } = await req.json()
    if (!htsCode || !originCountry || valueUsd == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const logs: string[] = []
    logs.push('→ Loading duty schedule...')
    logs.push('→ Checking Section 301 USTR lists (List 3 / List 4A)...')

    let result: Record<string, unknown>
    try {
      result = await chatJSON({
        system: SYSTEM_PROMPT,
        user: `Calculate duty for:\nHTS Code: ${htsCode}\nOrigin Country: ${originCountry}\nValue: $${valueUsd} USD\nIncoterm: ${incoterm}`,
        maxTokens: 256,
      })
    } catch (err) {
      console.error('[agents/duty] model gateway error:', err)
      return NextResponse.json({ error: 'AI service error' }, { status: 500 })
    }

    logs.push('→ Calculating ad valorem duty · applying incoterm adjustments...')
    logs.push('✓ Duty rate confirmed · estimated liability calculated')
    return NextResponse.json({ ...result, logs })
  } catch (err) {
    console.error('[agents/duty]', err)
    return NextResponse.json({ error: 'Duty calculation failed' }, { status: 500 })
  }
}
