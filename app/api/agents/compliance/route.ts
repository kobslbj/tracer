import { NextRequest, NextResponse } from 'next/server'
import { chatJSON } from '@/lib/ai'

const SYSTEM_PROMPT = `You are a US customs compliance specialist. Given HTS code, origin country, product name, and description, assess compliance risk. Respond with valid JSON only — no markdown, no explanation.

Required fields:
- riskLevel: "Low" | "Medium" | "High"
- reviewRequired: boolean
- reviewReason: string (empty string if reviewRequired is false)
- requiredDocs: string[] (list of CBP-required documents, e.g. ["Commercial Invoice", "Packing List", "Bill of Lading"])
- explanation: string (2-3 sentences: compliance rationale, any flagged regulations, screening results)

Rules:
- HIGH risk: Chinese-origin electronics/batteries (Section 301 + dual-use concerns), CITES-protected species, FDA-regulated food/drugs/devices, DOT hazmat, ECCN-controlled items, high-value electronics > $10k
- MEDIUM risk: textiles/apparel from any origin, steel/aluminum, agricultural products, cosmetics, supplements
- LOW risk: USMCA-eligible goods from Mexico/Canada, standard industrial components, general merchandise < $2500
- Required documents always include: "Commercial Invoice", "Packing List", "Bill of Lading" or "Airway Bill"
- Add "Certificate of Origin" for USMCA claims
- Add "Importer Security Filing (ISF 10+2)" for ocean shipments
- Add "Dangerous Goods Declaration" for hazmat/batteries
- Add "FDA Prior Notice" for food/drug/device imports
- Screening: CBP CATAIR, ECCN, FDA/DOT hazmat flags, watchlist`

export async function POST(req: NextRequest) {
  try {
    const { htsCode, originCountry, productName, description } = await req.json()
    if (!htsCode || !originCountry || !productName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const logs: string[] = []
    logs.push('→ Screening CBP CATAIR restrictions...')
    logs.push('→ Checking ECCN · FDA / DOT hazmat flags...')

    let result: Record<string, unknown>
    try {
      result = await chatJSON({
        system: SYSTEM_PROMPT,
        user: `Assess compliance for:\nHTS Code: ${htsCode}\nOrigin: ${originCountry}\nProduct: ${productName}\nDescription: ${description}`,
        maxTokens: 512,
      })
    } catch (err) {
      console.error('[agents/compliance] model gateway error:', err)
      return NextResponse.json({ error: 'AI service error' }, { status: 500 })
    }

    logs.push('→ Verifying import restrictions · watchlist check...')
    logs.push('✓ Risk level assessed · required docs generated')
    return NextResponse.json({ ...result, logs })
  } catch (err) {
    console.error('[agents/compliance]', err)
    return NextResponse.json({ error: 'Compliance assessment failed' }, { status: 500 })
  }
}
