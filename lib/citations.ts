import { IssueCitation, ReconcileIssue } from './types'

export const CITATION_SOURCE_LABELS: Record<IssueCitation['source'], string> = {
  commercial_invoice: 'Commercial Invoice',
  packing_list: 'Packing List',
  cross_document: 'Cross-document comparison',
  classification: 'Classification model',
  deterministic: 'Document reconciliation',
  upload_batch: 'Upload batch',
}

export function crossDocCitations(
  plValue: string | null | undefined,
  invValue: string | null | undefined,
  location: string,
): IssueCitation[] {
  const citations: IssueCitation[] = []
  if (invValue && invValue !== '—') {
    citations.push({ quote: invValue, source: 'commercial_invoice', location })
  }
  if (plValue && plValue !== '—') {
    citations.push({ quote: plValue, source: 'packing_list', location })
  }
  if (citations.length === 2) {
    citations.push({
      source: 'cross_document',
      location: `${location} — values differ between documents`,
    })
  }
  return citations
}

export function fieldCitation(
  quote: string | null | undefined,
  source: IssueCitation['source'],
  location: string,
): IssueCitation | null {
  if (!quote?.trim()) return null
  return { quote: quote.trim(), source, location }
}

export function issueCitations(issue: ReconcileIssue): IssueCitation[] {
  if (issue.citations?.length) return issue.citations

  if (issue.packingListValue !== undefined || issue.invoiceValue !== undefined) {
    return crossDocCitations(
      issue.packingListValue,
      issue.invoiceValue,
      issue.field,
    )
  }

  if (issue.evidence?.length) {
    return issue.evidence.map(line => ({
      quote: line,
      source: issue.code.startsWith('regulatory_') ? 'commercial_invoice' : 'deterministic',
      location: 'Extracted field',
    }))
  }

  return []
}

export interface RegulatoryFlagInput {
  title: string
  citations?: { quote: string; source: 'commercial_invoice' | 'packing_list'; location?: string }[]
  confidence?: 'medium' | 'needs_review'
}

/** Suppress weak regulatory flags — AI restraint / alert fatigue reduction. */
export function shouldEmitRegulatoryFlag(flag: RegulatoryFlagInput): boolean {
  if (!flag.title?.trim()) return false
  const citations = flag.citations ?? []
  if (citations.length === 0) return false
  const withQuote = citations.filter(c => c.quote?.trim().length >= 8)
  if (withQuote.length === 0) return false
  if (flag.confidence === 'needs_review' && withQuote.length < 2) return false
  const vague = /^(possible|may|might|consider)/i.test(flag.title)
  if (vague) return false
  return true
}

export function addressMismatchMessage(field: 'importer' | 'supplier'): {
  message: string
  analystNote: string
} {
  const party = field === 'importer' ? 'Importer' : 'Supplier'
  return {
    message: `${party} address mismatch detected`,
    analystNote: 'Likely OCR variance or outdated supplier template — confirm which address is current before filing.',
  }
}
