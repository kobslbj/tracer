'use client'

import { SupplierProfile, ResponsivenessGrade, formatReplyTime } from '@/lib/supplier-profile'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Building2, Clock, Handshake, Mail, FileWarning } from 'lucide-react'

interface SupplierProfilePanelProps {
  profile: SupplierProfile | null
  supplierName: string
  className?: string
}

const GRADE_STYLES: Record<ResponsivenessGrade, { label: string; className: string }> = {
  fast: { label: 'Fast replier', className: 'border-emerald-800/50 bg-emerald-950/30 text-emerald-400' },
  moderate: { label: 'Moderate replier', className: 'border-amber-800/50 bg-amber-950/30 text-amber-400' },
  slow: { label: 'Slow replier', className: 'border-red-800/50 bg-red-950/30 text-red-400' },
  unknown: { label: 'No reply history', className: 'border-border bg-muted/20 text-muted-foreground' },
}

export function SupplierProfilePanel({ profile, supplierName, className }: SupplierProfilePanelProps) {
  if (!supplierName.trim()) return null

  const hasHistory =
    profile !== null &&
    (profile.shipmentCount > 1 ||
      profile.replySampleCount > 0 ||
      profile.promisesKept + profile.promisesBroken + profile.promisesPending > 0)

  return (
    <div className={cn('rounded-lg border border-border bg-card/40 px-3 py-2.5', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Supplier history
        </p>
        {hasHistory && (
          <Badge variant="outline" className={cn('text-[10px] font-normal', GRADE_STYLES[profile.grade].className)}>
            {GRADE_STYLES[profile.grade].label}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-foreground">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        <span className="font-medium">{profile?.supplierName || supplierName}</span>
      </div>

      {!hasHistory ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          First shipment from this supplier — no history yet.
        </p>
      ) : (
        <div className="mt-2 space-y-1.5">
          <p className="text-[11px] text-muted-foreground">
            {profile.shipmentCount} shipment{profile.shipmentCount === 1 ? '' : 's'} on record
          </p>

          {profile.avgReplyHours !== null && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>
                Avg reply: <span className="text-foreground/90">{formatReplyTime(profile.avgReplyHours)}</span>
                {' '}({profile.replySampleCount} repl{profile.replySampleCount === 1 ? 'y' : 'ies'})
              </span>
            </div>
          )}

          {profile.promisesKept + profile.promisesBroken > 0 && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Handshake className="h-3.5 w-3.5 shrink-0" />
              <span>
                Promises:{' '}
                <span className="text-emerald-400/90">{profile.promisesKept} kept</span>
                {' / '}
                <span className={profile.promisesBroken > 0 ? 'text-red-400/90' : 'text-muted-foreground'}>
                  {profile.promisesBroken} broken
                </span>
              </span>
            </div>
          )}

          {profile.followUpsPerShipment !== null && profile.followUpsPerShipment > 0 && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span>~{Math.round(profile.followUpsPerShipment * 10) / 10} follow-ups per shipment</span>
            </div>
          )}

          {profile.commonMissingItems.length > 0 && (
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="flex flex-wrap items-center gap-1">
                Often missing:
                {profile.commonMissingItems.map(item => (
                  <Badge key={item} variant="outline" className="px-1 py-0 text-[10px] font-normal text-amber-200/90 border-amber-800/40">
                    {item}
                  </Badge>
                ))}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
