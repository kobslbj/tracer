'use client'

import { useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Zap } from 'lucide-react'

interface ShipmentInputProps {
  onSubmit: (input: string) => void
  disabled: boolean
}

const PLACEHOLDER = `Describe your shipment in natural language...

Examples:
• "500 units of lithium battery cells from Shenzhen, China, FOB $28,500, arriving LAX"
• "Cotton knit t-shirts, 2000 pcs, Bangladesh origin, CIF $12,000, port JFK"
• "Industrial ceramic refractory bricks from Mexico, 800kg, DAP $4,200"`

export function ShipmentInput({ onSubmit, disabled }: ShipmentInputProps) {
  const [value, setValue] = useState('')

  function handleSubmit() {
    if (!value.trim() || disabled) return
    onSubmit(value.trim())
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={PLACEHOLDER}
        disabled={disabled}
        rows={6}
        className="resize-none text-sm bg-card border-border placeholder:text-muted-foreground/50 focus-visible:ring-primary"
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
        }}
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">⌘ + Enter to submit</p>
        <Button
          onClick={handleSubmit}
          disabled={!value.trim() || disabled}
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Zap className="w-4 h-4" />
          Deploy Replica Team
        </Button>
      </div>
    </div>
  )
}
