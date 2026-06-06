import { insforge } from './insforge'
import { Entry } from './types'

// Map DB row (snake_case) → Entry (camelCase)
function rowToEntry(row: Record<string, unknown>): Entry {
  return {
    id: row.id as string,
    entryNo: row.entry_no as string,
    port: row.port as Entry['port'],
    productName: row.product_name as string,
    description: row.description as string,
    originCountry: row.origin_country as string,
    quantity: row.quantity as number,
    valueUsd: Number(row.value_usd),
    incoterm: row.incoterm as string,
    htsCode: row.hts_code as string,
    dutyRate: Number(row.duty_rate),
    estimatedDutyUsd: Number(row.estimated_duty_usd),
    riskLevel: row.risk_level as Entry['riskLevel'],
    reviewRequired: row.review_required as boolean,
    reviewReason: row.review_reason as string,
    status: row.status as Entry['status'],
    requiredDocs: row.required_docs as string[],
    explanation: row.explanation as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export async function fetchEntries(): Promise<Entry[]> {
  const { data, error } = await insforge.database
    .from('entries')
    .select('*')
    .order('created_at', { ascending: false })

  if (error || !data) return []
  return (data as Record<string, unknown>[]).map(rowToEntry)
}

export async function insertEntry(entry: Entry): Promise<void> {
  const { error } = await insforge.database.from('entries').insert([{
    id: entry.id,
    entry_no: entry.entryNo,
    port: entry.port,
    product_name: entry.productName,
    description: entry.description,
    origin_country: entry.originCountry,
    quantity: entry.quantity,
    value_usd: entry.valueUsd,
    incoterm: entry.incoterm,
    hts_code: entry.htsCode,
    duty_rate: entry.dutyRate,
    estimated_duty_usd: entry.estimatedDutyUsd,
    risk_level: entry.riskLevel,
    review_required: entry.reviewRequired,
    review_reason: entry.reviewReason,
    status: entry.status,
    required_docs: entry.requiredDocs,
    explanation: entry.explanation,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  }])
  if (error) throw error
}

export async function updateEntryStatus(id: string, status: Entry['status']): Promise<void> {
  await insforge.database
    .from('entries')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
}
