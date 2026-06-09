'use client'

import { IssueCitation } from '@/lib/types'
import { CITATION_SOURCE_LABELS } from '@/lib/citations'
import { cn } from '@/lib/utils'

interface CitationListProps {
  citations: IssueCitation[]
  className?: string
  quoteClassName?: string
}

export function CitationList({ citations, className, quoteClassName }: CitationListProps) {
  if (citations.length === 0) return null

  return (
    <ul className={cn('mt-1 space-y-1', className)}>
      {citations.map((c, i) => (
        <li key={i} className="text-[11px] leading-snug">
          {c.quote ? (
            <>
              <span className={cn('text-foreground/85', quoteClassName)}>
                &ldquo;{c.quote.length > 120 ? c.quote.slice(0, 117) + '…' : c.quote}&rdquo;
              </span>
              <span className="text-muted-foreground/50"> → </span>
            </>
          ) : null}
          <span className="text-muted-foreground">
            {CITATION_SOURCE_LABELS[c.source]}
            {c.location ? `, ${c.location}` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}
