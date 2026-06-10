/**
 * Layer 1 — deterministic product-category → agency / commonly-missing patterns.
 * Hand-curated operational knowledge, not legal advice.
 */

export interface RequirementPattern {
  category: string
  agencies: string[]
  commonlyMissing: string[]
}

const PATTERNS: { keywords: RegExp; pattern: RequirementPattern }[] = [
  {
    keywords: /cashew|nut|almond|walnut|peanut|food|edible|snack|grain|rice|spice|coffee|tea|chocolate|candy/i,
    pattern: {
      category: 'food',
      agencies: ['FDA'],
      commonlyMissing: ['Certificate of Origin', 'FDA prior notice'],
    },
  },
  {
    keywords: /fruit|vegetable|plant|seed|agricultur|timber|wood|phytosanitary|livestock|animal/i,
    pattern: {
      category: 'agriculture',
      agencies: ['APHIS', 'FDA'],
      commonlyMissing: ['Phytosanitary certificate', 'Certificate of Origin'],
    },
  },
  {
    keywords: /electronic|bluetooth|wireless|radio|rf |router|phone|tablet|speaker|charger|circuit/i,
    pattern: {
      category: 'electronics',
      agencies: ['FCC'],
      commonlyMissing: ['FCC declaration', 'Certificate of Origin'],
    },
  },
  {
    keywords: /textile|garment|apparel|fabric|cotton|polyester|knit|woven|shirt|dress/i,
    pattern: {
      category: 'textiles',
      agencies: ['CBP'],
      commonlyMissing: ['Certificate of Origin', 'Manufacturer declaration'],
    },
  },
]

export function matchRequirementPattern(productDescription: string | null | undefined): RequirementPattern | null {
  if (!productDescription?.trim()) return null
  for (const { keywords, pattern } of PATTERNS) {
    if (keywords.test(productDescription)) return pattern
  }
  return null
}
