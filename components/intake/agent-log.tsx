'use client'

import { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'

interface AgentLogProps {
  lines: string[]
}

export function AgentLog({ lines }: AgentLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  if (lines.length === 0) return null

  return (
    <ScrollArea className="h-20 mt-3">
      <div className="space-y-0.5 font-mono text-[11px] text-muted-foreground pr-3">
        {lines.map((line, i) => (
          <div key={i} className="leading-relaxed">{line}</div>
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
