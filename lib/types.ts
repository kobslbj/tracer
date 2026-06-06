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
