import { ClassificationResult } from './types'
import { mockClassifierResponses } from './mock-data'

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function classifyShipment(input: string): Promise<ClassificationResult> {
  await delay(400 + Math.random() * 200)

  const lower = input.toLowerCase()

  for (const [pattern, result] of Object.entries(mockClassifierResponses)) {
    const keywords = pattern.split('|')
    if (keywords.some(kw => lower.includes(kw))) {
      return { ...result }
    }
  }

  // Generic fallback
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
