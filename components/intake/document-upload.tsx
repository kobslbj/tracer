'use client'

import { useRef, useState, DragEvent } from 'react'
import { Button } from '@/components/ui/button'
import { DocType, DOC_LABELS, OptionalDocType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { FileText, UploadCloud, X, ScanLine, Package, Receipt } from 'lucide-react'

const ACCEPT = '.pdf,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf'
const MAX_BYTES = 15 * 1024 * 1024

export interface DocumentUploadPayload {
  required: Record<DocType, File>
  optional: Partial<Record<OptionalDocType, File>>
}

interface DocumentUploadProps {
  onAnalyze: (payload: DocumentUploadPayload) => void
  disabled: boolean
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function validateFile(file: File): string | null {
  const okType = /pdf$|image\/(png|jpe?g)$/i.test(file.type) || /\.(pdf|png|jpe?g)$/i.test(file.name)
  if (!okType) return 'Unsupported file type. Use PDF, PNG or JPG.'
  if (file.size > MAX_BYTES) return 'File too large (max 15MB for this POC).'
  return null
}

function RequiredPicker({
  docType,
  file,
  disabled,
  onPick,
  onClear,
  error,
}: {
  docType: DocType
  file: File | null
  disabled: boolean
  onPick: (file: File) => void
  onClear: () => void
  error: string | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const icon = docType === 'commercial_invoice'
    ? <Receipt className="h-4 w-4" />
    : <Package className="h-4 w-4" />

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) onPick(dropped)
  }

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground">
        {icon}
        {DOC_LABELS[docType]}
        <span className="text-red-400">*</span>
      </p>
      {file ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/15 px-3 py-2">
          <FileText className="h-4 w-4 shrink-0 text-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
          </div>
          {!disabled && (
            <button type="button" onClick={onClear} className="rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => !disabled && inputRef.current?.click()}
          onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) inputRef.current?.click() }}
          onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            'flex w-full cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/40',
            dragging ? 'border-primary/70 bg-primary/5' : 'border-border',
            disabled && 'pointer-events-none opacity-60',
          )}
        >
          <UploadCloud className="h-4 w-4" />
          Drop or browse
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        disabled={disabled}
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) onPick(f)
          e.target.value = ''
        }}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  )
}

export function DocumentUpload({ onAnalyze, disabled }: DocumentUploadProps) {
  const [required, setRequired] = useState<Record<DocType, File | null>>({
    packing_list: null,
    commercial_invoice: null,
  })
  const [errors, setErrors] = useState<Record<string, string | null>>({})

  function assignRequired(docType: DocType, file: File) {
    const err = validateFile(file)
    if (err) { setErrors(p => ({ ...p, [docType]: err })); return }
    setErrors(p => ({ ...p, [docType]: null }))
    setRequired(p => ({ ...p, [docType]: file }))
  }

  const ready = !!required.packing_list && !!required.commercial_invoice

  return (
    <div className="rounded-xl border border-border bg-card/60 p-5 backdrop-blur-sm space-y-5">
      <div>
        <p className="text-sm font-medium text-foreground">Commercial Invoice + Packing List</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          PDF, PNG or JPG · max 15MB per file · pre-filing review only
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(['commercial_invoice', 'packing_list'] as DocType[]).map(docType => (
          <RequiredPicker
            key={docType}
            docType={docType}
            file={required[docType]}
            disabled={disabled}
            onPick={f => assignRequired(docType, f)}
            onClear={() => setRequired(p => ({ ...p, [docType]: null }))}
            error={errors[docType] ?? null}
          />
        ))}
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => {
            if (!ready) return
            onAnalyze({
              required: {
                packing_list: required.packing_list!,
                commercial_invoice: required.commercial_invoice!,
              },
              optional: {},
            })
          }}
          disabled={!ready || disabled}
          size="lg"
          className="gap-1.5 bg-primary text-primary-foreground shadow-[0_0_18px_-6px_var(--color-primary)] hover:bg-primary/90"
        >
          <ScanLine className="h-4 w-4" />
          Start pre-filing review
        </Button>
      </div>
    </div>
  )
}
