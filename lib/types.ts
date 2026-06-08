export type EntryStatus = 'Draft' | 'Review' | 'Filing' | 'Cleared'
export type RiskLevel = 'Low' | 'Medium' | 'High'
export type AgentPhase = 'idle' | 'running' | 'complete' | 'error'

export interface Entry {
  id: string
  entryNo: string
  port: 'LAX' | 'JFK' | 'SEA'
  productName: string
  description: string
  originCountry: string
  quantity: number
  valueUsd: number
  incoterm: string
  htsCode: string
  dutyRate: number
  estimatedDutyUsd: number
  riskLevel: RiskLevel
  reviewRequired: boolean
  reviewReason: string
  status: EntryStatus
  requiredDocs: string[]
  explanation: string
  createdAt: string
  updatedAt: string
}

export interface AgentStatus {
  hts: AgentPhase
  duty: AgentPhase
  compliance: AgentPhase
  entry: AgentPhase
}

// ── Document OCR + reconciliation ────────────────────────────────────────────

export type DocType = 'packing_list' | 'commercial_invoice'

export const DOC_LABELS: Record<DocType, string> = {
  packing_list: 'Packing List',
  commercial_invoice: 'Commercial Invoice',
}

// Fields extracted from a single uploaded document. Anything the model cannot
// find in that document is null so reconciliation can flag it as missing.
export interface ExtractedDoc {
  docType: DocType
  importer: string | null
  supplier: string | null
  coo: string | null
  totalValue: number | null
  currency: string | null
  skuCount: number | null
  grossWeightKg: number | null
  quantity: number | null
}

export type IssueSeverity = 'error' | 'warning'

export interface ReconcileIssue {
  code: string
  field: string
  severity: IssueSeverity
  message: string
  packingListValue?: string
  invoiceValue?: string
}

export type FieldStatus = 'ok' | 'missing' | 'mismatch'

export interface ReconcileField {
  key: string
  label: string
  value: string
  status: FieldStatus
}

export interface ReconcileResult {
  fields: ReconcileField[]
  issues: ReconcileIssue[]
}

// Metadata for the two files persisted to InsForge Storage.
export interface DocFileMeta {
  packingListKey?: string
  packingListUrl?: string
  invoiceKey?: string
  invoiceUrl?: string
}

export interface ClassificationResult {
  productName: string
  htsCode: string
  dutyRate: number
  riskLevel: RiskLevel
  reviewRequired: boolean
  reviewReason: string
  requiredDocs: string[]
  explanation: string
  port: 'LAX' | 'JFK' | 'SEA'
  originCountry: string
  quantity: number
  valueUsd: number
  incoterm: string
  description: string
}
