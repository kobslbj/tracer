'use client'

import { motion } from 'framer-motion'
import { ReconcileField } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Check, AlertTriangle, MinusCircle } from 'lucide-react'

const statusMeta = {
  ok: { icon: <Check className="h-3.5 w-3.5" />, cls: 'text-emerald-400', label: 'Matched' },
  missing: { icon: <MinusCircle className="h-3.5 w-3.5" />, cls: 'text-red-400', label: 'Missing' },
  mismatch: { icon: <AlertTriangle className="h-3.5 w-3.5" />, cls: 'text-amber-400', label: 'Mismatch' },
} as const

export function FieldTable({ fields }: { fields: ReconcileField[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/60 backdrop-blur-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-5 py-2.5 font-medium">Field</th>
            <th className="px-5 py-2.5 font-medium">Value</th>
            <th className="px-5 py-2.5 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f, i) => {
            const meta = statusMeta[f.status]
            return (
              <motion.tr
                key={f.key}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.04 }}
                className="border-b border-border/40 last:border-0"
              >
                <td className="px-5 py-3 text-muted-foreground">{f.label}</td>
                <td className={cn('px-5 py-3 font-medium', f.status === 'missing' ? 'text-muted-foreground/60' : 'text-foreground')}>
                  {f.value}
                </td>
                <td className="px-5 py-3">
                  <span className={cn('flex items-center justify-end gap-1.5 text-xs font-medium', meta.cls)}>
                    {meta.icon}
                    {meta.label}
                  </span>
                </td>
              </motion.tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
