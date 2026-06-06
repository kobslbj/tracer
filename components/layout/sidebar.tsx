'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Package, Activity } from 'lucide-react'

export function Sidebar() {
  const pathname = usePathname()
  const { state } = useStore()

  const reviewCount = state.entries.filter(e => e.status === 'Review').length
  const filingCount = state.entries.filter(e => e.status === 'Filing').length

  const navItems = [
    { href: '/intake', label: 'New Shipment', icon: Package },
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ]

  return (
    <aside className="w-60 shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Activity className="w-4 h-4 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-bold tracking-tight text-sidebar-foreground">
            Traceer
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              pathname === href || (href === '/intake' && pathname === '/')
                ? 'bg-sidebar-accent text-sidebar-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Status dots */}
      <div className="p-4 border-t border-sidebar-border space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Active
        </p>
        {reviewCount > 0 && (
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              <span className="text-muted-foreground">Review</span>
            </div>
            <span className="text-sidebar-foreground font-medium">{reviewCount}</span>
          </div>
        )}
        {filingCount > 0 && (
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
              <span className="text-muted-foreground">Filing</span>
            </div>
            <span className="text-sidebar-foreground font-medium">{filingCount}</span>
          </div>
        )}
        {reviewCount === 0 && filingCount === 0 && (
          <p className="text-xs text-muted-foreground">No active entries</p>
        )}
      </div>
    </aside>
  )
}
