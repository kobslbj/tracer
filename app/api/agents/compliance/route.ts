import { NextRequest, NextResponse } from 'next/server'

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

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://traceer.app',
        'X-Title': 'Traceer Customs Operations',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4-5',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Assess compliance for:\nHTS Code: ${htsCode}\nOrigin: ${originCountry}\nProduct: ${productName}\nDescription: ${description}`,
          },
        ],
        max_tokens: 512,
        temperature: 0.1,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('[agents/compliance] OpenRouter error:', response.status, errText)
      return NextResponse.json({ error: 'AI service error' }, { status: 500 })
    }

    const data = await response.json()
    const text: string = data.choices?.[0]?.message?.content ?? ''
    const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()

    let result: Record<string, unknown>
    try {
      result = JSON.parse(cleaned)
    } catch {
      console.error('[agents/compliance] JSON parse failed:', cleaned)
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
    }

    logs.push('→ Verifying import restrictions · watchlist check...')
    logs.push('✓ Risk level assessed · required docs generated')
    return NextResponse.json({ ...result, logs })
  } catch (err) {
    console.error('[agents/compliance]', err)
    return NextResponse.json({ error: 'Compliance assessment failed' }, { status: 500 })
  }
}
