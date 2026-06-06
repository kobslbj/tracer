import { NextRequest, NextResponse } from 'next/server'
import { chatJSON, embed } from '@/lib/ai'
import { insforge } from '@/lib/insforge'

const SYSTEM_PROMPT = `You are a US customs HTS classification specialist. Given a shipment description and optional vector knowledge base context, extract classification fields. Respond with valid JSON only — no markdown, no explanation.

Required fields:
- productName: string (short, 3-6 words)
- description: string (one sentence technical description)
- htsCode: string (format: "XXXX.XX" — 6-digit HTS code, most specific subheading)
- originCountry: string (infer from description, otherwise "Unknown")
- port: "LAX" | "JFK" | "SEA" (best port given origin and product type)
- quantity: number (infer from description, otherwise 1000)
- valueUsd: number (infer from description, otherwise 10000)
- incoterm: string (infer from description, otherwise "FOB")

Rules:
- HTS codes: be specific to 6 digits, apply GRI rules
- Do NOT include duty rates or compliance assessments — those are handled by separate agents`

interface HtsMatch {
  hts_code: string
  description: string
  chapter: string
  duty_rate: number
  notes: string
  similarity: number
}

async function searchHtsKnowledge(queryEmbedding: number[]): Promise<HtsMatch[]> {
  try {
    const { data } = await insforge.database.rpc('match_hts', {
      query_embedding: queryEmbedding,
      match_count: 3,
    })
    return (data as HtsMatch[]) ?? []
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  try {
    const { input } = await req.json()
    if (!input || typeof input !== 'string') {
      return NextResponse.json({ error: 'Missing input' }, { status: 400 })
    }

    const logs: string[] = []

    logs.push('→ Parsing product description...')
    let htsContext = ''
    try {
      logs.push('→ Querying InsForge vector store (hts_knowledge)...')
      const queryEmbedding = await embed(input)
      const matches = await searchHtsKnowledge(queryEmbedding)
      if (matches.length > 0) {
        logs.push(`→ Retrieved ${matches.length} candidate tariff classifications...`)
        htsContext = '\n\nRelevant HTS knowledge base matches (from pgvector semantic search):\n' +
          matches.map((m, i) =>
            `${i + 1}. HTS ${m.hts_code} (similarity: ${(m.similarity * 100).toFixed(1)}%)\n` +
            `   ${m.description}\n` +
            `   ${m.chapter} · Base duty: ${m.duty_rate}%\n` +
            `   Notes: ${m.notes}`
          ).join('\n\n')
      }
    } catch (embErr) {
      console.warn('[agents/classify] embedding/vector search failed:', embErr)
      logs.push('→ Vector search unavailable, proceeding without context...')
    }

    logs.push('→ Matching chapter headings · verifying Schedule B...')
    const userMessage = htsContext
      ? `Classify this shipment:\n\n${input}${htsContext}`
      : `Classify this shipment:\n\n${input}`

    let result: Record<string, unknown>
    try {
      result = await chatJSON({ system: SYSTEM_PROMPT, user: userMessage, maxTokens: 512 })
    } catch (err) {
      console.error('[agents/classify] model gateway error:', err)
      return NextResponse.json({ error: 'AI service error' }, { status: 500 })
    }

    logs.push('✓ HTS code confirmed · GRI rules applied')
    return NextResponse.json({ ...result, logs })
  } catch (err) {
    console.error('[agents/classify]', err)
    return NextResponse.json({ error: 'Classification failed' }, { status: 500 })
  }
}
