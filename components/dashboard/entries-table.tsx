'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Entry } from '@/lib/types'
import { StatusBadge, RiskBadge } from './status-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface EntriesTableProps {
  entries: Entry[]
  newEntryId?: string | null
  onRowClick?: (entry: Entry) => void
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export function EntriesTable({ entries, newEntryId, onRowClick }: EntriesTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/40 backdrop-blur-sm">
      <Table>
        <TableHeader>
          <TableRow className="border-border bg-muted/30 hover:bg-transparent">
            <TableHead className="text-muted-foreground font-medium">Entry No.</TableHead>
            <TableHead className="text-muted-foreground font-medium">Discharge Port</TableHead>
            <TableHead className="text-muted-foreground font-medium">Product</TableHead>
            <TableHead className="text-muted-foreground font-medium">HTS Code</TableHead>
            <TableHead className="text-muted-foreground font-medium">Value</TableHead>
            <TableHead className="text-muted-foreground font-medium">Duty Est.</TableHead>
            <TableHead className="text-muted-foreground font-medium">Risk</TableHead>
            <TableHead className="text-muted-foreground font-medium">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <AnimatePresence initial={false}>
            {entries.map(entry => (
              <motion.tr
                key={entry.id}
                layout
                initial={entry.id === newEntryId ? { opacity: 0, backgroundColor: 'oklch(0.25 0.12 160)' } : { opacity: 1 }}
                animate={{ opacity: 1, backgroundColor: 'oklch(0 0 0 / 0)' }}
                transition={{ duration: 0.8 }}
                className={`border-border transition-colors hover:bg-muted/30 ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(entry)}
              >
                <TableCell className="font-mono text-sm font-medium text-foreground">
                  {entry.entryNo}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate" title={entry.portOfDischarge ?? entry.port}>
                  {entry.portOfDischarge ?? entry.port}
                </TableCell>
                <TableCell className="text-sm text-foreground max-w-[180px] truncate">
                  {entry.productName}
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {entry.htsCode}
                </TableCell>
                <TableCell className="text-sm text-foreground">
                  {formatCurrency(entry.valueUsd)}
                </TableCell>
                <TableCell className="text-sm text-foreground">
                  {formatCurrency(entry.estimatedDutyUsd)}
                </TableCell>
                <TableCell>
                  <RiskBadge risk={entry.riskLevel} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={entry.status} />
                </TableCell>
              </motion.tr>
            ))}
          </AnimatePresence>
        </TableBody>
      </Table>
    </div>
  )
}
