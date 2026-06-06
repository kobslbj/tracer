'use client'

import { Entry } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

interface EntryDraftCardProps {
  entry: Entry
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground font-mono">{value}</span>
    </div>
  )
}

export function EntryDraftCard({ entry }: EntryDraftCardProps) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">Entry Draft</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <Row label="Entry No." value={entry.entryNo} />
        <Row label="Port" value={entry.port} />
        <Row label="Product" value={entry.productName} />
        <Row label="Origin" value={entry.originCountry} />
        <Separator className="my-2 bg-border" />
        <Row label="HTS Code" value={entry.htsCode} />
        <Row label="Duty Rate" value={`${entry.dutyRate}%`} />
        <Row label="Incoterm" value={entry.incoterm} />
        <Row label="Value (USD)" value={`$${entry.valueUsd.toLocaleString()}`} />
        <Row label="Quantity" value={entry.quantity.toLocaleString()} />
        <Separator className="my-2 bg-border" />
        <Row label="Estimated Duty" value={`$${entry.estimatedDutyUsd.toLocaleString()}`} />
      </CardContent>
    </Card>
  )
}
