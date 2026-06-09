/** Pipeline-only status for in-progress drafts — not shown in review queue. */
export type DraftStatus = 'Draft'

/** Actively-worked inbox queues — not mutually exclusive with tags. */
export type PrimaryQueue =
  | 'needs_attention'
  | 'waiting_on_docs'
  | 'ready_for_review'

/** Resolved outcome — not an active queue tab. */
export type ResolutionStatus = 'ready_to_submit'

export type EntryStatus = DraftStatus | PrimaryQueue | ResolutionStatus

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
  reviewSnapshot?: EntryReviewSnapshot
  /** Prior review snapshots for delta continuity (newest first). */
  reviewHistory?: ReviewSnapshotRecord[]
  /** Operational timeline — coordination memory (newest first). */
  timeline?: ShipmentTimelineEvent[]
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
  /** Street address under Messrs / buyer — exclude TEL/FAX. */
  importerAddress: string | null
  supplier: string | null
  /** Street address under document header issuer — exclude TEL/FAX. */
  supplierAddress: string | null
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

export type IssueConfidence = 'high' | 'medium' | 'needs_review'

export type CitationSource =
  | 'commercial_invoice'
  | 'packing_list'
  | 'cross_document'
  | 'classification'
  | 'deterministic'
  | 'upload_batch'

export interface IssueCitation {
  quote?: string
  source: CitationSource
  location?: string
}

export interface ReconcileIssue {
  code: string
  field: string
  severity: IssueSeverity
  message: string
  confidence?: IssueConfidence
  /** Legacy evidence strings — prefer citations when available. */
  evidence?: string[]
  /** Source-linked reasoning for broker verification. */
  citations?: IssueCitation[]
  /** Analyst-style note for high-signal mismatches. */
  analystNote?: string
  packingListValue?: string
  invoiceValue?: string
}

export type FilabilityStatus = 'ready' | 'review_recommended' | 'blocking'

export interface ShipmentReviewSummary {
  filability: FilabilityStatus
  headline: string
  subline: string
  overallConfidence: IssueConfidence
}

export interface MissingReviewItem {
  label: string
  message: string
  confidence: IssueConfidence
}

/** Denormalized review intelligence persisted at save time. */
export interface EntryReviewSnapshot {
  filability: FilabilityStatus
  missingItems: MissingReviewItem[]
  agencyFlags: string[]
  flagReasons: string[]
  suggestedActions: string[]
  htsConfidence?: IssueConfidence
  issues: ReconcileIssue[]
  /** When this snapshot was recorded. */
  recordedAt?: string
  /** Changes since the prior review pass — memory continuity for ops. */
  delta?: ReviewDelta
}

export interface ReviewDeltaItem {
  key: string
  label: string
}

export interface ReviewDelta {
  resolved: ReviewDeltaItem[]
  stillPending: ReviewDeltaItem[]
  newlyDetected: ReviewDeltaItem[]
  comparedAt: string
  previousReviewAt?: string
}

/** Prior review passes — newest first, delta stripped. */
export interface ReviewSnapshotRecord {
  snapshot: EntryReviewSnapshot
  recordedAt: string
}

export type ShipmentEventType =
  | 'document_uploaded'
  | 'review_completed'
  | 'issue_resolved'
  | 'followup_drafted'
  | 'followup_sent'
  | 'supplier_replied'
  | 'broker_verified'
  | 'filing_ready'

export type ShipmentEventActor = 'ai' | 'broker' | 'supplier'

export interface ShipmentTimelineEvent {
  id: string
  type: ShipmentEventType
  actor: ShipmentEventActor
  summary: string
  /** ISO date — supplier promised document/action by this date */
  promisedBy?: string
  relatedItems?: string[]
  createdAt: string
}

/** Dashboard table row derived from entry + snapshot. */
export interface TriageRow {
  entryId: string
  shipment: string
  primaryStatus: PrimaryQueue | null
  tags: string[]
  actionNeeded: string
  isResolved: boolean
  coordinationLine?: string | null
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

export type OptionalDocType = 'spec_sheet' | 'product_image'

export const OPTIONAL_DOC_LABELS: Record<OptionalDocType, string> = {
  spec_sheet: 'Spec Sheet',
  product_image: 'Product Image',
}

// Metadata for files persisted to InsForge Storage.
export interface DocFileMeta {
  packingListKey?: string
  packingListUrl?: string
  invoiceKey?: string
  invoiceUrl?: string
  specSheetKey?: string
  specSheetUrl?: string
  productImageKey?: string
  productImageUrl?: string
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
