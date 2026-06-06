import { ClassificationResult } from './types'
import { mockClassifierResponses } from './mock-data'

// Calls the real AI API route; falls back to keyword mock if unavailable
export async function classifyShipment(input: string): Promise<ClassificationResult> {
  try {
    const res = await fetch('/api/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    })

    if (!res.ok) throw new Error(`API ${res.status}`)

    const result: ClassificationResult = await res.json()
    return result
  } catch (err) {
    console.warn('[classifyShipment] AI API failed, falling back to mock:', err)
    return fallbackClassify(input)
  }
}

function fallbackClassify(input: string): ClassificationResult {
  const lower = input.toLowerCase()

  for (const [pattern, result] of Object.entries(mockClassifierResponses)) {
    const keywords = pattern.split('|')
    if (keywords.some(kw => lower.includes(kw))) {
      return { ...result }
    }
  }

  return {
    productName: 'General Merchandise',
    htsCode: '9999.00',
    dutyRate: 5.0,
    riskLevel: 'Low',
    reviewRequired: false,
    reviewReason: '',
    requiredDocs: ['Commercial Invoice', 'Packing List', 'Bill of Lading'],
    explanation: 'General classification applied. Manual review recommended for accurate HTS classification.',
    port: 'LAX',
    originCountry: 'Unknown',
    quantity: 1000,
    valueUsd: 10000,
    incoterm: 'FOB',
    description: input,
  }
}
