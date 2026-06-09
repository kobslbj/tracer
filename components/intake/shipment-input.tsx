'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowUp } from 'lucide-react'

interface ShipmentInputProps {
  onSubmit: (input: string) => void
  disabled: boolean
}

const PLACEHOLDER =
  'Describe your shipment in natural language — e.g. "500 units of lithium battery cells from Shenzhen, China, FOB $28,500, arriving LAX"'

const EXAMPLES: { label: string; value: string }[] = [
  {
    label: 'Taiwan PCBs → LAX',
    value: '3,000 multilayer printed circuit boards manufactured in Taiwan for a US networking OEM, FOB Kaohsiung $46,000, arriving LAX',
  },
  {
    label: 'Taiwan semiconductors → SEA',
    value: '5,000 microcontroller ICs from a Taiwan foundry, FOB Hsinchu $120,000, arriving SEA',
  },
  {
    label: 'Taiwan aluminum enclosures → LAX',
    value: 'Aluminum CNC-machined enclosures, contract-manufactured in Taiwan, 2 tons, FOB Taichung $18,500, arriving LAX',
  },
]

export function ShipmentInput({ onSubmit, disabled }: ShipmentInputProps) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!disabled) ref.current?.focus()
  }, [disabled])

  function handleSubmit() {
    if (!value.trim() || disabled) return
    onSubmit(value.trim())
  }

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }

  return (
    <div className="space-y-3">
      <div
        className="composer-glow rounded-xl border border-border bg-card/70 p-2 shadow-sm backdrop-blur-sm"
        onClick={() => ref.current?.focus()}
      >
        <textarea
          ref={ref}
          value={value}
          onChange={e => {
            setValue(e.target.value)
            autoGrow(e.target)
          }}
          placeholder={PLACEHOLDER}
          disabled={disabled}
          rows={3}
          className="w-full resize-none bg-transparent px-3 py-2 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50 disabled:opacity-50"
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
          }}
        />
        <div className="flex items-center justify-between gap-3 px-1.5 pb-1 pt-1">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Manual entry — use when documents aren&apos;t available yet
          </span>
          <div className="flex items-center gap-2.5">
            <kbd className="hidden rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
              ⌘ ↵
            </kbd>
            <Button
              onClick={handleSubmit}
              disabled={!value.trim() || disabled}
              size="sm"
              className="h-8 gap-1.5 rounded-lg bg-primary px-3 text-primary-foreground shadow-[0_0_18px_-6px_var(--color-primary)] hover:bg-primary/90"
            >
              Start review
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map(ex => (
          <button
            key={ex.label}
            type="button"
            title={ex.value}
            disabled={disabled}
            onClick={() => {
              setValue(ex.value)
              const el = ref.current
              if (el) {
                el.focus()
                requestAnimationFrame(() => autoGrow(el))
              }
            }}
            className="rounded-full border border-border/70 bg-card/40 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-40"
          >
            {ex.label}
          </button>
        ))}
      </div>
    </div>
  )
}
