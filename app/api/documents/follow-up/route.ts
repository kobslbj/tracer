import { NextRequest, NextResponse } from 'next/server'
import { chatJSON } from '@/lib/ai'

interface FollowUpRequest {
  supplier: string
  importer: string
  product: string
  missingItems: string[]
}

const SYSTEM_PROMPT = `You draft professional supplier follow-up emails for customs brokers requesting missing shipment documents. Write a concise, polite email — not legal advice. Return JSON only:

{ "email": string }

Rules:
- Use tentative language: "may be needed", "please confirm", "we understand you may have already provided"
- Do NOT state that any document is legally required or mandatory
- Do NOT cite regulations (FSMA, APHIS, etc.)
- Include Subject line, greeting, list of items, and professional closing. Keep under 200 words.`

export async function POST(req: NextRequest) {
  try {
    const { supplier, importer, product, missingItems } = (await req.json()) as FollowUpRequest
    if (!missingItems?.length) {
      return NextResponse.json({ error: 'missingItems required' }, { status: 400 })
    }

    const result = await chatJSON<{ email?: string }>({
      system: SYSTEM_PROMPT,
      user: `Supplier: ${supplier}\nImporter: ${importer}\nProduct: ${product}\n\nItems to confirm or request:\n${missingItems.map(i => `- ${i}`).join('\n')}`,
      maxTokens: 400,
      temperature: 0.3,
    })

    return NextResponse.json({ email: result.email ?? '' })
  } catch (err) {
    console.error('[documents/follow-up]', err)
    return NextResponse.json({ error: 'Failed to generate email' }, { status: 500 })
  }
}
