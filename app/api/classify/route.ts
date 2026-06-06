import { NextRequest, NextResponse } from 'next/server'
import { ClassificationResult } from '@/lib/types'
import { embed } from '@/lib/embeddings'
import { insforge } from '@/lib/insforge'

const SYSTEM_PROMPT = `You are an expert US customs broker and HTS classification specialist with 20 years of experience.

Given a natural language shipment description and optional context from a vector knowledge base, classify the shipment. You MUST respond with valid JSON only — no markdown, no explanation, just the raw JSON object.

Required fields:
- productName: string (short product name, 3-6 words)
- description: string (one sentence technical description)
- htsCode: string (format: "XXXX.XX" — 6-digit HTS code, most specific subheading)
- dutyRate: number (base duty rate as percentage, e.g. 5.0)
- riskLevel: "Low" | "Medium" | "High"
- reviewRequired: boolean
- reviewReason: string (empty string if reviewRequired is false)
- requiredDocs: string[] (list of CBP-required documents)
- explanation: string (2-3 sentences: classification rationale, HTS chapter, any Section 301 / USMCA / GSP applicability)
- port: "LAX" | "JFK" | "SEA" (best port given origin and product type)
- originCountry: string (infer from description, otherwise "Unknown")
- quantity: number (infer from description, otherwise 1000)
- valueUsd: number (infer from description, otherwise 10000)
- incoterm: string (infer from description, otherwise "FOB")

Rules:
- HTS codes: be specific to 6 digits, apply GRI rules
- Section 301 China tariffs: flag for Chinese-origin goods (adds 7.5-25% on top of base duty)
- USMCA: eligible for Mexico/Canada origin goods
- Risk HIGH: hazmat, CITES, dual-use, Section 301, FDA-regulated items, high-value electronics from China
- Risk MEDIUM: textiles, apparel, steel/aluminum, agricultural goods
- Risk LOW: standard industrial goods, USMCA-eligible, low-value general merchandise`

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

    // Step 1: embed the query and search vector knowledge base
    let htsContext = ''
    try {
      const queryEmbedding = await embed(input)
      const matches = await searchHtsKnowledge(queryEmbedding)

      if (matches.length > 0) {
        htsContext = '\n\nRelevant HTS knowledge base matches (from pgvector semantic search):\n' +
          matches.map((m, i) =>
            `${i + 1}. HTS ${m.hts_code} (similarity: ${(m.similarity * 100).toFixed(1)}%)\n` +
            `   ${m.description}\n` +
            `   ${m.chapter} · Base duty: ${m.duty_rate}%\n` +
            `   Notes: ${m.notes}`
          ).join('\n\n')
      }
    } catch (embErr) {
      console.warn('[classify] embedding/vector search failed, proceeding without context:', embErr)
    }

    // Step 2: classify with Claude, optionally augmented by RAG context
    const userMessage = htsContext
      ? `Classify this shipment:\n\n${input}${htsContext}`
      : `Classify this shipment:\n\n${input}`

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
          { role: 'user', content: userMessage },
        ],
        max_tokens: 1024,
        temperature: 0.1,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('[classify] OpenRouter error:', response.status, errText)
      return NextResponse.json({ error: 'AI service error' }, { status: 500 })
    }

    const data = await response.json()
    const text: string = data.choices?.[0]?.message?.content ?? ''
    const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()

    let result: ClassificationResult
    try {
      result = JSON.parse(cleaned)
    } catch {
      console.error('[classify] JSON parse failed:', cleaned)
      return NextResponse.json({ error: 'Failed to parse AI response', raw: text }, { status: 500 })
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[classify]', err)
    return NextResponse.json({ error: 'Classification failed' }, { status: 500 })
  }
}
