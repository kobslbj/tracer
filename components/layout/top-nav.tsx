'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/intake', label: 'New Shipment' },
  { href: '/dashboard', label: 'Dashboard' },
]

export function TopNav() {
  const pathname = usePathname()
  const { state } = useStore()

  const activeCount = state.entries.filter(
    e => e.status === 'Review' || e.status === 'Filing'
  ).length

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
        {/* Brand */}
        <Link href="/intake" className="flex items-center gap-2 shrink-0">
          <Image src="/tracerlogo.png" alt="Tracer" width={28} height={28} className="rounded-sm" />
          <span className="text-[15px] font-semibold tracking-tight">Tracer</span>
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          {navItems.map(({ href, label }) => {
            const active = pathname === href || (href === '/intake' && pathname === '/')
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
                {active && (
                  <span className="absolute inset-x-2 bottom-[-11px] h-px bg-linear-to-r from-transparent via-primary to-transparent" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Right: live status */}
        <div className="ml-auto flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="tabular-nums">
            {activeCount > 0 ? `${activeCount} active` : 'Live'}
          </span>
        </div>
      </div>
    </header>
  )
}
