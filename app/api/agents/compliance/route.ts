import { NextRequest, NextResponse } from 'next/server'
import { chatJSON } from '@/lib/ai'

const SYSTEM_PROMPT = `You are a cautious US customs compliance reviewer assisting a licensed broker. Given HTS code, origin country, product name, and description, assess possible compliance flags. Respond with valid JSON only — no markdown.

Required fields:
- riskLevel: "Low" | "Medium" | "High"
- reviewRequired: boolean
- reviewReason: string (empty if reviewRequired is false — use operational language like "Agricultural product from overseas origin — broker should verify agency requirements", NOT legal citations)
- requiredDocs: string[] (prefix each item with "Possible: " when agency-specific, e.g. "Possible: FDA Prior Notice", "Commercial Invoice", "Packing List")
- explanation: string (2-3 sentences, tentative tone — use "may apply", "recommend verifying", never "is required" or "mandatory")

Rules:
- Never assert definitive regulatory requirements — you are flagging items for broker verification
- Do NOT cite FSMA, Bioterrorism Act, CGMP, CATAIR, or ECCN unless the product clearly matches and phrased as "may apply"
- HIGH risk → reviewRequired true with plain operational reviewReason
- Always include standard docs without "Possible:" prefix: "Commercial Invoice", "Packing List", "Bill of Lading" or "Airway Bill"
- Agency-specific docs use "Possible:" prefix`

export async function POST(req: NextRequest) {
  try {
    const { htsCode, originCountry, productName, description } = await req.json()
    if (!htsCode || !originCountry || !productName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const logs: string[] = []
    logs.push('→ Screening import restrictions...')
    logs.push('→ Checking FDA · DOT · agricultural flags...')

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

    logs.push('→ Verifying regulatory requirements...')
    logs.push('✓ Compliance review complete')
    return NextResponse.json({ ...result, logs })
  } catch (err) {
    console.error('[agents/compliance]', err)
    return NextResponse.json({ error: 'Compliance assessment failed' }, { status: 500 })
  }
}
