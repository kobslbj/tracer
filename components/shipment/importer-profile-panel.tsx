'use client'

import {
  ImporterProfile,
  formatAgencyPattern,
  formatMissingPattern,
} from '@/lib/importer-profile'
import { cn } from '@/lib/utils'
import { ArrowRight, Building2, FileWarning, Package, ShieldAlert, Users } from 'lucide-react'

interface ImporterProfilePanelProps {
  profile: ImporterProfile | null
  importerName: string
  /**
   * Shipments required before showing history. The modal views a saved entry
   * that counts itself (needs 2); intake views an unsaved draft where every
   * match is a prior shipment (pass 1).
   */
  minShipmentsForHistory?: number
  className?: string
}

export function ImporterProfilePanel({
  profile,
  importerName,
  minShipmentsForHistory = 2,
  className,
}: ImporterProfilePanelProps) {
  if (!importerName.trim()) return null

  const hasHistory = profile !== null && profile.shipmentCount >= minShipmentsForHistory
  const hasPatterns =
    hasHistory &&
    (profile.missingDocPatterns.length > 0 ||
      profile.agencyPatterns.length > 0 ||
      profile.typicalSuppliers.length > 0 ||
      profile.commonProducts.length > 0)

  return (
    <div className={cn('rounded-lg border border-border bg-card/40 px-3 py-2.5', className)}>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Historical coordination patterns
      </p>

      <div className="flex items-center gap-2 text-xs text-foreground">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        <span className="font-medium">{profile?.importerName || importerName}</span>
        {hasHistory && (
          <span className="text-[11px] text-muted-foreground">
            · {profile.shipmentCount} shipment{profile.shipmentCount === 1 ? '' : 's'} on record
          </span>
        )}
      </div>

      {!hasHistory ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          First shipment for this importer — no history yet.
        </p>
      ) : !hasPatterns ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          No recurring patterns yet across {profile.shipmentCount} shipments.
        </p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {profile.missingDocPatterns.map(pattern => (
            <div key={pattern.label} className="flex items-start gap-2 text-[11px] text-amber-200/90">
              <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{formatMissingPattern(pattern)}</span>
            </div>
          ))}

          {profile.agencyPatterns.map(pattern => (
            <div key={pattern.agency} className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{formatAgencyPattern(pattern)}</span>
            </div>
          ))}

          {profile.typicalSuppliers.length > 0 && (
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Typical suppliers:{' '}
                <span className="text-foreground/90">{profile.typicalSuppliers.join(', ')}</span>
              </span>
            </div>
          )}

          {profile.commonProducts.length > 0 && (
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <Package className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Common products:{' '}
                <span className="text-foreground/90">{profile.commonProducts.join(', ')}</span>
              </span>
            </div>
          )}

          {profile.suggestedUpfrontActions.map(action => (
            <div key={action} className="flex items-start gap-2 text-[11px] font-medium text-foreground/90">
              <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{action}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
