export type EntryStatus = 'Draft' | 'Review' | 'Filing' | 'Cleared'
export type RiskLevel = 'Low' | 'Medium' | 'High'
export type AgentPhase = 'idle' | 'running' | 'complete' | 'error'

/** URLs of user-uploaded source documents linked to an entry. */
export interface UploadedDocs {
  packingListUrl?: string
  packingListKey?: string
  commercialInvoiceUrl?: string
  commercialInvoiceKey?: string
}

export interface Entry {
  id: string
  entryNo: string
  /** US CBP port of entry code (LAX/JFK/SEA) — used for duty/filing logic. */
  port: 'LAX' | 'JFK' | 'SEA'
  /** Destination / discharge port from shipping documents (e.g. "Kaohsiung, Taiwan"). */
  portOfDischarge?: string
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
  uploadedDocs?: UploadedDocs
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
  /** Explicit COO field if printed — may be absent or wrong; reconcile layer re-validates. */
  coo: string | null
  totalValue: number | null
  currency: string | null
  skuCount: number | null
  grossWeightKg: number | null
  netWeightKg: number | null
  /** Raw quantity number as printed (e.g. 2880 or 72). */
  quantity: number | null
  /** Business unit: BAG, MT, KG, PCS, CTN, PKG, etc. Never assume unit from context. */
  quantityUnit: string | null
  /** Per-unit net weight in kg from packing spec (e.g. 25 from "25 KG / PP Bag"). */
  packUnitKg: number | null
  /** Per-unit label from packing spec (e.g. "PP Bag", "CTN"). */
  packUnitLabel: string | null
  /** Verbatim packing line (e.g. "1.00 * 25.00 KG / PP Bag"). */
  packingSpecRaw: string | null
  productDescription: string | null
  portOfLoading: string | null
  portOfDischarge: string | null
  incoterm: string | null
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
